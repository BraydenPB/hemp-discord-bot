/**
 * Hemp Flower Research Module
 *
 * Scrapes external sources in two tiers:
 *   - FLOWER (primary): community/vendor/flower-relevant content
 *   - INDUSTRY (secondary): generic hemp trade press (optional separate feed)
 *
 * Relevance scoring prioritizes smokable flower, vendor news, cultivar talk,
 * and consumer-relevant science over generic industrial hemp content.
 */

import {
  FLOWER_NEWS_SOURCES, INDUSTRY_NEWS_SOURCES,
  FLOWER_KEYWORDS, GENERAL_HEMP_KEYWORDS, DEPRIORITY_KEYWORDS,
  FLOWER_LEGISLATION_KEYWORDS,
  PUBMED_QUERY, PUBMED_RELDATE,
  TRIALS_QUERY, TRIALS_FILTER_STATUS,
} from './config.js';

// ─── Relevance scoring ──────────────────────────────────────────────

/**
 * Score an item's relevance to the flower/connoisseur audience.
 * Higher = more relevant. Negative = deprioritized.
 */
export function scoreRelevance(text) {
  const lower = text.toLowerCase();
  let score = 0;

  for (const kw of FLOWER_KEYWORDS) {
    if (lower.includes(kw)) score += 3;
  }
  for (const kw of GENERAL_HEMP_KEYWORDS) {
    if (lower.includes(kw)) score += 1;
  }
  for (const kw of DEPRIORITY_KEYWORDS) {
    if (lower.includes(kw)) score -= 2;
  }

  return score;
}

/**
 * Returns true if an item is relevant enough for the flower feed.
 * Requires at least one flower keyword match, or a net positive score
 * with general keywords.
 */
function isFlowerRelevant(item) {
  const text = `${item.title} ${item.description || ''}`;
  return scoreRelevance(text) >= 2;
}

/**
 * Returns true if an item is relevant to the general hemp industry feed.
 */
function isIndustryRelevant(item) {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  return GENERAL_HEMP_KEYWORDS.some(k => text.includes(k));
}

// ─── 1. News (RSS) ──────────────────────────────────────────────────

export async function fetchFlowerNews() {
  const articles = await fetchRSSFeeds(FLOWER_NEWS_SOURCES, isFlowerRelevant);
  return dedupe(articles).sort(byRelevanceThenDate).slice(0, 10);
}

export async function fetchIndustryNews() {
  const articles = await fetchRSSFeeds(INDUSTRY_NEWS_SOURCES, isIndustryRelevant);
  return dedupe(articles).sort(byDate).slice(0, 10);
}

async function fetchRSSFeeds(sources, filterFn) {
  const articles = [];

  await Promise.allSettled(sources.map(async source => {
    try {
      const res = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HempFlowerBot/2.0)',
          Accept: 'application/rss+xml, */*',
        },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const feed = parseRSS(await res.text());
      feed.items
        .filter(filterFn)
        .slice(0, 6)
        .forEach(item => {
          const text = `${item.title} ${item.description || ''}`;
          articles.push({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate,
            source: source.name,
            relevance: scoreRelevance(text),
          });
        });
    } catch (e) {
      console.error(`News feed failed [${source.name}]:`, e.message);
    }
  }));

  return articles;
}

// ─── 2. Federal Legislation ─────────────────────────────────────────

export async function fetchLegislation() {
  const bills = [];

  // GovTrack — federal hemp/cannabis bills
  try {
    const res = await fetch(
      'https://www.govtrack.us/api/v2/bill?q=hemp+cannabis&order_by=-introduced_date&limit=10',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HempFlowerBot/2.0)' } }
    );
    if (!res.ok) throw new Error(`GovTrack HTTP ${res.status}`);
    const data = await res.json();

    for (const bill of (data.objects || [])) {
      const title = bill.title_without_number || bill.title;
      const entry = {
        title,
        billId: `${bill.bill_type_label} ${bill.number}`,
        status: bill.current_status_description || bill.current_status,
        introduced: bill.introduced_date,
        link: `https://www.govtrack.us${bill.link}`,
        source: 'GovTrack (Federal)',
        flowerRelevant: isLegislationFlowerRelevant(title),
      };
      bills.push(entry);
    }
  } catch (e) {
    console.error('GovTrack fetch failed:', e.message);
  }

  // Federal Register — hemp regulatory filings
  try {
    const res = await fetch(
      'https://www.federalregister.gov/api/v1/articles.rss?conditions%5Bterm%5D=hemp',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HempFlowerBot/2.0)' } }
    );
    if (res.ok) {
      const feed = parseRSS(await res.text());
      feed.items.slice(0, 5).forEach(item => bills.push({
        title: item.title,
        billId: 'Federal Register',
        status: 'Regulatory Filing',
        introduced: item.pubDate,
        link: item.link,
        source: 'Federal Register',
        flowerRelevant: isLegislationFlowerRelevant(item.title),
      }));
    }
  } catch (e) {
    console.error('Federal Register fetch failed:', e.message);
  }

  // Sort flower-relevant legislation first
  return bills.sort((a, b) => (b.flowerRelevant ? 1 : 0) - (a.flowerRelevant ? 1 : 0));
}

