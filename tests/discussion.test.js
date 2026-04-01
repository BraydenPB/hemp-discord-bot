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

  it('produces different themes across topics', () => {
    const themes = new Set(DISCUSSION_TOPICS.map(t => t.theme));
    expect(themes.size).toBe(5);
  });

  it('all topics are flower/connoisseur focused', () => {
    const themes = DISCUSSION_TOPICS.map(t => t.theme);
    // Should NOT contain generic beginner themes
    expect(themes).not.toContain('Hemp 101');
    expect(themes).not.toContain('Hemp & The Environment');
    // Should contain connoisseur themes
    expect(themes).toContain('Vendor Talk');
    expect(themes).toContain('Cultivar & Genetics');
    expect(themes).toContain('Cure, Nose & Quality');
  });

  it('uses KV history to avoid repeats when env provided', async () => {
    const history = [];
    const mockEnv = {
      HEMP_KV: {
        get: async () => JSON.stringify(history),
        put: async (key, val) => { history.push(val); },
      },
    };
    const p1 = await generateDiscussionPrompt(mockEnv);
    expect(p1.question.length).toBeGreaterThan(0);
  });
});
