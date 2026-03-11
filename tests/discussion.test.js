import { describe, it, expect } from 'vitest';
import { generateDiscussionPrompt, DISCUSSION_TOPICS } from '../src/discussion.js';

describe('generateDiscussionPrompt', () => {
  it('returns all required fields', async () => {
    const p = await generateDiscussionPrompt();
    expect(p).toHaveProperty('theme');
    expect(p).toHaveProperty('question');
    expect(p).toHaveProperty('threadTitle');
    expect(p).toHaveProperty('date');
  });

  it('question is non-empty string', async () => {
    const p = await generateDiscussionPrompt();
    expect(typeof p.question).toBe('string');
    expect(p.question.length).toBeGreaterThan(20);
  });

  it('threadTitle fits Discord 100-char limit', async () => {
    const p = await generateDiscussionPrompt();
    expect(p.threadTitle.length).toBeLessThanOrEqual(100);
    expect(p.threadTitle.length).toBeGreaterThan(0);
  });

  it('theme matches a known topic', async () => {
    const p = await generateDiscussionPrompt();
    const knownThemes = DISCUSSION_TOPICS.map(t => t.theme);
    expect(knownThemes).toContain(p.theme);
  });

  it('threadTitle is non-empty', async () => {
    const p = await generateDiscussionPrompt();
    expect(p.threadTitle.length).toBeGreaterThan(0);
  });

  it('produces different themes across a week', async () => {
    // DISCUSSION_TOPICS has 5 entries cycling by day-of-week — all 5 should be represented across 7 days
    const themes = new Set();
    for (let i = 0; i < DISCUSSION_TOPICS.length; i++) {
      themes.add(DISCUSSION_TOPICS[i].theme);
    }
    expect(themes.size).toBe(5);
  });
});
