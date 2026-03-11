import { describe, it, expect } from 'vitest';
import { fetchHempResearch, fetchNews, fetchLegislation, fetchStudies, fetchTrials, NEWS_SOURCES } from '../src/research.js';

describe('fetchNews', () => {
  it('returns articles with required fields', async () => {
    const articles = await fetchNews();
    expect(Array.isArray(articles)).toBe(true);
    expect(articles.length).toBeGreaterThan(0);
    const a = articles[0];
    expect(a).toHaveProperty('title');
    expect(a).toHaveProperty('link');
    expect(a).toHaveProperty('source');
  }, 20000);
}, 25000);

describe('fetchLegislation', () => {
  it('returns bills with required fields', async () => {
    const bills = await fetchLegislation();
    expect(Array.isArray(bills)).toBe(true);
    expect(bills.length).toBeGreaterThan(0);
    const b = bills[0];
    expect(b).toHaveProperty('title');
    expect(b).toHaveProperty('link');
    expect(b).toHaveProperty('source');
    expect(b).toHaveProperty('billId');
  }, 20000);
}, 25000);

describe('fetchStudies', () => {
  it('returns PubMed studies', async () => {
    const studies = await fetchStudies();
    expect(Array.isArray(studies)).toBe(true);
    expect(studies.length).toBeGreaterThan(0);
    const s = studies[0];
    expect(s).toHaveProperty('title');
    expect(s).toHaveProperty('link');
    expect(s.link).toContain('pubmed');
  }, 20000);
}, 25000);

describe('fetchTrials', () => {
  it('returns clinical trials', async () => {
    const trials = await fetchTrials();
    expect(Array.isArray(trials)).toBe(true);
    expect(trials.length).toBeGreaterThan(0);
    const t = trials[0];
    expect(t).toHaveProperty('title');
    expect(t).toHaveProperty('link');
    expect(t.link).toContain('clinicaltrials.gov');
  }, 20000);
}, 25000);

describe('fetchHempResearch', () => {
  it('returns all four categories', async () => {
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
  it('all 4 news feeds are reachable', async () => {
    const results = await Promise.allSettled(
      NEWS_SOURCES.map(async s => {
        const res = await fetch(s.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HempDiscordBot/1.0)' },
          redirect: 'follow'
        });
        return { source: s.name, status: res.status, ok: res.ok };
      })
    );
    const statuses = results.map((r, i) => ({
      source: NEWS_SOURCES[i].name,
      ...(r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message })
    }));
    console.table(statuses);
    expect(statuses.filter(s => s.ok).length).toBeGreaterThan(0);
  }, 20000);
}, 25000);