function isLegislationFlowerRelevant(text) {
  const lower = text.toLowerCase();
  return FLOWER_LEGISLATION_KEYWORDS.some(k => lower.includes(k));
}

// ─── 3. Scientific Studies (PubMed) ─────────────────────────────────

export async function fetchStudies() {
  const studies = [];

  try {
    const query = encodeURIComponent(PUBMED_QUERY);
    const searchRes = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${query}&retmax=10&sort=relevance&retmode=json&datetype=pdat&reldate=${PUBMED_RELDATE}&tool=HempFlowerBot&email=bot@hempcommunity.com`
    );
    if (!searchRes.ok) throw new Error(`PubMed search HTTP ${searchRes.status}`);
    const searchData = await searchRes.json();
    const ids = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return studies;

    const summaryRes = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json&tool=HempFlowerBot&email=bot@hempcommunity.com`
    );
    if (!summaryRes.ok) throw new Error(`PubMed summary HTTP ${summaryRes.status}`);
    const summaryData = await summaryRes.json();

    for (const id of ids) {
      const article = summaryData.result?.[id];
      if (!article || article.error) continue;

      const title = article.title || '';
      studies.push({
        title,
        authors: (article.authors || []).slice(0, 2).map(a => a.name).join(', '),
        journal: article.fulljournalname || article.source,
        pubDate: article.pubdate,
        link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: 'PubMed',
        relevance: scoreRelevance(title),
      });
    }
  } catch (e) {
    console.error('PubMed fetch failed:', e.message);
  }

  return studies.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

// ─── 4. Clinical Trials ─────────────────────────────────────────────

export async function fetchTrials() {
  const trials = [];

  try {
    const query = encodeURIComponent(TRIALS_QUERY);
    const res = await fetch(
      `https://clinicaltrials.gov/api/v2/studies?query.term=${query}&filter.overallStatus=${TRIALS_FILTER_STATUS}&pageSize=5&sort=LastUpdatePostDate`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HempFlowerBot/2.0)' } }
    );
    if (!res.ok) throw new Error(`ClinicalTrials HTTP ${res.status}`);
    const data = await res.json();

    for (const study of (data.studies || [])) {
      const p = study.protocolSection;
      const id = p.identificationModule?.nctId;
      const title = p.identificationModule?.briefTitle || '';
      trials.push({
        title,
        status: p.statusModule?.overallStatus,
        org: p.identificationModule?.organization?.fullName,
        startDate: p.statusModule?.startDateStruct?.date,
        link: `https://clinicaltrials.gov/study/${id}`,
        source: 'ClinicalTrials.gov',
        relevance: scoreRelevance(title),
      });
    }
  } catch (e) {
    console.error('ClinicalTrials fetch failed:', e.message);
  }

  return trials.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

// ─── Main exports ───────────────────────────────────────────────────

/**
 * Fetch all research for the flower community (primary feed).
 */
export async function fetchHempResearch() {
  const [news, legislation, studies, trials] = await Promise.all([
    fetchFlowerNews(),
    fetchLegislation(),
    fetchStudies(),
    fetchTrials(),
  ]);

  return { news, legislation, studies, trials, fetchedAt: new Date().toISOString() };
}

/**
 * Fetch industry-only news (secondary/optional feed).
 */
export async function fetchIndustryResearch() {
  const news = await fetchIndustryNews();
  return { news, fetchedAt: new Date().toISOString() };
}

// ─── Shared utilities ───────────────────────────────────────────────

function parseRSS(xml) {
  const items = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const x = match[1];
    const title = extractTag(x, 'title');
    const link = extractTag(x, 'link') || extractAtomLink(x);
    const pubDate = extractTag(x, 'pubDate') || extractTag(x, 'dc:date');
    const description = extractTag(x, 'description');
    if (title && link) items.push({ title, link, pubDate, description });
  }
  return { items };
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'))
           || xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function extractAtomLink(xml) {
  const m = xml.match(/<link[^>]+href=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function dedupe(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function byDate(a, b) {
  return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
}

function byRelevanceThenDate(a, b) {
  const rDiff = (b.relevance ?? 0) - (a.relevance ?? 0);
  if (rDiff !== 0) return rDiff;
  return byDate(a, b);
}

export { FLOWER_NEWS_SOURCES, INDUSTRY_NEWS_SOURCES } from './config.js';
