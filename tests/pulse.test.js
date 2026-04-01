import { describe, it, expect } from 'vitest';
import { aggregateMessages, buildPulseEmbed } from '../src/pulse.js';

describe('aggregateMessages', () => {
  const sampleMessages = [
    { content: 'Just got some Suver Haze from Flow Gardens, the nose on this is incredible. Super loud and terpy.', timestamp: '2026-03-31T14:00:00Z' },
    { content: 'WNC CBD has been killing it lately. Their Banana Mac is frosty as hell.', timestamp: '2026-03-31T14:05:00Z' },
    { content: 'Anyone tried the new drop from Flow Gardens? Heard mixed things about the cure.', timestamp: '2026-03-31T14:10:00Z' },
    { content: 'The Lifter from Beleafer was a bit dry and hay-like, not impressed.', timestamp: '2026-03-31T14:15:00Z' },
    { content: 'Flow Gardens Suver Haze is smooth, clean ash, great for evening relaxation.', timestamp: '2026-03-31T14:20:00Z' },
    { content: 'Just some random conversation about other stuff entirely.', timestamp: '2026-03-31T14:25:00Z' },
  ];
  const channelIds = ['123456'];

  it('counts vendor mentions correctly', () => {
    const agg = aggregateMessages(sampleMessages, channelIds);
    expect(agg.vendors.length).toBeGreaterThan(0);
    const fg = agg.vendors.find(v => v.name === 'flow gardens');
    expect(fg).toBeDefined();
    expect(fg.count).toBe(3);
  });

  it('counts cultivar mentions correctly', () => {
    const agg = aggregateMessages(sampleMessages, channelIds);
    const sh = agg.cultivars.find(c => c.name === 'suver haze');
    expect(sh).toBeDefined();
    expect(sh.count).toBe(2);
  });

  it('extracts quality terms with sentiment', () => {
    const agg = aggregateMessages(sampleMessages, channelIds);
    expect(agg.qualityTerms.length).toBeGreaterThan(0);
    const frosty = agg.qualityTerms.find(q => q.term === 'frosty');
    expect(frosty).toBeDefined();
    expect(frosty.sentiment).toBe('positive');
    const hay = agg.qualityTerms.find(q => q.term === 'hay');
    expect(hay).toBeDefined();
    expect(hay.sentiment).toBe('negative');
  });

  it('sets correct window timestamps', () => {
    const agg = aggregateMessages(sampleMessages, channelIds);
    expect(agg.window.start).toBe('2026-03-31T14:00:00Z');
    expect(agg.window.end).toBe('2026-03-31T14:25:00Z');
  });

  it('reports correct message count', () => {
    const agg = aggregateMessages(sampleMessages, channelIds);
    expect(agg.messageCount).toBe(6);
  });

  it('handles empty message list gracefully', () => {
    const agg = aggregateMessages([], ['123']);
    expect(agg.messageCount).toBe(0);
    expect(agg.vendors).toEqual([]);
    expect(agg.cultivars).toEqual([]);
    expect(agg.qualityTerms).toEqual([]);
  });
});

describe('buildPulseEmbed', () => {
  it('builds a valid embed with all fields', () => {
    const agg = {
      window: { start: '2026-03-31T14:00:00Z', end: '2026-03-31T22:00:00Z' },
      messageCount: 47,
      channelsRead: ['123'],
      vendors: [{ name: 'flow gardens', count: 8 }, { name: 'wnc cbd', count: 5 }],
      cultivars: [{ name: 'suver haze', count: 6 }],
      qualityTerms: [
        { term: 'frosty', count: 4, sentiment: 'positive' },
        { term: 'hay', count: 2, sentiment: 'negative' },
      ],
      themes: [],
    };

    const embed = buildPulseEmbed(agg, 'The server is buzzing about Flow Gardens.');
    expect(embed.title).toBe('📊 Community Pulse');
    expect(embed.description).toContain('Flow Gardens');
    expect(embed.fields.length).toBeGreaterThanOrEqual(3); // vendors, cultivars, quality (split pos/neg)
    expect(embed.footer.text).toContain('47 msgs');
  });

  it('handles empty aggregation', () => {
    const agg = {
      window: { start: '2026-03-31T14:00:00Z', end: '2026-03-31T14:00:00Z' },
      messageCount: 0,
      channelsRead: [],
      vendors: [],
      cultivars: [],
      qualityTerms: [],
      themes: [],
    };

    const embed = buildPulseEmbed(agg, null);
    expect(embed.title).toBe('📊 Community Pulse');
    expect(embed.fields.length).toBe(0);
  });
});
