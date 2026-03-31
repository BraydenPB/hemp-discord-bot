/**
 * Discussion Prompt Generator — tuned for connoisseur hemp flower community.
 *
 * Topics focus on: cultivars, cure, vendor experiences, terpene profiles,
 * effects, COAs, consumption methods, and the culture of smokable hemp.
 */

import { COLORS } from './config.js';

const DISCUSSION_TOPICS = [
  {
    theme: 'Vendor Talk',
    prompts: [
      'Who\'s putting out the best flower right now? Any vendor that\'s been consistently impressing you lately — or one that fell off?',
      'What makes you loyal to a vendor? Is it cure quality, genetics, pricing, customer service, or something else? Have you ever switched your go-to and why?',
      'Small-batch vs. larger operations — do you notice a real quality difference, or is it more about the story? Who\'s doing small-batch right?',
    ],
  },
  {
    theme: 'Cultivar & Genetics',
    prompts: [
      'What cultivar has surprised you the most — something you didn\'t expect to like but ended up being a top shelf experience? What stood out about it?',
      'If you could only smoke one cultivar for a month straight, what would it be and why? Bonus points if it\'s something under the radar.',
      'Indoor vs. outdoor vs. greenhouse — does the grow matter more than the genetics to you, or is it all about the cultivar? What\'s your ideal combo?',
    ],
  },
  {
    theme: 'Cure, Nose & Quality',
    prompts: [
      'What\'s your ideal cure situation? How do you judge whether a batch was cured well vs. rushed? Any vendors who consistently nail the cure?',
      'Let\'s talk nose — what terpene profiles do you gravitate toward? Are you a citrus/pine person, a gas/fuel person, or something else? Best nose you\'ve had recently?',
      'How much weight do you put on COAs when choosing flower? Do you look at specific cannabinoid or terpene numbers, or is it more about the overall vibe of the bud?',
    ],
  },
  {
    theme: 'Effects & Use',
    prompts: [
      'What do you primarily use hemp flower for — relaxation, sleep, anxiety, pain, focus, or just enjoyment? Has your reason changed over time?',
      'CBD vs. CBG vs. THCA vs. blends — what\'s your go-to cannabinoid profile and why? Do you mix strains to dial in effects?',
      'Joints, dry herb vape, bong, pipe — what\'s your preferred method and how does it change the experience for you? Any method you tried and went back on?',
    ],
  },
  {
    theme: 'Community & Culture',
    prompts: [
      'What got you into hemp flower specifically (vs. other forms of CBD or cannabis)? Was there a specific moment or product that clicked for you?',
      'How do you explain hemp flower to someone who doesn\'t know the space? Do people in your life get it, or do you still get weird looks?',
      'What\'s something you wish was different about the hemp flower market right now — pricing, regulations, availability, quality standards, something else?',
    ],
  },
];

// ─── Prompt selection ───────────────────────────────────────────────

// US DST: 2nd Sunday of March 2:00 AM local → 1st Sunday of November 2:00 AM local
function isUSDST(date) {
  const year = date.getUTCFullYear();
  // 2nd Sunday of March: find first Sunday of March, then add 7
  const mar1Day = new Date(Date.UTC(year, 2, 1)).getUTCDay();
  const marSecondSun = 1 + (7 - mar1Day) % 7 + 7;
  const dstStart = new Date(Date.UTC(year, 2, marSecondSun, 8)); // 2am CST = 8am UTC
  // 1st Sunday of November
  const nov1Day = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const novFirstSun = 1 + (7 - nov1Day) % 7;
  const dstEnd = new Date(Date.UTC(year, 10, novFirstSun, 7)); // 2am CDT = 7am UTC
  return date >= dstStart && date < dstEnd;
}

// Returns date parts in US Central time (CST/CDT)
function getCentralDateParts() {
  const now = new Date();
  const offsetHours = isUSDST(now) ? 5 : 6; // CDT = UTC-5, CST = UTC-6
  const centralMs = now.getTime() - (offsetHours * 60 * 60 * 1000);
  const d = new Date(centralMs);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return {
    dayName: days[d.getUTCDay()],
    dayNum: d.getUTCDate(),
    month: months[d.getUTCMonth()],
    year: d.getUTCFullYear(),
    dayOfWeek: d.getUTCDay(),
    weekOfYear: Math.ceil((d.getTime() - new Date(d.getUTCFullYear(), 0, 1).getTime()) / 604800000),
  };
}

export async function generateDiscussionPrompt(env) {
  const { dayName, dayNum, month, year, weekOfYear } = getCentralDateParts();

  // Rotate through topics by week number to get variety
  const topicIndex = weekOfYear % DISCUSSION_TOPICS.length;
  const topic = DISCUSSION_TOPICS[topicIndex];

  // Pick a prompt within the topic, varying by day-of-month
  const promptIndex = dayNum % topic.prompts.length;
  let prompt = topic.prompts[promptIndex];

  // Check KV for recently used prompts to avoid repeats
  if (env?.HEMP_KV) {
    try {
      const historyRaw = await env.HEMP_KV.get('discussion_history');
      const history = historyRaw ? JSON.parse(historyRaw) : [];
      const key = `${topicIndex}:${promptIndex}`;

      let usedKey = key;
      if (history.includes(key)) {
        // Try next prompt in the topic
        const altIndex = (promptIndex + 1) % topic.prompts.length;
        const altKey = `${topicIndex}:${altIndex}`;
        if (!history.includes(altKey)) {
          prompt = topic.prompts[altIndex];
          usedKey = altKey;
        }
        // If both are used, just use the original — it's been a while
      }

      // Update history with the prompt actually used (keep last 10 entries)
      const updated = [...history.filter(k => k !== usedKey), usedKey].slice(-10);
      await env.HEMP_KV.put('discussion_history', JSON.stringify(updated));
    } catch (e) {
      console.error('Discussion history KV error:', e.message);
    }
  }

  return {
    theme: topic.theme,
    question: prompt,
    threadTitle: `${dayName} Discussion — ${topic.theme}`,
    date: `${dayName}, ${month} ${dayNum}, ${year}`,
  };
}

export { DISCUSSION_TOPICS };
