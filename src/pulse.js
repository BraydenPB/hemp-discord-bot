/**
 * Community Pulse — ephemeral Discord message analysis.
 *
 * Reads configured channels since the last cursor, extracts aggregated
 * signals (vendors, cultivars, quality terms, themes), generates an AI
 * summary, and builds a Discord embed. Raw message content is never
 * persisted and is discarded after summarization.
 */

import {
  KNOWN_VENDORS, KNOWN_CULTIVARS, QUALITY_DESCRIPTORS,
  PULSE_CURSOR_PREFIX, AI_API_URL, AI_MODEL, COLORS,
} from './config.js';

// ─── Discord message fetching ───────────────────────────────────────

const DISCORD_API = 'https://discord.com/api/v10';
const MAX_MESSAGES_PER_REQUEST = 100; // Discord API limit
const MAX_PAGES = 5; // safety cap: 500 messages per channel per run

/**
 * Fetch messages from a channel since a given message ID (exclusive).
 * Returns an array of { content, timestamp } objects — no author info retained.
 */
async function fetchMessagesSince(channelId, afterMessageId, token) {
  const messages = [];
  let afterId = afterMessageId;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(MAX_MESSAGES_PER_REQUEST),
    });
    if (afterId) params.set('after', afterId);

    let res = await fetch(
      `${DISCORD_API}/channels/${channelId}/messages?${params}`,
      { headers: { Authorization: `Bot ${token}` } }
    );

    // Retry once on rate limit (429)
    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get('Retry-After') || '2') * 1000;
      console.log(`Pulse: rate limited on ch ${channelId}, waiting ${retryAfter}ms`);
      await new Promise(r => setTimeout(r, Math.min(retryAfter, 10000)));
      res = await fetch(
        `${DISCORD_API}/channels/${channelId}/messages?${params}`,
        { headers: { Authorization: `Bot ${token}` } }
      );
    }

    if (!res.ok) {
      console.error(`Pulse: failed to fetch ch ${channelId}: ${res.status}`);
      break;
    }

    const batch = await res.json();
    if (!batch.length) break;

    // Discord returns newest-first; we reverse so oldest is first
    batch.reverse();

    for (const msg of batch) {
      // Only keep text content — strip author info immediately
      if (msg.content?.trim()) {
        messages.push({ content: msg.content, timestamp: msg.timestamp });
      }
    }

    // Track the newest ID for pagination
    // batch is now oldest-first after reverse, so last element is newest
    afterId = batch[batch.length - 1].id;

    if (batch.length < MAX_MESSAGES_PER_REQUEST) break; // no more pages
  }

  return { messages, newestId: afterId };
}

// ─── Signal extraction ──────────────────────────────────────────────

/**
 * Count mentions of known terms in a body of text.
 * Returns sorted array of { name, count }.
 */
