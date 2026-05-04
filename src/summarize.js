/**
 * AI-powered research summarizer using Together AI.
 * Model configured in config.js (AI_MODEL)
 *
 * All prompts are tuned for a connoisseur smokable hemp flower audience —
 * experienced enthusiasts who care about cultivars, cure quality, vendor
 * reputation, COAs, terpene profiles, and legislation that impacts flower
 * availability.
 */

import { AI_API_URL, AI_MODEL, COLORS } from './config.js';

// ─── Per-category metadata ──────────────────────────────────────────

export const CATEGORY_META = {
  news: {
    title: '📰 Flower Feed',
    color: COLORS.news,
    cta: 'Anything here catch your eye? Drop your take below.',
    fallbackDesc: 'Latest flower-relevant headlines from across the hemp space.',
  },
  legislation: {
    title: '⚖️ Regulation Watch',
    color: COLORS.legislation,
    cta: 'How does this affect flower availability where you are?',
    fallbackDesc: 'Federal bills and regulatory filings that could impact hemp flower.',
  },
  studies: {
    title: '🔬 Research Drop',
    color: COLORS.studies,
    cta: 'Relevant to how you use flower? Share your thoughts.',
    fallbackDesc: 'Recent cannabinoid research relevant to flower consumers.',
  },
  trials: {
    title: '🧪 Trial Tracker',
    color: COLORS.trials,
    cta: 'Any of these feel relevant to the flower community?',
    fallbackDesc: 'Active clinical trials involving cannabinoids.',
  },
};

// ─── System prompts (connoisseur voice) ─────────────────────────────

const INTRO_VARIETY_INSTRUCTION = `CRITICAL: Do NOT start with "The", "A", "An", "In", "With", "From", "New", or "Recent". Do NOT start with any time-of-day reference ("Today", "This week", "Good morning"). Vary your opening — try leading with a specific vendor, cultivar, finding, or provocative observation. Write like you're dropping a hot take in a good hemp flower channel, not writing a newsletter intro.`;

const CATEGORY_SYSTEM_PROMPTS = {
  news: `You write 2-sentence intros to hemp flower news for a private Discord of experienced flower enthusiasts — people who know vendors by name, care about cure and terps, and follow drops closely. Pick the most interesting story and frame it through a flower buyer's lens. Skip generic CBD industry hype. Be specific and opinionated but not clickbaity. No bullets, no markdown formatting. ${INTRO_VARIETY_INSTRUCTION}`,

  legislation: `You write 2-sentence intros to hemp legislation updates for a private Discord of experienced flower enthusiasts who care about whether they can keep buying and smoking quality hemp flower. Focus on what actually threatens or protects flower access — total THC caps, smokable bans, THCA enforcement, state-level restrictions. Skip stuff that only matters to industrial processors or investors. Plain language, direct. No bullets, no markdown. ${INTRO_VARIETY_INSTRUCTION}`,

  studies: `You write 2-sentence intros to cannabinoid research for a private Discord of people who actually smoke hemp flower for relaxation, sleep, anxiety, or pain. Take the most interesting finding and explain what it means for someone choosing between cultivars or cannabinoid profiles. Frame it through consumer experience, not broad pharma potential. No jargon, no bullets, no markdown. ${INTRO_VARIETY_INSTRUCTION}`,

  trials: `You write 2-sentence intros to clinical trials for a private Discord of hemp flower enthusiasts. Focus on trials testing cannabinoids people actually care about (CBD, CBG, THCA, minor cannabinoids) for conditions relevant to flower consumers — anxiety, sleep, inflammation, pain. If a trial is only relevant to pharma investors, skip it and pick something better. No jargon, no bullets, no markdown. ${INTRO_VARIETY_INSTRUCTION}`,
};

// ─── Category brief generation ──────────────────────────────────────

/**
 * Generate a focused 2-sentence AI brief for a single research category.
 */
