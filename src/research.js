/**
 * Hemp Industry Research Module
 * Fetches news from RSS feeds and APIs for daily research
 */

const HEMP_NEWS_SOURCES = [
  {
    name: 'Hemp Industry Daily',
    url: 'https://hempindustrydaily.com/feed/',
    type: 'rss'
  },
  {
    name: 'MJBizDaily Hemp',
    url: 'https://mjbizdaily.com/category/hemp/feed/',
    type: 'rss'
  },
  {
    name: 'Cannabis Industry Journal',
    url: 'https://cannabisindustryjournal.com/rss-feeds/',
    type: 'rss'
  }
];

const REGULATORY_TOPICS = [
  '2026 Farm Bill',
  'THC regulations',
  'hemp cultivation',
  'CBD regulations',
  'hemp derivatives',
  'interstate commerce hemp',
  'USDA hemp program'
];

export async function fetchHempResearch() {
  const articles = [];
  const errors = [];

  // Fetch from multiple sources
  for (const source of HEMP_NEWS_SOURCES) {
    try {
      const feed = await fetchRSS(source.url);
      if (feed && feed.items) {
        const relevantItems = feed.items
          .filter(item => isRelevantToHemp(item))
          .slice(0, 5)
          .map(item => ({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate,
            source: source.name
          }));
        articles.push(...relevantItems);
      }
    } catch (error) {
      errors.push({ source: source.name, error: error.message });
    }
  }

  // Deduplicate by title
  const uniqueArticles = deduplicateByTitle(articles);

  // Sort by date
  uniqueArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Generate summary
  const summary = generateSummary(uniqueArticles.slice(0, 10));

  return {
    articles: uniqueArticles.slice(0, 10),
    summary,
    fetchedAt: new Date().toISOString(),
    errors: errors.length > 0 ? errors : undefined
  };
}

async function fetchRSS(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'HempDiscordBot/1.0 (Research Bot)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    return parseRSS(text);
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error);
    return null;
  }
}

function parseRSS(xml) {
  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

  for (const match of itemMatches) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const description = extractTag(itemXml, 'description');

    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  }

  return { items };
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'))
    || xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : null;
}

function isRelevantToHemp(item) {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  const keywords = [
    'hemp', 'cannabis', 'cbd', 'thc', 'farm bill', 'marijuana',
    'cannabinoid', 'delta-8', 'delta-9', 'hempcrete', 'industrial hemp',
    'usda', 'dea', 'fda', 'regulation', 'legalization'
  ];
  return keywords.some(keyword => text.includes(keyword));
}

function deduplicateByTitle(articles) {
  const seen = new Set();
  return articles.filter(article => {
    const normalized = article.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function generateSummary(articles) {
  if (articles.length === 0) {
    return 'No recent hemp industry news found today. Check back tomorrow!';
  }

  const lines = [`Found ${articles.length} relevant articles today:\n`];

  articles.slice(0, 5).forEach((article, i) => {
    lines.push(`${i + 1}. **${article.title}**`);
    lines.push(`   Source: ${article.source}`);
    lines.push(`   ${article.link}\n`);
  });

  return lines.join('\n');
}

export { HEMP_NEWS_SOURCES, REGULATORY_TOPICS };
