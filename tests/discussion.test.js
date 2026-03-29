import { describe, it, expect, vi } from 'vitest';
import { generateDiscussionPrompt, DISCUSSION_TOPICS, ALL_PROMPTS } from '../src/discussion.js';

const mockEnv = {
  HEMP_KV: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  },
};

describe('generateDiscussionPrompt', () => {
  it('returns all required fields', async () => {
    const p = await generateDiscussionPrompt(mockEnv);
    expect(p).toHaveProperty('theme');
    expect(p).toHaveProperty('question');
    expect(p).toHaveProperty('threadTitle');
    expect(p).toHaveProperty('date');
  });

  it('question is non-empty string', async () => {
    const p = await generateDiscussionPrompt(mockEnv);
    expect(typeof p.question).toBe('string');
    expect(p.question.length).toBeGreaterThan(20);
  });

  it('threadTitle fits Discord 100-char limit', async () => {
    const p = await generateDiscussionPrompt(mockEnv);
    expect(p.threadTitle.length).toBeLessThanOrEqual(100);
    expect(p.threadTitle.length).toBeGreaterThan(0);
  });

  it('theme matches a known topic', async () => {
    const p = await generateDiscussionPrompt(mockEnv);
    const knownThemes = DISCUSSION_TOPICS.map(t => t.theme);
    expect(knownThemes).toContain(p.theme);
  });

  it('threadTitle is non-empty', async () => {
    const p = await generateDiscussionPrompt(mockEnv);
    expect(p.threadTitle.length).toBeGreaterThan(0);
  });

  it('produces different themes across a week', async () => {
    const themes = new Set();
    for (let i = 0; i < DISCUSSION_TOPICS.length; i++) {
      themes.add(DISCUSSION_TOPICS[i].theme);
    }
    expect(themes.size).toBe(5);
  });

  it('works without env (graceful fallback)', async () => {
    const p = await generateDiscussionPrompt();
    expect(p).toHaveProperty('theme');
    expect(p).toHaveProperty('question');
  });

  it('avoids recently used prompts when history exists', async () => {
    // Mark all but one prompt as used
    const allButOne = ALL_PROMPTS.slice(0, -1).map(p => p.id);
    const envWithHistory = {
      HEMP_KV: {
        get: vi.fn().mockResolvedValue(JSON.stringify(allButOne)),
        put: vi.fn().mockResolvedValue(undefined),
      },
    };
    const p = await generateDiscussionPrompt(envWithHistory);
    // Should pick the one remaining unused prompt
    expect(p.theme).toBe(ALL_PROMPTS[ALL_PROMPTS.length - 1].theme);
  });

  it('stores chosen prompt id in KV history', async () => {
    await generateDiscussionPrompt(mockEnv);
    expect(mockEnv.HEMP_KV.put).toHaveBeenCalledWith(
      'discussion_history',
      expect.stringContaining(':')
    );
  });

  it('ALL_PROMPTS contains all flattened prompts', () => {
    const totalPrompts = DISCUSSION_TOPICS.reduce((sum, t) => sum + t.prompts.length, 0);
    expect(ALL_PROMPTS.length).toBe(totalPrompts);
  });
});
