import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fallbackWorld, fallbackChapter } from '../fallback';
import { generateOutline, scribeChapter } from '../generate.server';

const world = fallbackWorld('ember-tide-hush-417', '');
const hadKey = process.env.DEEPSEEK_API_KEY;

beforeAll(() => { delete process.env.DEEPSEEK_API_KEY; });
afterAll(() => { if (hadKey !== undefined) process.env.DEEPSEEK_API_KEY = hadKey; });

describe('generateOutline (no AI)', () => {
  it('returns a deterministic detailed outline', async () => {
    const outline = await generateOutline(world);
    expect(outline.source).toBe('fallback');
    expect(outline.chapters).toHaveLength(world.routePlan.totalChapters);
    expect(outline.chapters[0].intent.length).toBeGreaterThan(0);
  });
});

describe('scribeChapter (no AI)', () => {
  it('returns a well-formed fallback ledger entry', async () => {
    const entry = await scribeChapter(world, fallbackChapter(world, 0));
    expect(entry.index).toBe(0);
    expect(entry.summary.length).toBeGreaterThan(0);
  });
});
