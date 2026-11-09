import { describe, expect, it } from 'vitest';
import { lessonCompleteSchema, profileSchema, reviewBatchSchema } from './schemas';

const profile = { instrument: 'piano', input: 'screen', latencyMs: 0, dailyGoal: 1 };

describe('lessonCompleteSchema', () => {
  const ok = { lessonId: 'play-first-note', stars: 3, score: 100 };
  it('accepts the edges', () => {
    expect(lessonCompleteSchema.safeParse(ok).success).toBe(true);
    expect(lessonCompleteSchema.safeParse({ ...ok, stars: 0, score: 0 }).success).toBe(true);
  });
  it.each([
    { stars: 4 },
    { stars: -1 },
    { stars: 1.5 },
    { score: 101 },
    { score: -1 },
    { lessonId: '' },
    { lessonId: 'x'.repeat(65) },
  ])('rejects %j', (patch) => {
    expect(lessonCompleteSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});

describe('profileSchema', () => {
  it('accepts the edges', () => {
    expect(profileSchema.safeParse(profile).success).toBe(true);
    expect(profileSchema.safeParse({ ...profile, latencyMs: -500, dailyGoal: 10 }).success).toBe(
      true,
    );
    expect(profileSchema.safeParse({ ...profile, latencyMs: 500, input: 'mic' }).success).toBe(
      true,
    );
  });
  it.each([
    { instrument: 'drums' },
    { input: 'touch' },
    { latencyMs: 501 },
    { latencyMs: -501 },
    { latencyMs: 1.5 },
    { dailyGoal: 0 },
    { dailyGoal: 11 },
  ])('rejects %j', (patch) => {
    expect(profileSchema.safeParse({ ...profile, ...patch }).success).toBe(false);
  });
});

describe('reviewBatchSchema', () => {
  const one = { cardId: 'treble:64', grade: 'good' };
  it('accepts one to fifty reviews, every grade', () => {
    expect(reviewBatchSchema.safeParse({ reviews: [one] }).success).toBe(true);
    expect(reviewBatchSchema.safeParse({ reviews: Array(50).fill(one) }).success).toBe(true);
    for (const grade of ['again', 'hard', 'good', 'easy']) {
      expect(reviewBatchSchema.safeParse({ reviews: [{ ...one, grade }] }).success).toBe(true);
    }
    expect(
      reviewBatchSchema.safeParse({ reviews: [{ ...one, cardId: 'x'.repeat(64) }] }).success,
    ).toBe(true);
  });
  it.each([
    { reviews: [] },
    { reviews: Array(51).fill(one) },
    { reviews: [{ ...one, grade: 'perfect' }] },
    { reviews: [{ ...one, grade: 3 }] },
    { reviews: [{ ...one, cardId: '' }] },
    { reviews: [{ ...one, cardId: 'x'.repeat(65) }] },
    { reviews: [{ grade: 'good' }] },
    {},
  ])('rejects %j', (body) => {
    expect(reviewBatchSchema.safeParse(body).success).toBe(false);
  });
  it('drops anything else a client sends, such as its own clock', () => {
    const parsed = reviewBatchSchema.parse({
      reviews: [{ ...one, at: 0, due: 0 }],
      now: 0,
    });
    expect(parsed).toEqual({ reviews: [one] });
  });
});
