/**
 * Live integration test — calls the deployed worker directly
 * Usage: node scripts/test-live.js
 */

const WORKER_URL = 'https://hemp-discord-bot.eso-toolkit.workers.dev';
const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.DISCORD_APPLICATION_ID || '1481064890054742191';
const GUILD_ID = process.env.DISCORD_TEST_GUILD_ID || '1402343568017723512';
const CHANNEL_ID = process.env.DISCORD_TEST_CHANNEL_ID || '1481115376900378728';

async function run() {
  console.log('=== Hemp Bot Live Integration Tests ===\n');

  // 1. Health check
  console.log('1. Health check...');
  const health = await fetch(WORKER_URL);
  console.log(`   Status: ${health.status} — ${await health.text()}\n`);

  // 2. Test RSS feeds directly
  console.log('2. Testing RSS feeds...');
  const { fetchHempResearch } = await import('../src/research.js');
  const research = await fetchHempResearch();
  console.log(`   Articles found: ${research.articles.length}`);
  if (research.errors) console.warn('   Feed errors:', research.errors);
  research.articles.slice(0, 3).forEach(a => console.log(`   - [${a.source}] ${a.title}`));
  console.log();

  // 3. Post a test message via bot token (Discord REST)
  if (!TOKEN) {
    console.log('3. Skipping Discord post test (no DISCORD_TOKEN set)\n');
  } else {
    console.log('3. Posting test message to #hemp-bot-daily...');
    const msg = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '🤖 **[TEST]** Live integration test — bot is operational!' })
    });
    const msgData = await msg.json();
    console.log(`   Message sent: ${msg.ok ? '✅' : '❌'} (ID: ${msgData.id || msgData.message})\n`);

    // 4. Create thread on test message
    if (msg.ok) {
      console.log('4. Creating test thread...');
      const thread = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages/${msgData.id}/threads`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '🧵 Test Thread', auto_archive_duration: 60, type: 11 })
      });
      const threadData = await thread.json();
      console.log(`   Thread created: ${thread.ok ? '✅' : '❌'} (ID: ${threadData.id || threadData.message})\n`);
    }
  }

  console.log('=== Tests complete ===');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
