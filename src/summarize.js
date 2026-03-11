/**
 * AI-powered research summarizer using Together AI
 * Model: meta-llama/Llama-3.3-70B-Instruct-Turbo (~$0.40/year for daily use)
 */

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

// Per-category metadata for daily posts
export const CATEGORY_META = {
  news: {
    title: '📰 Hemp Headlines',
    color: 0x2a9d8f,
    cta: '💬 Which story catches your eye? Share your thoughts below.',
  },
  legislation: {
    title: '⚖️ Legislative Update',
    color: 0xe76f51,
    cta: '💬 How do you think these changes could affect hemp farmers or consumers?',
  },
  studies: {
    title: '🔬 Science Spotlight',
    color: 0x457b9d,
    cta: '💬 Does this research change how you think about hemp?',
  },
  trials: {
    title: '🧪 Trials Watch',
    color: 0x9b72cf,
    cta: '💬 Which of these trials are you most hopeful about?',
  },
};

const CATEGORY_SYSTEM_PROMPTS = {
  news: `You write brief, engaging introductions to hemp news for a community of curious beginners on Discord. Pick the most interesting or surprising story and explain why it matters in plain, accessible language. No bullet points, no markdown formatting, no product promotion. Two natural sentences that make someone want to read more.`,
  legislation: `You write brief, engaging introductions to hemp legislation updates for a community of curious beginners on Discord. Explain what the most significant bill or regulatory change could mean for real people — farmers, consumers, or patients. Plain language, no legal jargon, no bullet points, no markdown. Two sentences.`,
  studies: `You write brief, engaging introductions to hemp research studies for a community of curious beginners on Discord. Take the most interesting scientific finding and explain it like you're telling a friend something fascinating you just read. No technical jargon, no bullet points, no markdown. Two natural sentences.`,
  trials: `You write brief, engaging introductions to hemp clinical trials for a community of curious beginners on Discord. Explain what the most interesting trial is testing and what it could mean for people if it succeeds — in warm, accessible language. No medical jargon, no bullet points, no markdown. Two sentences.`,
};

/**
 * Generate a focused 2-sentence AI brief for a single research category.
 * Used by scheduled daily posts (Mon–Thu).
 */
export async function generateCategoryBrief(category, items, apiKey) {
  const systemPrompt = CATEGORY_SYSTEM_PROMPTS[category];
  if (!systemPrompt || !items?.length) return null;

  const digest = items.slice(0, 5).map((item, i) => {
    if (category === 'legislation') return `${i + 1}. ${item.billId}: ${item.title} [${item.status}]`;
    if (category === 'trials')      return `${i + 1}. ${item.title} [${item.status}]`;
    if (category === 'studies')     return `${i + 1}. ${item.title}${item.journal ? ` (${item.journal})` : ''}`;
    return `${i + 1}. ${item.title} — ${item.source}`;
  }).join('\n');

  const res = await fetch(TOGETHER_API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 150,
      temperature: 0.72,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here are today's items:\n\n${digest}\n\nWrite your 2-sentence intro. Do not start with "Today", "Good", or any time-of-day reference.` }
      ]
    })
  });

  if (!res.ok) throw new Error(`Together AI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

/**
 * Build a focused embed for one category's daily post.
 */
export function buildCategoryEmbed(category, items, fetchedAt, brief) {
  const meta = CATEGORY_META[category];
  if (!meta) return null;

  const embed = {
    title: meta.title,
    color: meta.color,
    fields: [
      ...buildCategoryFields(category, items),
      { name: '\u200b', value: meta.cta, inline: false }
    ],
    footer: { text: `Updated ${new Date(fetchedAt).toUTCString()}` }
  };

  if (brief) embed.description = brief;
  return embed;
}

function buildCategoryFields(category, items) {
  switch (category) {
    case 'news':
      return items.slice(0, 5).map(a => ({
        name: a.source ?? 'News',
        value: `[${a.title}](${a.link})`,
        inline: false
      }));
    case 'legislation':
      return items.slice(0, 5).map(b => ({
        name: `${b.billId} — ${b.status}`,
        value: `[${b.title}](${b.link})`,
        inline: false
      }));
    case 'studies':
      return items.slice(0, 4).map(s => ({
        name: s.journal ?? 'PubMed',
        value: `[${s.title}](${s.link})${s.authors ? `\n*${s.authors}*` : ''}`,
        inline: false
      }));
    case 'trials':
      return items.slice(0, 4).map(t => ({
        name: t.org ?? 'Clinical Trial',
        value: `[${t.title}](${t.link})\nStatus: ${t.status}`,
        inline: false
      }));
    default:
      return [];
  }
}

// --- Legacy: used by /research slash command and trigger-research.js ---

/**
 * Generate a brief summarizing all research categories at once.
 */
export async function generateDailyBrief(research, apiKey) {
  const digest = buildAllDigest(research);

  const res = await fetch(TOGETHER_API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 220,
      temperature: 0.72,
      messages: [
        {
          role: 'system',
          content: `You write sharp, thoughtful briefings for a hemp education community on Discord. Members are curious newcomers exploring hemp's science, law, and culture. Write like a knowledgeable friend who found something genuinely interesting. No bullet points, no markdown, no product mentions. 2-3 natural sentences.`
        },
        {
          role: 'user',
          content: `Today's hemp research data:\n\n${digest}\n\nPick the single most interesting or surprising finding and make it feel worth reading. Do NOT start with "Today", "Good", or any time reference.`
        }
      ]
    })
  });

  if (!res.ok) throw new Error(`Together AI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

export function buildBriefEmbed(brief, research) {
  const counts = {
    studies:     research.studies?.length ?? 0,
    legislation: research.legislation?.length ?? 0,
    trials:      research.trials?.length ?? 0,
    news:        research.news?.length ?? 0,
  };
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'news';
  const color = CATEGORY_META[dominant]?.color ?? 0x2d6a4f;

  const parts = [];
  if (research.news?.length)        parts.push(`**${research.news.length}** news articles`);
  if (research.legislation?.length) parts.push(`**${research.legislation.length}** legislative updates`);
  if (research.studies?.length)     parts.push(`**${research.studies.length}** recent studies`);
  if (research.trials?.length)      parts.push(`**${research.trials.length}** active clinical trials`);

  return {
    title: '📡 Hemp Radar',
    description: brief,
    color,
    fields: [{ name: '📊 Snapshot', value: parts.join(' · ') || 'No data', inline: false }],
    footer: { text: `${new Date(research.fetchedAt).toUTCString()} · News · Legislation · PubMed · ClinicalTrials.gov` }
  };
}

function buildAllDigest(research) {
  const lines = [];
  if (research.news?.length) {
    lines.push('NEWS:');
    research.news.slice(0, 4).forEach(a => lines.push(`- ${a.title} (${a.source})`));
  }
  if (research.legislation?.length) {
    lines.push('\nLEGISLATION:');
    research.legislation.slice(0, 4).forEach(b => lines.push(`- ${b.billId}: ${b.title} [${b.status}]`));
  }
  if (research.studies?.length) {
    lines.push('\nSTUDIES:');
    research.studies.slice(0, 3).forEach(s => lines.push(`- ${s.title}${s.journal ? ` (${s.journal})` : ''}`));
  }
  if (research.trials?.length) {
    lines.push('\nCLINICAL TRIALS:');
    research.trials.slice(0, 3).forEach(t => lines.push(`- ${t.title} [${t.status}]`));
  }
  return lines.join('\n');
}
