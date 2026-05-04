/**
 * Central configuration for the hemp flower connoisseur bot.
 *
 * Edit this file to add/remove sources, channels, vendors, cultivars,
 * keywords, and scheduling without touching core logic.
 */

// ─── Together AI ────────────────────────────────────────────────────
export const AI_MODEL = 'glm-4.7-flash';
export const AI_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';

// ─── News Sources ───────────────────────────────────────────────────
// PRIMARY: flower/vendor/community-focused feeds (shown in main feed)
export const FLOWER_NEWS_SOURCES = [
  { name: 'Ministry of Hemp',   url: 'https://ministryofhemp.com/feed/' },
  { name: 'Ganjapreneur Hemp',  url: 'https://ganjapreneur.com/news/industry/hemp/feed/' },
  { name: 'CBD Oracle',         url: 'https://cbdoracle.com/feed/' },
  { name: 'Hemp Benchmarks',    url: 'https://www.hempbenchmarks.com/feed/' },
];

// SECONDARY: industrial/trade press (optional "industry" feed, not main)
export const INDUSTRY_NEWS_SOURCES = [
  { name: 'Cannabis Industry Journal', url: 'https://cannabisindustryjournal.com/feed/' },
  { name: 'HempToday',                 url: 'https://hemptoday.net/feed' },
  { name: 'GoGreen Hemp',              url: 'https://gogreenhemp.com/blog-feed.xml' },
];

// ─── Keyword Filters ────────────────────────────────────────────────

// Flower/connoisseur relevance — articles matching these get boosted
export const FLOWER_KEYWORDS = [
  'hemp flower', 'smokable hemp', 'smokeable hemp', 'cbd flower',
  'cbg flower', 'thca flower', 'thca hemp', 'indoor', 'outdoor',
  'greenhouse', 'small batch', 'craft hemp', 'hand trimmed',
  'terpene', 'terpenes', 'terp', 'nose', 'cure', 'curing',
  'cultivar', 'strain', 'phenotype', 'pheno', 'genetics',
  'coa', 'lab test', 'lab results', 'certificate of analysis',
  'vendor', 'drop', 'restock', 'new drop',
  'cbd', 'cbg', 'cbn', 'cbc', 'cbdv', 'thca',
  'full spectrum', 'entourage effect',
  'hemp review', 'flower review',
  'relaxation', 'sleep', 'anxiety', 'pain', 'inflammation',
];

// Generic hemp/cannabis keywords — still relevant but lower priority
export const GENERAL_HEMP_KEYWORDS = [
  'hemp', 'cannabis', 'cannabinoid', 'cannabidiol',
  'farm bill', 'delta-8', 'delta-9', 'endocannabinoid',
  'usda', 'dea', 'fda', 'regulation', 'legalization',
  'industrial hemp', 'fiber', 'seed oil', 'hempcrete',
];

// Negative signals — articles matching these get deprioritized
export const DEPRIORITY_KEYWORDS = [
  'fiber', 'seed oil', 'hempcrete', 'bioplastic', 'biofuel',
  'investment', 'ipo', 'stock', 'market cap', 'earnings',
  'pet cbd', 'dog treat', 'cat', 'horse',
  'press release', 'sponsored',
  // Affiliate listicles & non-flower products
  'best delta-9', 'best delta 9', 'best thc', 'best cbd oil',
  'thc oil', 'thc capsule', 'thc gummy', 'thc gummies',
  'thc edible', 'delta-9 oil', 'delta-9 capsule',
  'top 10', 'top 5', 'best seed bank', 'seed bank',
  'picks for', 'by the drop', 'consume daily',
  'vape cart', 'vape pen', 'disposable',
];

// Legislation keywords that directly impact flower consumers
export const FLOWER_LEGISLATION_KEYWORDS = [
  'smokable', 'smokeable', 'hemp flower', 'thca',
  'delta-8', 'delta-9', 'total thc', 'hot hemp',
  'intoxicating', 'consumable', 'inhalable',
  'ban', 'prohibit', 'restrict', 'legalize', 'decriminalize',
  'farm bill', 'hemp act', 'cannabinoid',
  'dea', 'fda', 'usda', 'scheduling',
];

