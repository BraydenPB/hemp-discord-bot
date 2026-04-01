import { describe, it, expect } from 'vitest';
import { fetchHempResearch, fetchFlowerNews, fetchLegislation, fetchStudies, fetchTrials, scoreRelevance } from '../src/research.js';
import { FLOWER_NEWS_SOURCES } from '../src/config.js';

describe('scoreRelevance', () => {
  it('scores flower-specific content higher than generic hemp', () => {
    const flowerScore = scoreRelevance('New hemp flower cultivar with loud terpene profile from craft grower');
    const genericScore = scoreRelevance('Hemp fiber industry sees growth in EU markets');
    expect(flowerScore).toBeGreaterThan(genericScore);
  });

  it('deprioritizes industrial/investment content', () => {
    const investScore = scoreRelevance('Hemp stock IPO earnings report for industrial fiber company');
    expect(investScore).toBeLessThan(0);
  });

  it('returns 0 for unrelated content', () => {
    expect(scoreRelevance('How to make banana bread at home')).toBe(0);
  });

  it('boosts CBD/CBG flower mentions', () => {
    const score = scoreRelevance('CBD flower review: great nose and smooth smoke');
    expect(score).toBeGreaterThan(5);
  });
});

describe('fetchFlowerNews', () => {
  it('returns articles with required fields', async () => {
    const articles = await fetchFlowerNews();
    expect(Array.isArray(articles)).toBe(true);
    if (articles.length > 0) {
      const a = articles[0];
      expect(a).toHaveProperty('title');
      expect(a).toHaveProperty('link');
      expect(a).toHaveProperty('source');
      expect(a).toHaveProperty('relevance');
    }
  }, 20000);
}, 25000);

// Network-dependent tests: these call live APIs and gracefully skip when offline.

describe('fetchLegislation', () => {
  it('returns an array with bill fields (or empty if offline)', async () => {
    const bills = await fetchLegislation();
    expect(Array.isArray(bills)).toBe(true);
    if (bills.length > 0) {
      const b = bills[0];
      expect(b).toHaveProperty('title');
      expect(b).toHaveProperty('link');
      expect(b).toHaveProperty('source');
      expect(b).toHaveProperty('billId');
      expect(b).toHaveProperty('flowerRelevant');
    }
  }, 25000);
}, 30000);

describe('fetchStudies', () => {
  it('returns an array with study fields (or empty if offline)', async () => {
    const studies = await fetchStudies();
    expect(Array.isArray(studies)).toBe(true);
    if (studies.length > 0) {
      const s = studies[0];
      expect(s).toHaveProperty('title');
      expect(s).toHaveProperty('link');
      expect(s.link).toContain('pubmed');
    }
  }, 25000);
}, 30000);

describe('fetchTrials', () => {
  it('returns an array with trial fields (or empty if offline)', async () => {
    const trials = await fetchTrials();
    expect(Array.isArray(trials)).toBe(true);
    if (trials.length > 0) {
      const t = trials[0];
      expect(t).toHaveProperty('title');
      expect(t).toHaveProperty('link');
      expect(t.link).toContain('clinicaltrials.gov');
    }
  }, 25000);
}, 30000);

describe('fetchHempResearch', () => {
  it('returns object with all four categories', async () => {
    const r = await fetchHempResearch();
    expect(r).toHaveProperty('news');
    expect(r).toHaveProperty('legislation');
    expect(r).toHaveProperty('studies');
    expect(r).toHaveProperty('trials');
    expect(r).toHaveProperty('fetchedAt');
    console.log(`news:${r.news.length} legislation:${r.legislation.length} studies:${r.studies.length} trials:${r.trials.length}`);
  }, 30000);
}, 35000);

describe('RSS feed sources', () => {
  it('flower news feeds config is valid', () => {
    expect(FLOWER_NEWS_SOURCES.length).toBeGreaterThan(0);
    for (const s of FLOWER_NEWS_SOURCES) {
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('url');
      expect(s.url).toMatch(/^https?:\/\//);
    }
  });
});
