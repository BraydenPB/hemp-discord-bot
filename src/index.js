import { verifyKey } from './verify.js';
import { fetchHempResearch } from './research.js';
import { generateDiscussionPrompt } from './discussion.js';
import { generateCategoryBrief, buildCategoryEmbed, generateDailyBrief, buildBriefEmbed, mdLink } from './summarize.js';

// Mon–Thu: one research category per day. Fri: community discussion. Sat/Sun: off.
const DAILY_ROTATION = {
  1: 'news',        // Monday
  2: 'legislation', // Tuesday
  3: 'studies',     // Wednesday
  4: 'trials',      // Thursday
  5: 'discussion',  // Friday
};

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

    return new Response('Hemp Discord Bot is running', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    const now = new Date();
    const hourUTC = now.getUTCHours();
    const dayUTC  = now.getUTCDay(); // 0=Sun … 6=Sat
    console.log(`Cron fired — UTC hour ${hourUTC}, day ${dayUTC}`);

    // 11:00 UTC = 6am CDT — daily content post
    if (hourUTC === 11) {
      ctx.waitUntil(postDailyContent(env, dayUTC));
    }
  }
};

// Routes each weekday to the right post type
async function postDailyContent(env, dayOfWeek) {
  const category = DAILY_ROTATION[dayOfWeek];
  if (!category) {
    console.log('Weekend — no post scheduled');
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

// Filters out previously posted items and shuffles the remainder
async function getUnseenItems(env, category, items) {
  const key = `seen_${category}`;
  const raw = await env.HEMP_KV.get(key);
  const seen = new Set(raw ? JSON.parse(raw) : []);

  const unseen = items.filter(i => !seen.has(i.link));

  // Shuffle so we don't always show the same "top N" on slow news days
  const pool = unseen.length ? shuffle(unseen) : shuffle(items);
  const chosen = pool.slice(0, 5);

  const updatedSeen = [...seen, ...chosen.map(i => i.link)].slice(-200);
  await env.HEMP_KV.put(key, JSON.stringify(updatedSeen));
  return chosen;
}

function shuffle(arr) {
  return arr
    .map(v => ({ v, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.v);
}

// Posts a single focused category embed with an AI intro
async function postCategoryDigest(env, category, research) {
  const channelId = env.DISCORD_TEST_CHANNEL_ID;
  const items = research[category] ?? [];

  if (!items.length) {
    console.log(`No ${category} data found — skipping post`);
    return;
  }

  const filtered = await getUnseenItems(env, category, items);

  let brief = null;
  if (env.TOGETHER_API_KEY) {
    try {
      brief = await generateCategoryBrief(category, filtered, env.TOGETHER_API_KEY);
    } catch (err) {
      console.error('AI brief failed:', err.message);
    }
  }

  const embed = buildCategoryEmbed(category, filtered, research.fetchedAt, brief);
  if (!embed) return;

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });

  if (!res.ok) console.error('Failed to post category digest:', await res.text());
  else console.log(`✅ ${category} posted`);
}

// --- Slash commands ---

async function handleCommand(interaction, env, ctx) {
  const command = interaction.data.name;

  try {
    switch (command) {
      case 'ping':
        return Response.json({
          type: 4,
          data: { content: '🌿 Pong! Hemp bot is operational.' }
        });

      case 'research':
        ctx.waitUntil(deferredResearch(interaction, env));
        return Response.json({ type: 5 });

      case 'test-discussion':
        ctx.waitUntil(deferredTestDiscussion(interaction, env));
        return Response.json({ type: 5, data: { flags: 64 } });

      case 'status': {
        const lastResearch   = await env.HEMP_KV.get('last_research');
        const lastDiscussion = await env.HEMP_KV.get('last_discussion');
        const today = new Date().getUTCDay();
        const todayLabel = DAILY_ROTATION[today] ?? 'off';
        return Response.json({
          type: 4,
          data: {
            embeds: [{
              title: '🌿 Hemp Bot Status',
              color: 0x2d6a4f,
              fields: [
                { name: '📰 Last Research', value: lastResearch   ? formatTimestamp(lastResearch)   : 'Never', inline: true },
                { name: '💬 Last Discussion', value: lastDiscussion ? formatTimestamp(lastDiscussion) : 'Never', inline: true },
                { name: '📅 Today\'s Post', value: todayLabel, inline: true }
              ],
              footer: { text: 'Mon: News · Tue: Legislation · Wed: Studies · Thu: Trials · Fri: Discussion' }
            }],
            flags: 64
          }
        });
      }

      default:
        return Response.json({
          type: 4,
          data: { content: 'Unknown command.', flags: 64 }
        });
    }
  } catch (error) {
    console.error(`Command /${command} failed:`, error);
    return Response.json({
      type: 4,
      data: { content: `❌ Something went wrong. Please try again.`, flags: 64 }
    });
  }
}

// /research — shows all 4 categories in one on-demand view
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
    await followUp(interaction, env, { content: '❌ Failed to fetch hemp research. Try again later.', flags: 64 });
  }
}

