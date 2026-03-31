/**
 * Hemp Industry Research Module
 * Four categorized scrapers — no API keys required
 */

// --- News Sources (RSS) ---

const NEWS_SOURCES = [
  { name: 'Cannabis Industry Journal', url: 'https://cannabisindustryjournal.com/feed/' },
  { name: 'HempToday',                 url: 'https://hemptoday.net/feed' },
  { name: 'Ganjapreneur Hemp',         url: 'https://ganjapreneur.com/news/industry/hemp/feed/' },
  { name: 'GoGreen Hemp',              url: 'https://gogreenhemp.com/blog-feed.xml' }
];

const HEMP_KEYWORDS = [
  'hemp', 'cannabis', 'cbd', 'cbg', 'cbn', 'thc', 'cannabinoid',
  'farm bill', 'delta-8', 'delta-9', 'endocannabinoid', 'terpene',
  'industrial hemp', 'usda', 'dea', 'fda', 'regulation', 'legalization'
];

// --- 1. News ---

export async function fetchNews() {
  const articles = [];

  await Promise.allSettled(NEWS_SOURCES.map(async source => {
    try {
      const res = await fetch(source.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HempDiscordBot/1.0)', Accept: 'application/rss+xml, */*' },
        redirect: 'follow'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const feed = parseRSS(await res.text());
      feed.items
        .filter(item => isRelevant(item))
        .slice(0, 4)
        .forEach(item => articles.push({ title: item.title, link: item.link, pubDate: item.pubDate, source: source.name }));
    } catch (e) {
      console.error(`News feed failed [${source.name}]:`, e.message);
    }
  }));

  return dedupe(articles).sort(byDate).slice(0, 10);
}

// --- 2. Federal Legislation (GovTrack) ---

export async function fetchLegislation() {
  const bills = [];

  try {
    // GovTrack — federal hemp/cannabis bills, most recently introduced
    const res = await fetch(
      'https://www.govtrack.us/api/v2/bill?q=hemp+cannabis&order_by=-introduced_date&limit=8',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HempDiscordBot/1.0)' } }
    );
    if (!res.ok) throw new Error(`GovTrack HTTP ${res.status}`);
    const data = await res.json();

    for (const bill of (data.objects || [])) {
      bills.push({
        title: bill.title_without_number || bill.title,
        billId: `${bill.bill_type_label} ${bill.number}`,
        status: bill.current_status_description || bill.current_status,
        introduced: bill.introduced_date,
        link: bill.link?.startsWith('http') ? bill.link : `https://www.govtrack.us${bill.link}`,
        source: 'GovTrack (Federal)'
      });
    }
  } catch (e) {
    console.error('GovTrack fetch failed:', e.message);
  }

  // Federal Register — recent hemp regulatory filings
  try {
    const res = await fetch(
      'https://www.federalregister.gov/api/v1/articles.rss?conditions%5Bterm%5D=hemp',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HempDiscordBot/1.0)' } }
    );
    if (res.ok) {
      const feed = parseRSS(await res.text());
      feed.items.slice(0, 5).forEach(item => bills.push({
        title: item.title,
        billId: 'Federal Register',
        status: 'Regulatory Filing',
        introduced: item.pubDate,
        link: item.link,
        source: 'Federal Register'
      }));
    }
  } catch (e) {
    console.error('Federal Register fetch failed:', e.message);
  }

  return bills;
}

// --- 3. Scientific Studies (PubMed) ---

export async function fetchStudies() {
  const studies = [];

  try {
    // Search PubMed for hemp/cannabinoid studies from last 60 days
    const searchRes = await fetch(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=hemp+OR+cannabidiol+OR+cannabinoid&retmax=8&sort=relevance&retmode=json&datetype=pdat&reldate=60&tool=HempDiscordBot&email=bot@hempcommunity.com'
    );
    if (!searchRes.ok) throw new Error(`PubMed search HTTP ${searchRes.status}`);
    const searchData = await searchRes.json();
    const ids = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return studies;

    // Fetch summaries for found IDs
    const summaryRes = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json&tool=HempDiscordBot&email=bot@hempcommunity.com`
    );
    if (!summaryRes.ok) throw new Error(`PubMed summary HTTP ${summaryRes.status}`);
    const summaryData = await summaryRes.json();

    for (const id of ids) {
      const article = summaryData.result?.[id];
      if (!article || article.error) continue;
      studies.push({
        title: article.title,
        authors: (article.authors || []).slice(0, 2).map(a => a.name).join(', '),
        journal: article.fulljournalname || article.source,
        pubDate: article.pubdate,
        link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: 'PubMed'
      });
    }
  } catch (e) {
    console.error('PubMed fetch failed:', e.message);
  }

  return studies;
}

// --- 4. Clinical Trials ---

export async function fetchTrials() {
  const trials = [];

  try {
    const res = await fetch(
      'https://clinicaltrials.gov/api/v2/studies?query.term=hemp+CBD+cannabinoid&filter.overallStatus=RECRUITING&pageSize=5&sort=LastUpdatePostDate',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HempDiscordBot/1.0)' } }
    );
    if (!res.ok) throw new Error(`ClinicalTrials HTTP ${res.status}`);
    const data = await res.json();

    for (const study of (data.studies || [])) {
      const p = study.protocolSection;
      const id = p.identificationModule?.nctId;
      trials.push({
        title: p.identificationModule?.briefTitle,
        status: p.statusModule?.overallStatus,
        org: p.identificationModule?.organization?.fullName,
        startDate: p.statusModule?.startDateStruct?.date,
        link: `https://clinicaltrials.gov/study/${id}`,
        source: 'ClinicalTrials.gov'
      });
    }
  } catch (e) {
    console.error('ClinicalTrials fetch failed:', e.message);
  }

  return trials;
}

// --- Main export — runs all 4 scrapers in parallel ---

export async function fetchHempResearch() {
  const [news, legislation, studies, trials] = await Promise.all([
    fetchNews(),
    fetchLegislation(),
    fetchStudies(),
    fetchTrials()
  ]);

  return {
    news,
    legislation,
    studies,
    trials,
    fetchedAt: new Date().toISOString()
  };
}

// --- Shared utilities ---

function parseRSS(xml) {
  const items = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const x = match[1];
    const title = extractTag(x, 'title');
    const link  = extractTag(x, 'link') || extractAtomLink(x);
    const pubDate = extractTag(x, 'pubDate') || extractTag(x, 'dc:date');
    const description = extractTag(x, 'description');
    if (title && link && isValidUrl(link)) items.push({ title, link: link.trim(), pubDate, description });
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

function isRelevant(item) {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  return HEMP_KEYWORDS.some(k => text.includes(k));
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

function isValidUrl(str) {
  return typeof str === 'string' && /^https?:\/\/.+/.test(str.trim());
}

export { NEWS_SOURCES, HEMP_KEYWORDS };
