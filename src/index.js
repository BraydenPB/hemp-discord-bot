import { verifyKey } from './verify.js';
import { fetchHempResearch } from './research.js';
import { generateDiscussionPrompt } from './discussion.js';
import { generateCategoryBrief, buildCategoryEmbed, generateDailyBrief, buildBriefEmbed } from './summarize.js';
import { runCommunityPulse } from './pulse.js';
import { DAILY_ROTATION, SCHEDULE, COLORS } from './config.js';

const DISCORD_API = 'https://discord.com/api/v10';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Manual trigger: GET /trigger?key=<TRIGGER_KEY>&action=discussion|research|pulse
    if (url.pathname === '/trigger' && env.TRIGGER_KEY) {
      if (url.searchParams.get('key') !== env.TRIGGER_KEY) {
        return new Response('Unauthorized', { status: 401 });
      }
      const action = url.searchParams.get('action');
      if (action === 'discussion') {
        ctx.waitUntil(postDiscussion(env));
        return new Response('Discussion triggered');
      }
      if (action === 'pulse') {
        ctx.waitUntil(runPulse(env));
        return new Response('Pulse triggered');
      }
      if (action === 'research') {
        const day = new Date().getUTCDay();
        ctx.waitUntil(postDailyContent(env, day === 0 || day === 6 ? 1 : day));
        return new Response('Research triggered');
      }
      return new Response('Unknown action. Use: discussion, research, pulse', { status: 400 });
    }

    if (request.method === 'POST') {
      const signature = request.headers.get('X-Signature-Ed25519');
      const timestamp = request.headers.get('X-Signature-Timestamp');
      const body = await request.arrayBuffer();

      if (!await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY)) {
        return new Response('Invalid signature', { status: 401 });
      }

      const message = JSON.parse(new TextDecoder().decode(body));

      if (message.type === 1) return Response.json({ type: 1 });
      if (message.type === 2) return handleCommand(message, env, ctx);
    }

    return new Response('Hemp Flower Bot is running', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    const now = new Date();
    const hourUTC = now.getUTCHours();
    const dayUTC  = now.getUTCDay();
    console.log(`Cron fired — UTC hour ${hourUTC}, day ${dayUTC}`);

    // Daily research/discussion post at configured hour
    if (hourUTC === SCHEDULE.RESEARCH_HOUR_UTC) {
      ctx.waitUntil(postDailyContent(env, dayUTC));
    }

    // Community Pulse — weekly
    if (hourUTC === SCHEDULE.PULSE_HOUR_UTC && dayUTC === SCHEDULE.PULSE_DAY_UTC) {
      ctx.waitUntil(runPulse(env));
    }
  },
};

// ─── Scheduled content ──────────────────────────────────────────────

async function postDailyContent(env, dayOfWeek) {
  const category = DAILY_ROTATION[dayOfWeek];
  if (!category) {
    console.log('No post scheduled for this day');
    return;
  }

  if (category === 'discussion') {
    try {
      await postDiscussion(env);
    } catch (err) {
      console.error('Discussion post failed:', err);
      await storeError(env, 'discussion', err.message);
    }
    return;
  }

  console.log(`Posting ${category} for day ${dayOfWeek}...`);
  try {
    const research = await fetchHempResearch();
    await env.HEMP_KV.put('latest_research', JSON.stringify(research), { expirationTtl: 86400 });
    await env.HEMP_KV.put('last_research', new Date().toISOString());
    await postCategoryDigest(env, category, research);
  } catch (err) {
    console.error(`Category post (${category}) failed:`, err);
    await storeError(env, category, err.message);
  }
}

async function postCategoryDigest(env, category, research) {
  const channelId = env.RESEARCH_CHANNEL_ID || env.DISCORD_TEST_CHANNEL_ID;
  const items = research[category] ?? [];

  if (!items.length) {
    console.log(`No ${category} data found — skipping post`);
    return;
  }

  let brief = null;
  if (env.TOGETHER_API_KEY) {
    try {
      brief = await generateCategoryBrief(category, items, env.TOGETHER_API_KEY);
    } catch (err) {
      console.error('AI brief failed:', err.message);
    }
  }

  const embed = buildCategoryEmbed(category, items, research.fetchedAt, brief);
  if (!embed) return;

  const res = await postToChannel(channelId, { embeds: [embed] }, env.DISCORD_TOKEN);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API ${res.status}: ${body}`);
  }
  console.log(`${category} posted`);
}

async function runPulse(env) {
  try {
    await runCommunityPulse(env);
  } catch (err) {
    console.error('Community Pulse failed:', err);
  }
}

async function postDiscussion(env) {
  console.log('Posting weekly discussion...');
  const channelId = env.DISCUSSION_CHANNEL_ID || env.DISCORD_TEST_CHANNEL_ID;
  if (!channelId) throw new Error('No discussion channel configured');

  const prompt = await generateDiscussionPrompt(env);

  const msgRes = await postToChannel(channelId, { content: prompt.question }, env.DISCORD_TOKEN);
  if (!msgRes.ok) {
    const body = await msgRes.text();
    throw new Error(`Discord API ${msgRes.status}: ${body}`);
  }

  const msg = await msgRes.json();

  // Record success — thread creation is best-effort and doesn't undo the post
  await env.HEMP_KV.put('last_discussion', new Date().toISOString());
  console.log('Discussion posted');

  const threadRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${msg.id}/threads`, {
    method: 'POST',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: prompt.threadTitle, auto_archive_duration: 1440, type: 11 }),
  });

  if (!threadRes.ok) {
    console.warn('Thread creation failed (message still posted):', await threadRes.text());
  }
}