async function deferredTestDiscussion(interaction, env) {
  try {
    await postDiscussion(env);
    await followUp(interaction, env, { content: '✅ Discussion posted!', flags: 64 });
  } catch (error) {
    console.error('Deferred /test-discussion failed:', error);
    await followUp(interaction, env, { content: `❌ Failed to post discussion: ${error.message}`, flags: 64 });
  }
}

async function followUp(interaction, env, data) {
  const url = `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) console.error('Follow-up patch failed:', await res.text());
}

async function postDiscussion(env) {
  console.log('Posting weekly discussion...');
  const channelId = env.DISCORD_TEST_CHANNEL_ID;
  const prompt = await generateDiscussionPrompt(env);

  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: prompt.question })
  });

  if (!msgRes.ok) throw new Error(`Failed to post message: ${await msgRes.text()}`);

  const msg = await msgRes.json();

  const threadRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/threads`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: prompt.threadTitle, auto_archive_duration: 1440, type: 11 })
  });

  if (!threadRes.ok) {
    console.warn('Thread creation failed:', await threadRes.text());
    return;
  }

  await env.HEMP_KV.put('last_discussion', new Date().toISOString());
  console.log('Discussion posted successfully');
}

// --- Embed builders ---

// Full 4-category view for /research slash command
function buildResearchEmbeds(research) {
  const embeds = [];
  const ts = { footer: { text: `Updated ${new Date(research.fetchedAt).toUTCString()}` } };

  if (research.news?.length) {
    embeds.push({
      title: '📰 Hemp News',
      color: 0x2a9d8f,
      description: research.news.slice(0, 5).map(a => `• ${mdLink(a.title, a.link)} — *${a.source}*`).join('\n'),
      ...ts
    });
  }

  if (research.legislation?.length) {
    embeds.push({
      title: '⚖️ Legislation & Regulatory',
      color: 0xe76f51,
      fields: research.legislation.slice(0, 5).map(b => ({
        name: `${b.billId} — ${b.status}`,
        value: mdLink(b.title, b.link),
        inline: false
      })),
      ...ts
    });
  }

  if (research.studies?.length) {
    embeds.push({
      title: '🔬 Recent Studies',
      color: 0x457b9d,
      fields: research.studies.slice(0, 4).map(s => ({
        name: s.journal || 'PubMed',
        value: `${mdLink(s.title, s.link)}${s.authors ? `\n*${s.authors}*` : ''}`,
        inline: false
      })),
      ...ts
    });
  }

  if (research.trials?.length) {
    embeds.push({
      title: '🧪 Active Clinical Trials',
      color: 0x9b72cf,
      fields: research.trials.slice(0, 4).map(t => ({
        name: t.org || 'Unknown Org',
        value: `${mdLink(t.title, t.link)}\nStatus: ${t.status}`,
        inline: false
      })),
      ...ts
    });
  }

  return embeds;
}

function formatTimestamp(iso) {
  const d = new Date(iso);
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}
