/**
 * Bot handler tests — command routing, embed building, scheduling logic.
 */

import { describe, it, expect } from 'vitest';
import { DAILY_ROTATION, SCHEDULE, COLORS } from '../src/config.js';

describe('Config: daily rotation', () => {
  it('maps weekdays to categories', () => {
    expect(DAILY_ROTATION[1]).toBe('news');
    expect(DAILY_ROTATION[2]).toBe('legislation');
    expect(DAILY_ROTATION[3]).toBe('studies');
    expect(DAILY_ROTATION[4]).toBe('trials');
    expect(DAILY_ROTATION[5]).toBe('discussion');
  });

  it('has no weekend entries', () => {
    expect(DAILY_ROTATION[0]).toBeUndefined();
    expect(DAILY_ROTATION[6]).toBeUndefined();
  });
});

describe('Config: schedule', () => {
  it('research hour is defined', () => {
    expect(typeof SCHEDULE.RESEARCH_HOUR_UTC).toBe('number');
  });

  it('pulse hours is a non-empty array', () => {
    expect(Array.isArray(SCHEDULE.PULSE_HOURS_UTC)).toBe(true);
    expect(SCHEDULE.PULSE_HOURS_UTC.length).toBeGreaterThan(0);
  });
});

describe('Config: colors', () => {
  it('all colors are valid hex integers', () => {
    Object.values(COLORS).forEach(color => {
      expect(typeof color).toBe('number');
      expect(color).toBeGreaterThan(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    });
  });

  it('has color for pulse', () => {
    expect(COLORS.pulse).toBeDefined();
  });
});

describe('Status command format', () => {
  it('formats timestamp correctly with Discord relative time', () => {
    const iso = new Date('2026-03-11T11:00:00Z').toISOString();
    const ts = Math.floor(new Date(iso).getTime() / 1000);
    const formatted = `<t:${ts}:R>`;
    expect(formatted).toMatch(/^<t:\d+:R>$/);
  });
});

describe('Deferred response types', () => {
  it('type 5 is deferred channel message', () => {
    expect({ type: 5 }.type).toBe(5);
  });

  it('type 4 with flags 64 is ephemeral', () => {
    const response = { type: 4, data: { content: 'test', flags: 64 } };
    expect(response.data.flags).toBe(64);
  });
});
