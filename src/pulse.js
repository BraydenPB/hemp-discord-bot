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
  PULSE_CURSOR_PREFIX, PULSE_MIN_MESSAGES, AI_API_URL, AI_MODEL, COLORS,
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

    if (res.status === 429) {
      console.warn(`Pulse: rate limited on ch ${channelId}, skipping remaining pages`);
      break;
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

  // Sort longest-first so we can deduplicate shorter substrings
  const sorted = [...knownTerms].sort((a, b) => b.length - a.length);

  for (const term of sorted) {
    let total = 0;
    const termLower = term.toLowerCase();
    for (const text of lower) {
      if (termLower.includes(' ')) {
        if (text.includes(termLower)) total++;
      } else {
        const re = new RegExp(`\\b${escapeRegex(termLower)}\\b`);
        if (re.test(text)) total++;
      }
    }
    if (total > 0) counts.set(term, total);
  }

  // Deduplicate: if "mac" matched but only as part of "banana mac", subtract overlap
  for (const [shorter, sCount] of [...counts]) {
    const shorterLower = shorter.toLowerCase();
    for (const [longer] of counts) {
      if (shorter === longer) continue;
      const longerLower = longer.toLowerCase();
      if (!longerLower.includes(shorterLower)) continue;

      let overlap = 0;
      for (const text of lower) {
        const matchesLonger = text.includes(longerLower);
        const matchesShorter = shorterLower.includes(' ')
          ? text.includes(shorterLower)
          : new RegExp(`\\b${escapeRegex(shorterLower)}\\b`).test(text);
        if (matchesLonger && matchesShorter) {
          // Remove the longer term and recheck — if shorter no longer matches, it was a false positive
          const stripped = text.replace(new RegExp(escapeRegex(longerLower), 'g'), '');
          const still = shorterLower.includes(' ')
            ? stripped.includes(shorterLower)
            : new RegExp(`\\b${escapeRegex(shorterLower)}\\b`).test(stripped);
          if (!still) overlap++;
        }
      }
      if (overlap > 0) {
        const adjusted = sCount - overlap;
        if (adjusted <= 0) counts.delete(shorter);
        else counts.set(shorter, adjusted);
      }
    }
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

You're writing a brief "Community Pulse" that does TWO things:
1. Quick snapshot of what's been buzzing (1-2 sentences max — vendors, cultivars, quality vibes).
2. Spark NEW conversation by posing 1-2 provocative questions or hot takes that build on the current buzz. Think "if everyone's hyping vendor X, ask what makes their cure different" or "if people are debating THCA vs CBD, push them to get specific about effects."

Your goal is to get people TALKING, not just recap what they already said.

Rules:
- Lead with the conversation-starter energy, not a summary.
- Be specific — name vendors, cultivars, quality terms from the data.
- Be opinionated but fair. Take a stance or ask a spicy question.
- Do NOT quote individual users or use usernames.
- Do NOT use bullet points or markdown formatting — write in short, punchy paragraphs.
- Keep it under 150 words. Tight and punchy.
- If there's very little activity, throw out a topic to get things going instead.`;

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

  lines.push('\nUse these signals to write a punchy pulse that sparks new discussion. Don\'t just recap — push the conversation forward with a hot take or question.');
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
      name: '🏪 Vendors',
      value: aggregation.vendors.slice(0, 5)
        .map(v => `**${v.name}** ×${v.count}`)
        .join('\n'),
      inline: true,
    });
  }

  if (aggregation.cultivars.length) {
    fields.push({
      name: '🌱 Cultivars',
      value: aggregation.cultivars.slice(0, 5)
        .map(c => `**${c.name}** ×${c.count}`)
        .join('\n'),
      inline: true,
    });
  }

  const pos = aggregation.qualityTerms.filter(q => q.sentiment === 'positive');
  const neg = aggregation.qualityTerms.filter(q => q.sentiment === 'negative');

  if (pos.length || neg.length) {
    // Row break before quality section
    fields.push({ name: '\u200b', value: '\u200b', inline: false });
    if (pos.length) {
      fields.push({
        name: '👍 Good Vibes',
        value: pos.slice(0, 5).map(q => `${q.term} ×${q.count}`).join(' · '),
        inline: true,
      });
    }
    if (neg.length) {
      fields.push({
        name: '👎 Complaints',
        value: neg.slice(0, 5).map(q => `${q.term} ×${q.count}`).join(' · '),
        inline: true,
      });
    }
  }

  // Compact time range for footer
  const start = new Date(aggregation.window.start);
  const end = new Date(aggregation.window.end);
  const fmtShort = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtTime = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
  const range = fmtShort(start) === fmtShort(end)
    ? `${fmtShort(start)}, ${fmtTime(start)} – ${fmtTime(end)} UTC`
    : `${fmtShort(start)} – ${fmtShort(end)} UTC`;

  return {
    title: '📊 Community Pulse',
    description: summary || `${aggregation.messageCount} messages scanned — AI summary unavailable.`,
    color: COLORS.pulse,
    fields,
    footer: { text: `${aggregation.messageCount} msgs · ${range}` },
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
  if (aggregation.messageCount < PULSE_MIN_MESSAGES) {
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