// ─── Slash commands ─────────────────────────────────────────────────

async function handleCommand(interaction, env, ctx) {
  const command = interaction.data.name;

  try {
    switch (command) {
      case 'ping':
        return Response.json({
          type: 4,
          data: { content: 'Pong. Bot is operational.' },
        });

      case 'research':
        ctx.waitUntil(deferredResearch(interaction, env));
        return Response.json({ type: 5 });

      case 'pulse':
        ctx.waitUntil(deferredPulse(interaction, env));
        return Response.json({ type: 5 });

      case 'test-discussion':
        ctx.waitUntil(deferredTestDiscussion(interaction, env));
        return Response.json({ type: 5 });

      case 'status': {
        const [lastResearch, lastDiscussion, lastPulse, lastErrorRaw] = await Promise.all([
          env.HEMP_KV.get('last_research'),
          env.HEMP_KV.get('last_discussion'),
          env.HEMP_KV.get('last_pulse'),
          env.HEMP_KV.get('last_error'),
        ]);
        const today = new Date().getUTCDay();
        const todayLabel = DAILY_ROTATION[today] ?? 'off';
        const fields = [
          { name: 'Last Research', value: lastResearch ? fmtTs(lastResearch) : 'Never', inline: true },
          { name: 'Last Discussion', value: lastDiscussion ? fmtTs(lastDiscussion) : 'Never', inline: true },
          { name: 'Last Pulse', value: lastPulse ? fmtTs(lastPulse) : 'Never', inline: true },
          { name: 'Today\'s Post', value: todayLabel, inline: true },
        ];
        let color = COLORS.discussion;
        if (lastErrorRaw) {
          const e = JSON.parse(lastErrorRaw);
          fields.push({ name: '⚠️ Last Error', value: `\`${e.category}\` ${fmtTs(e.when)}\n${e.error.slice(0, 200)}`, inline: false });
          color = 0xe63946;
        }
        return Response.json({
          type: 4,
          data: {
            embeds: [{
              title: 'Bot Status',
              color,
              fields,
              footer: { text: 'Mon: News · Tue: Regulation · Wed: Studies · Thu: Trials · Fri: Discussion · Sat: Pulse' },
            }],
            flags: 64,
          },
        });
      }

      default:
        return Response.json({
          type: 4,
          data: { content: 'Unknown command.', flags: 64 },
        });
    }
  } catch (error) {
    console.error(`Command /${command} failed:`, error);
    return Response.json({
      type: 4,
      data: { content: 'Something went wrong. Try again.', flags: 64 },
    });
  }
}

async function deferredResearch(interaction, env) {
  try {
    const cached = await env.HEMP_KV.get('latest_research');
    const research = cached ? JSON.parse(cached) : await fetchHempResearch();

    if (!cached) {
      await env.HEMP_KV.put('latest_research', JSON.stringify(research), { expirationTtl: 86400 });
    }

    const embeds = buildResearchEmbeds(research);
    await followUp(interaction, env, { embeds, flags: 64 });
  } catch (error) {
    console.error('Deferred /research failed:', error);
    await followUp(interaction, env, { content: 'Failed to fetch research. Try again later.', flags: 64 });
  }
}

async function deferredPulse(interaction, env) {
  try {
    const embed = await runCommunityPulse(env);
    if (embed) {
      await followUp(interaction, env, { content: 'Pulse posted to channel.', flags: 64 });
    } else {
      await followUp(interaction, env, { content: 'Pulse skipped — not enough activity or no channels configured.', flags: 64 });
    }
  } catch (error) {
    console.error('Deferred /pulse failed:', error);
    await followUp(interaction, env, { content: 'Pulse failed. Check logs.', flags: 64 });
  }
}

async function deferredTestDiscussion(interaction, env) {
  try {
    await postDiscussion(env);
    await followUp(interaction, env, { content: 'Discussion posted.', flags: 64 });
  } catch (error) {
    console.error('Deferred /test-discussion failed:', error);
    await followUp(interaction, env, { content: `Failed: ${error.message}`, flags: 64 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

async function storeError(env, category, message) {
  try {
    await env.HEMP_KV.put('last_error', JSON.stringify({
      when: new Date().toISOString(),
      category,
      error: message,
    }));
  } catch (_) { /* don't let KV failure mask the original error */ }
}

async function followUp(interaction, env, data) {
  const url = `${DISCORD_API}/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) console.error('Follow-up patch failed:', await res.text());
}

async function postToChannel(channelId, payload, token) {
  return fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function buildResearchEmbeds(research) {
  const embeds = [];
  for (const category of ['news', 'legislation', 'studies', 'trials']) {
    const items = research[category];
    if (items?.length) {
      const embed = buildCategoryEmbed(category, items, research.fetchedAt, null);
      if (embed) embeds.push(embed);
    }
  }
  return embeds;
}

function fmtTs(iso) {
  const d = new Date(iso);
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}
