import { verifyKey } from './verify.js';
import { fetchHempResearch } from './research.js';
import { generateDiscussionPrompt } from './discussion.js';

export default {
  async fetch(request, env) {
    // Handle Discord Interactions (slash commands, webhooks)
    if (request.method === 'POST') {
      const signature = request.headers.get('X-Signature-Ed25519');
      const timestamp = request.headers.get('X-Signature-Timestamp');
      const body = await request.arrayBuffer();

      if (!await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY)) {
        return new Response('Invalid signature', { status: 401 });
      }

      const message = JSON.parse(new TextDecoder().decode(body));

      // PING - Discord verification
      if (message.type === 1) {
        return Response.json({ type: 1 });
      }

      // Handle slash commands
      if (message.type === 2) {
        return handleCommand(message, env);
      }
    }

    return new Response('Hemp Discord Bot is running', { status: 200 });
  },

  // Cron Trigger - Runs on schedule
  async scheduled(event, env, ctx) {
    const now = new Date();
    const hourUTC = now.getUTCHours();

    console.log(`Cron triggered at ${now.toISOString()} (Hour UTC: ${hourUTC})`);

    // 11:00 UTC = 6am CDT - Research task
    if (hourUTC === 11) {
      ctx.waitUntil(runResearchTask(env));
    }

    // 13:00 UTC = 8am CDT - Discussion post
    if (hourUTC === 13) {
      ctx.waitUntil(postDiscussion(env));
    }
  }
};

async function handleCommand(interaction, env) {
  const command = interaction.data.name;

  switch (command) {
    case 'ping':
      return Response.json({
        type: 4,
        data: { content: 'Pong! Hemp bot is operational.' }
      });

    case 'research':
      // Manual trigger for research
      const research = await fetchHempResearch();
      return Response.json({
        type: 4,
        data: {
          content: `**Latest Hemp Industry Research**\n\n${research.summary}`,
          flags: 64 // Ephemeral
        }
      });

    case 'test-discussion':
      // Test the discussion post
      await postDiscussion(env);
      return Response.json({
        type: 4,
        data: { content: 'Discussion post triggered! Check the channel.', flags: 64 }
      });

    case 'status':
      const lastResearch = await env.HEMP_KV.get('last_research');
      const lastDiscussion = await env.HEMP_KV.get('last_discussion');
      return Response.json({
        type: 4,
        data: {
          content: `**Bot Status**\n- Last Research: ${lastResearch || 'Never'}\n- Last Discussion: ${lastDiscussion || 'Never'}`,
          flags: 64
        }
      });

    default:
      return Response.json({
        type: 4,
        data: { content: 'Unknown command', flags: 64 }
      });
  }
}

async function runResearchTask(env) {
  console.log('Running hemp industry research...');

  try {
    const research = await fetchHempResearch();

    // Store research for discussion task
    await env.HEMP_KV.put('latest_research', JSON.stringify(research), {
      expirationTtl: 86400 // 24 hours
    });
    await env.HEMP_KV.put('last_research', new Date().toISOString());

    console.log('Research completed and stored');
  } catch (error) {
    console.error('Research task failed:', error);
  }
}

async function postDiscussion(env) {
  console.log('Posting daily discussion...');

  const channelId = env.DISCORD_TEST_CHANNEL_ID;
  const researchData = await env.HEMP_KV.get('latest_research');
  const research = researchData ? JSON.parse(researchData) : null;

  const prompt = await generateDiscussionPrompt(research);

  try {
    // Create the main message
    const messageResponse = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: prompt.message
        })
      }
    );

    if (!messageResponse.ok) {
      throw new Error(`Failed to post message: ${await messageResponse.text()}`);
    }

    const message = await messageResponse.json();

    // Create a public thread on the message
    const threadResponse = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${message.id}/threads`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: prompt.threadTitle,
          auto_archive_duration: 1440, // 24 hours
          type: 11 // Public thread
        })
      }
    );

    if (!threadResponse.ok) {
      throw new Error(`Failed to create thread: ${await threadResponse.text()}`);
    }

    const thread = await threadResponse.json();

    // Send first message in thread
    await fetch(
      `https://discord.com/api/v10/channels/${thread.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: prompt.threadStart
        })
      }
    );

    await env.HEMP_KV.put('last_discussion', new Date().toISOString());
    console.log('Discussion posted successfully');
  } catch (error) {
    console.error('Failed to post discussion:', error);
  }
}