export async function generateCategoryBrief(category, items, apiKey) {
  const systemPrompt = CATEGORY_SYSTEM_PROMPTS[category];
  if (!systemPrompt || !items?.length) return null;

  const digest = items.slice(0, 5).map((item, i) => {
    if (category === 'legislation') return `${i + 1}. ${item.billId}: ${item.title} [${item.status}]`;
    if (category === 'trials')      return `${i + 1}. ${item.title} [${item.status}] — ${item.org || 'Unknown'}`;
    if (category === 'studies')     return `${i + 1}. ${item.title}${item.journal ? ` (${item.journal})` : ''}`;
    return `${i + 1}. ${item.title} — ${item.source}`;
  }).join('\n');

  const res = await fetch(AI_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 150,
      temperature: 0.78,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here are today's items:\n\n${digest}\n\nWrite your 2-sentence intro.` },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Together AI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

// ─── Embed builders ─────────────────────────────────────────────────

/**
 * Build a focused embed for one category's daily post.
 */
export function buildCategoryEmbed(category, items, fetchedAt, brief) {
  const meta = CATEGORY_META[category];
  if (!meta) return null;

  const embed = {
    title: meta.title,
    description: brief || meta.fallbackDesc,
    color: meta.color,
    fields: buildCategoryFields(category, items),
    footer: { text: `${meta.cta} · ${new Date(fetchedAt).toUTCString()}` },
  };

  return embed;
}

export function mdLink(title, url) {
  if (!title || !url) return title || 'Untitled';
  const safeTitle = title.replace(/[\[\]]/g, '\\$&');
  const safeUrl = url.replace(/\)/g, '%29');
  return `[${safeTitle}](${safeUrl})`;
}

function buildCategoryFields(category, items) {
  switch (category) {
    case 'news': {
      // Group articles by source to avoid repetition
      const bySource = new Map();
      for (const a of items.slice(0, 5)) {
        const src = a.source ?? 'News';
        if (!bySource.has(src)) bySource.set(src, []);
        bySource.get(src).push(a);
      }
      return [...bySource.entries()].map(([source, articles]) => ({
        name: source,
        value: articles.map(a => `> ${mdLink(a.title, a.link)}`).join('\n'),
        inline: false,
      }));
    }
    case 'legislation':
      return items.slice(0, 5).map(b => ({
        name: `${b.flowerRelevant ? '🌿 ' : '📋 '}${b.billId} · ${b.status}`,
        value: mdLink(b.title, b.link),
        inline: false,
      }));
    case 'studies':
      return items.slice(0, 4).map(s => ({
        name: s.journal ?? 'PubMed',
        value: `${mdLink(s.title, s.link)}${s.authors ? `\n*${s.authors}*` : ''}`,
        inline: false,
      }));
    case 'trials': {
      const statusIcon = { RECRUITING: '🟢', ACTIVE_NOT_RECRUITING: '🟡', COMPLETED: '✅' };
      return items.slice(0, 4).map(t => ({
        name: t.org ?? 'Clinical Trial',
        value: `${mdLink(t.title, t.link)}\n${statusIcon[t.status] ?? '⚪'} ${t.status}`,
        inline: false,
      }));
    }
    default:
      return [];
  }
}

// ─── Legacy: all-in-one brief for /research command ─────────────────

/**
 * Generate a brief summarizing all research categories at once.
 */
export async function generateDailyBrief(research, apiKey) {
  const digest = buildAllDigest(research);

  const res = await fetch(AI_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 220,
      temperature: 0.78,
      messages: [
        {
          role: 'system',
          content: `You write sharp, opinionated briefings for a private Discord of experienced hemp flower enthusiasts. These people know their vendors, care about cure and terpene profiles, and want to know what matters for flower buyers — not generic CBD industry cheerleading. Pick the single most interesting or consequential item and make it compelling. 2-3 natural sentences. No bullets, no markdown. ${INTRO_VARIETY_INSTRUCTION}`,
        },
        {
          role: 'user',
          content: `Here's today's hemp research:\n\n${digest}\n\nPick the most interesting finding and write your brief.`,
        },
      ],
    }),
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
  const color = CATEGORY_META[dominant]?.color ?? COLORS.news;

  const parts = [];
  if (research.news?.length)        parts.push(`**${research.news.length}** flower news`);
  if (research.legislation?.length) parts.push(`**${research.legislation.length}** regulatory updates`);
  if (research.studies?.length)     parts.push(`**${research.studies.length}** studies`);
  if (research.trials?.length)      parts.push(`**${research.trials.length}** active trials`);

  return {
    title: 'Hemp Flower Radar',
    description: brief,
    color,
    fields: [{ name: 'Snapshot', value: parts.join(' · ') || 'No data', inline: false }],
    footer: { text: `${new Date(research.fetchedAt).toUTCString()} · Flower News · Regulation · PubMed · ClinicalTrials.gov` },
  };
}

function buildAllDigest(research) {
  const lines = [];
  if (research.news?.length) {
    lines.push('FLOWER NEWS:');
    research.news.slice(0, 4).forEach(a => lines.push(`- ${a.title} (${a.source})`));
  }
  if (research.legislation?.length) {
    lines.push('\nREGULATION:');
    research.legislation.slice(0, 4).forEach(b => lines.push(`- ${b.billId}: ${b.title} [${b.status}]`));
  }
  if (research.studies?.length) {
    lines.push('\nSTUDIES:');
    research.studies.slice(0, 3).forEach(s => lines.push(`- ${s.title}${s.journal ? ` (${s.journal})` : ''}`));
  }
  if (research.trials?.length) {
    lines.push('\nTRIALS:');
    research.trials.slice(0, 3).forEach(t => lines.push(`- ${t.title} [${t.status}]`));
  }
  return lines.join('\n');
}