function countMentions(texts, knownTerms) {
  const counts = new Map();
  const lower = texts.map(t => t.toLowerCase());

  for (const term of knownTerms) {
    let total = 0;
    const termLower = term.toLowerCase();
    for (const text of lower) {
      // Use word-boundary-ish matching: check the term appears as a substring
      // For multi-word terms this is fine; for single words we add boundary check
      if (termLower.includes(' ')) {
        if (text.includes(termLower)) total++;
      } else {
        // Single-word: basic word boundary via regex
        const re = new RegExp(`\\b${escapeRegex(termLower)}\\b`);
        if (re.test(text)) total++;
      }
    }
    if (total > 0) counts.set(term, total);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Count quality descriptors and tag each with basic sentiment.
 */
function countQualityTerms(texts) {
  const positive = new Set([
    'loud', 'dank', 'frosty', 'sticky', 'terpy', 'smooth',
    'clean ash', 'white ash', 'great cure', 'nice nose',
    'dense', 'chunky', 'fresh', 'potent', 'fire',
    'beautiful', 'gorgeous', 'dialed in',
  ]);

  const raw = countMentions(texts, QUALITY_DESCRIPTORS);
  return raw.map(item => ({
    term: item.name,
    count: item.count,
    sentiment: positive.has(item.name.toLowerCase()) ? 'positive' : 'negative',
  }));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Aggregation ────────────────────────────────────────────────────

/**
 * Build the full aggregation object from raw messages.
 * This is the ONLY place raw content is used. After this function returns,
 * the caller should discard the raw messages array.
 */
export function aggregateMessages(messages, channelIds) {
  const texts = messages.map(m => m.content);
  const timestamps = messages.map(m => m.timestamp).filter(Boolean).sort();

  return {
    window: {
      start: timestamps[0] || new Date().toISOString(),
      end: timestamps[timestamps.length - 1] || new Date().toISOString(),
    },
    messageCount: messages.length,
    channelsRead: channelIds,
    vendors: countMentions(texts, KNOWN_VENDORS).slice(0, 10),
    cultivars: countMentions(texts, KNOWN_CULTIVARS).slice(0, 10),
    qualityTerms: countQualityTerms(texts).slice(0, 12),
    // themes are generated by AI later
    themes: [],
  };
}

// ─── AI summary ─────────────────────────────────────────────────────

const PULSE_SYSTEM_PROMPT = `You are a sharp, grounded member of a private hemp flower Discord — think someone who's tried dozens of vendors, cares about cure quality and terpene profiles, and keeps up with every drop.

You're writing a brief "Community Pulse" summary of what the server has been talking about. Your job:
- Highlight which vendors and cultivars are getting attention and why.
- Note quality impressions (positive or negative) — frosty nugs, hay smell, great cure, seeded batches, etc.
- Identify 2-4 distinct themes or conversations (e.g. "cure complaints about X", "hype around Y's new indoor drop", "debate about THCA vs CBD flower").
- Keep it conversational and opinionated but fair — like a community regular catching someone up, not a news anchor.
- Do NOT quote individual users or use usernames.
- Do NOT use bullet points or markdown formatting — write in short, natural paragraphs.
- Keep it under 200 words.
- If there's very little activity, say so briefly — don't pad.`;

/**
 * Generate an AI-powered summary from aggregated pulse data.
 */
export async function generatePulseSummary(aggregation, apiKey) {
  if (aggregation.messageCount === 0) {
    return 'Quiet period — not much chatter since the last check.';
  }

  const digest = buildPulseDigest(aggregation);

  const res = await fetch(AI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 300,
      temperature: 0.75,
      messages: [
        { role: 'system', content: PULSE_SYSTEM_PROMPT },
        { role: 'user', content: digest },
      ],
    }),
  });

  if (!res.ok) {
    console.error('Pulse AI summary failed:', res.status);
    return null;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

function buildPulseDigest(agg) {
  const lines = [`${agg.messageCount} messages across ${agg.channelsRead.length} channel(s).`];

  if (agg.vendors.length) {
    lines.push('\nTop mentioned vendors:');
    agg.vendors.slice(0, 8).forEach(v => lines.push(`  ${v.name} (${v.count})`));
  }

  if (agg.cultivars.length) {
    lines.push('\nTop mentioned cultivars:');
    agg.cultivars.slice(0, 8).forEach(c => lines.push(`  ${c.name} (${c.count})`));
  }

  if (agg.qualityTerms.length) {
    const pos = agg.qualityTerms.filter(q => q.sentiment === 'positive');
    const neg = agg.qualityTerms.filter(q => q.sentiment === 'negative');
    if (pos.length) {
      lines.push('\nPositive quality mentions:');
      pos.slice(0, 6).forEach(q => lines.push(`  ${q.term} (${q.count})`));
    }
    if (neg.length) {
      lines.push('\nNegative quality mentions:');
      neg.slice(0, 6).forEach(q => lines.push(`  ${q.term} (${q.count})`));
    }
  }

  lines.push('\nWrite a conversational summary capturing the vibe and key topics.');
  return lines.join('\n');
}

// ─── Embed builder ──────────────────────────────────────────────────

/**
 * Build a Discord embed for the Community Pulse.
 */
export function buildPulseEmbed(aggregation, summary) {
  const fields = [];

  if (aggregation.vendors.length) {
    fields.push({
      name: 'Vendors Getting Buzz',
      value: aggregation.vendors.slice(0, 5)
        .map(v => `**${v.name}** (${v.count})`)
        .join(' · '),
      inline: false,
    });
  }

  if (aggregation.cultivars.length) {
    fields.push({
      name: 'Cultivars in the Mix',
      value: aggregation.cultivars.slice(0, 5)
        .map(c => `**${c.name}** (${c.count})`)
        .join(' · '),
      inline: false,
    });
  }

  if (aggregation.qualityTerms.length) {
    const terms = aggregation.qualityTerms.slice(0, 8)
      .map(q => {
        const icon = q.sentiment === 'positive' ? '+' : '-';
        return `${icon} ${q.term} (${q.count})`;
      })
      .join(' · ');
    fields.push({
      name: 'Quality Chatter',
      value: terms,
      inline: false,
    });
  }

  return {
    title: 'Community Pulse',
    description: summary || '_No summary available._',
    color: COLORS.pulse,
    fields,
    footer: {
      text: `${aggregation.messageCount} messages · ${new Date(aggregation.window.start).toUTCString()} → ${new Date(aggregation.window.end).toUTCString()}`,
    },
  };
}

// ─── Main pipeline ──────────────────────────────────────────────────

/**
 * Run the full Community Pulse pipeline:
 * 1. Read messages from configured channels since last cursor
 * 2. Aggregate signals
 * 3. Generate AI summary
 * 4. Build embed
 * 5. Post to output channel
 * 6. Update cursors
 * 7. Discard raw messages
 *
 * @param {Object} env — Worker env bindings
 * @returns {Object|null} — the embed that was posted, or null if skipped
 */
export async function runCommunityPulse(env) {
  const sourceChannelIds = (env.PULSE_SOURCE_CHANNEL_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  const outputChannelId = env.PULSE_CHANNEL_ID || env.RESEARCH_CHANNEL_ID || env.DISCORD_TEST_CHANNEL_ID;

  if (!sourceChannelIds.length) {
    console.log('Pulse: no source channels configured — skipping');
    return null;
  }

  if (!outputChannelId) {
    console.log('Pulse: no output channel configured — skipping');
    return null;
  }

  console.log(`Pulse: reading ${sourceChannelIds.length} channel(s)...`);

  // Step 1: Fetch messages from each channel since last cursor
  let allMessages = [];
  const newCursors = {};

  for (const channelId of sourceChannelIds) {
    const cursorKey = `${PULSE_CURSOR_PREFIX}${channelId}`;
    const lastCursor = await env.HEMP_KV.get(cursorKey);

    const { messages, newestId } = await fetchMessagesSince(
      channelId, lastCursor, env.DISCORD_TOKEN
    );

    allMessages = allMessages.concat(messages);
    if (newestId) newCursors[channelId] = { key: cursorKey, value: newestId };
  }

  console.log(`Pulse: collected ${allMessages.length} messages total`);

  // Step 2: Aggregate — raw content is consumed here
  const aggregation = aggregateMessages(allMessages, sourceChannelIds);

  // Step 3: Immediately discard raw messages
  allMessages = null;

  // Step 4: Skip posting if very low activity
  if (aggregation.messageCount < 3) {
    console.log('Pulse: too few messages to post — updating cursors only');
    await updateCursors(env, newCursors);
    return null;
  }

  // Step 5: Generate AI summary
  let summary = null;
  if (env.TOGETHER_API_KEY) {
    try {
      summary = await generatePulseSummary(aggregation, env.TOGETHER_API_KEY);
    } catch (err) {
      console.error('Pulse: AI summary failed:', err.message);
    }
  }

  // Step 6: Build and post embed
  const embed = buildPulseEmbed(aggregation, summary);

  const res = await fetch(`${DISCORD_API}/channels/${outputChannelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    console.error('Pulse: failed to post embed:', await res.text());
  } else {
    console.log('Pulse: posted successfully');
  }

  // Step 7: Update cursors
  await updateCursors(env, newCursors);
  await env.HEMP_KV.put('last_pulse', new Date().toISOString());

  return embed;
}

async function updateCursors(env, cursors) {
  for (const [channelId, cursor] of Object.entries(cursors)) {
    await env.HEMP_KV.put(cursor.key, cursor.value);
  }
}
