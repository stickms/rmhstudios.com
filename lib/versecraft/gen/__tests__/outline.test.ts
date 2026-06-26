import { describe, it, expect } from 'vitest';
import { fallbackWorld } from '../fallback';
import { buildSkeletonOutline, buildDetailedOutline, beatForChapter } from '../outline';

const world = fallbackWorld('ember-tide-hush-417', '');

describe('buildSkeletonOutline', () => {
  it('produces one ActPlan per act in the route plan', () => {
    const outline = buildSkeletonOutline(world);
    expect(outline.acts).toHaveLength(world.routePlan.actCount);
    expect(outline.acts.map((a) => a.act)).toEqual([1, 2, 3, 4, 5]);
    expect(outline.source).toBe('fallback');
  });

  it('produces one ChapterBeat per chapter, each tagged to a valid act', () => {
    const outline = buildSkeletonOutline(world);
    expect(outline.chapters).toHaveLength(world.routePlan.totalChapters);
    for (const beat of outline.chapters) {
      expect(beat.act).toBeGreaterThanOrEqual(1);
      expect(beat.act).toBeLessThanOrEqual(world.routePlan.actCount);
      expect(beat.dramaticQuestion.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a seed', () => {
    expect(buildSkeletonOutline(world)).toEqual(buildSkeletonOutline(fallbackWorld('ember-tide-hush-417', '')));
  });
});

describe('buildDetailedOutline', () => {
  it('fills plant/payoff/intent for every chapter', () => {
    const outline = buildDetailedOutline(world);
    expect(outline.chapters).toHaveLength(world.routePlan.totalChapters);
    for (const beat of outline.chapters) {
      expect(beat.intent.length).toBeGreaterThan(0);
      expect(Array.isArray(beat.plant)).toBe(true);
      expect(Array.isArray(beat.payoff)).toBe(true);
    }
  });
});

describe('beatForChapter', () => {
  it('returns the matching beat and clamps out-of-range indices', () => {
    const outline = buildDetailedOutline(world);
    expect(beatForChapter(outline, 0).index).toBe(0);
    expect(beatForChapter(outline, 999).index).toBe(world.routePlan.totalChapters - 1);
  });
});