// ─── PubMed Search ──────────────────────────────────────────────────
// Tailored to flower-consumer-relevant research
export const PUBMED_QUERY =
  '(cannabidiol OR CBD OR cannabigerol OR CBG OR "hemp flower" OR "Cannabis sativa" OR inhalation OR smoking) AND (anxiety OR sleep OR pain OR inflammation OR relaxation OR bioavailability)';
export const PUBMED_RELDATE = 90; // days lookback

// ─── ClinicalTrials.gov ─────────────────────────────────────────────
export const TRIALS_QUERY = 'CBD OR cannabidiol OR cannabigerol OR "hemp flower" OR "cannabis sativa"';
export const TRIALS_FILTER_STATUS = 'RECRUITING';

// ─── Community Pulse ────────────────────────────────────────────────

// Known vendors in the hemp flower space — used for extraction & counting
export const KNOWN_VENDORS = [
  'flow gardens', 'holy city farms', 'top cola',
  'wnc cbd', 'beleafer', 'fern valley farms',
  'eight horses hemp', 'goat ridge hemp', 'herbal arrangements',
  'pine rose farm', 'natural nuggs', 'horn creek hemp',
  'hempbest', 'tweedle farms', 'cascadia blooms',
  'hemp hop', 'arete hemp', 'backwoodz',
  'five leaf wellness', 'southern charm',
  'diesel hemp', 'cannaflower', 'secret nature',
  'berkshire cbd', 'happybudzhemp', 'hemp worldwide',
];

// Known cultivar names — used for extraction & counting
export const KNOWN_CULTIVARS = [
  'suver haze', 'lifter', 'hawaiian haze', 'elektra', 'sour space candy',
  'special sauce', 'cherry wine', 'cherry blossom', 'remedy',
  'bubba kush', 'legendary og', 'banana mac',
  'abacus', 'baox', 'berry blossom', 'boax',
  "cat's meow", 'ceiba', 'frosted kush',
  'grapefruit', 'indoor mix', 'kush',
  'lemon octane', 'mac', 'pink panther',
  'sour suver', 'strawberry cake', 'wedding cake',
  'white cbg', 'john snow', 'stem cell cbg',
  'matterhorn cbg', 'orange glaze',
];

// Quality descriptors to track in community messages
export const QUALITY_DESCRIPTORS = [
  // positive
  'loud', 'dank', 'frosty', 'sticky', 'terpy', 'smooth',
  'clean ash', 'white ash', 'great cure', 'nice nose',
  'dense', 'chunky', 'fresh', 'potent', 'fire',
  'beautiful', 'gorgeous', 'dialed in',
  // negative
  'hay', 'harsh', 'dry', 'crispy', 'seeded', 'seeds',
  'stemmy', 'flat', 'muted', 'grassy', 'hot',
  'black ash', 'machine trimmed', 'larfy',
  'undercured', 'overcured', 'old',
];

// Community pulse KV key prefix for per-channel cursors
export const PULSE_CURSOR_PREFIX = 'COMMUNITY_PULSE_CURSOR:';

// Minimum messages required to post a pulse (skip if below this)
export const PULSE_MIN_MESSAGES = 5;

// ─── Scheduling ─────────────────────────────────────────────────────

// Day-of-week rotation for scheduled posts
// 0=Sun, 1=Mon, ..., 6=Sat
export const DAILY_ROTATION = {
  1: 'news',        // Monday
  2: 'legislation', // Tuesday
  3: 'studies',     // Wednesday
  4: 'trials',      // Thursday
  5: 'discussion',  // Friday
};

// Cron hours (UTC) for different post types
export const SCHEDULE = {
  RESEARCH_HOUR_UTC: 11,       // 6am CDT
  PULSE_HOUR_UTC: 14,          // 9am CDT, weekly on Saturday
  PULSE_DAY_UTC: 6,            // 0=Sun, 6=Sat
};

// ─── Discord Embed Palette ──────────────────────────────────────────
export const COLORS = {
  news:       0x2a9d8f,
  legislation: 0xe76f51,
  studies:    0x457b9d,
  trials:     0x9b72cf,
  pulse:      0xd4a373,
  discussion: 0x52b788,
};
