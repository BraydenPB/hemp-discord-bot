import { verifyKey } from './verify.js';
import { fetchHempResearch } from './research.js';
import { generateDiscussionPrompt } from './discussion.js';
import { generateCategoryBrief, buildCategoryEmbed, generateDailyBrief, buildBriefEmbed } from './summarize.js';
import { runCommunityPulse } from './pulse.js';
import { DAILY_ROTATION, SCHEDULE, COLORS } from './config.js';

const DISCORD_API = 'https://discord.com/api/v10';

export default {
  async fetch(request, env, ctx) {
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
    await postDiscussion(env);
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

  await postToChannel(channelId, { embeds: [embed] }, env.DISCORD_TOKEN);
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
  const prompt = await generateDiscussionPrompt(env);

  const msgRes = await postToChannel(channelId, { content: prompt.question }, env.DISCORD_TOKEN);
  if (!msgRes.ok) throw new Error(`Failed to post message: ${await msgRes.text()}`);

  const msg = await msgRes.json();

  const threadRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${msg.id}/threads`, {
    method: 'POST',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: prompt.threadTitle, auto_archive_duration: 1440, type: 11 }),
  });

  if (!threadRes.ok) {
    console.warn('Thread creation failed:', await threadRes.text());
    return;
  }

  await env.HEMP_KV.put('last_discussion', new Date().toISOString());
  console.log('Discussion posted');
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
        const [lastResearch, lastDiscussion, lastPulse] = await Promise.all([
          env.HEMP_KV.get('last_research'),
          env.HEMP_KV.get('last_discussion'),
          env.HEMP_KV.get('last_pulse'),
        ]);
        const today = new Date().getUTCDay();
        const todayLabel = DAILY_ROTATION[today] ?? 'off';
        return Response.json({
          type: 4,
          data: {
            embeds: [{
              title: 'Bot Status',
              color: COLORS.discussion,
              fields: [
                { name: 'Last Research', value: lastResearch ? fmtTs(lastResearch) : 'Never', inline: true },
                { name: 'Last Discussion', value: lastDiscussion ? fmtTs(lastDiscussion) : 'Never', inline: true },
                { name: 'Last Pulse', value: lastPulse ? fmtTs(lastPulse) : 'Never', inline: true },
                { name: 'Today\'s Post', value: todayLabel, inline: true },
              ],
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
