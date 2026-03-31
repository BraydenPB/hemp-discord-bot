/**
 * Manually trigger a daily content post against the live channel.
 *
 * Usage:
 *   node scripts/trigger-research.js                  # uses today's rotation
 *   node scripts/trigger-research.js --category news
 *   node scripts/trigger-research.js --category legislation
 *   node scripts/trigger-research.js --category studies
 *   node scripts/trigger-research.js --category trials
 *   node scripts/trigger-research.js --category discussion
 */

import { fetchHempResearch } from '../src/research.js';
import { generateDiscussionPrompt } from '../src/discussion.js';
import { generateCategoryBrief, buildCategoryEmbed } from '../src/summarize.js';

const TOKEN      = process.env.DISCORD_TOKEN;
const API_KEY    = process.env.TOGETHER_API_KEY;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1402343569083207785';

const DAILY_ROTATION = {
  0: null,           // Sunday — off
  1: 'news',         // Monday
  2: 'legislation',  // Tuesday
  3: 'studies',      // Wednesday
  4: 'trials',       // Thursday
  5: 'discussion',   // Friday
  6: null,           // Saturday — off
};

// Parse --category flag
const args = process.argv.slice(2);
const categoryFlag = args.find(a => a.startsWith('--category='))?.split('=')[1]
  ?? args[args.indexOf('--category') + 1];

const todayCategory = categoryFlag ?? DAILY_ROTATION[new Date().getUTCDay()];

async function post(content) {
  const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(content)
  });
  if (!res.ok) console.error('❌ Post failed:', await res.text());
  return res.ok;
}

async function run() {
  if (!todayCategory) {
    console.log('Today is a weekend — no post scheduled. Use --category to override.');
    return;
  }

  console.log(`Category: ${todayCategory}`);

  if (todayCategory === 'discussion') {
    console.log('Generating discussion prompt...');
    const prompt = await generateDiscussionPrompt();
    console.log(`\nPrompt: ${prompt.question}\nThread: ${prompt.threadTitle}\n`);

    // Post the message and create a thread on it
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: prompt.question })
    });
    if (msgRes.ok) {
      const msg = await msgRes.json();
      await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages/${msg.id}/threads`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: prompt.threadTitle, auto_archive_duration: 1440, type: 11 })
      });
    } else {
      console.error('❌ Discussion post failed:', await msgRes.text());
    }
    console.log('✅ Done!');
    return;
  }

  console.log('Fetching hemp research...');
  const research = await fetchHempResearch();
  const items = research[todayCategory] ?? [];
  console.log(`Fetched ${items.length} ${todayCategory} items`);

  if (!items.length) {
    console.log('No data found for this category today.');
    return;
  }

  let brief = null;
  if (API_KEY) {
    console.log('Generating AI brief...');
    try {
      brief = await generateCategoryBrief(todayCategory, items, API_KEY);
      if (brief) console.log(`\nBrief preview:\n${brief}\n`);
    } catch (err) {
      console.error('AI brief failed:', err.message);
    }
  }

  const embed = buildCategoryEmbed(todayCategory, items, research.fetchedAt, brief);
  await post({ embeds: [embed] });
  console.log('✅ Done!');
}

run().catch(err => { console.error(err); process.exit(1); });
