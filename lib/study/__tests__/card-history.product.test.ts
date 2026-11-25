import { describe, expect, it } from 'vitest';
import { cardState, emptyHistory, FRESH_SCHEDULE, gradeKey, GRADE_KEYS, HISTORY_LIMIT } from '@/lib/study/card-history';

const row = (over: Partial<{ repetitions: number; suspendedAt: Date | null; suspendReason: string | null }> = {}) => ({
  repetitions: 0,
  suspendedAt: null,
  suspendReason: null,
  ...over,
});

describe('card state', () => {
  it('is new with no schedule row', () => {
    expect(cardState({ review: null, reviewedSinceReset: false })).toBe('new');
  });
  it('is new after a start-over until the card is reviewed again', () => {
    expect(cardState({ review: row(), reviewedSinceReset: false })).toBe('new');
  });
  it('is learning when reviewed but not yet passed', () => {
    expect(cardState({ review: row(), reviewedSinceReset: true })).toBe('learning');
  });
  it('is review once passed', () => {
    expect(cardState({ review: row({ repetitions: 2 }), reviewedSinceReset: true })).toBe('review');
  });
  it('is suspended or leech by the reason', () => {
    const at = new Date(0);
    expect(cardState({ review: row({ suspendedAt: at, suspendReason: 'manual' }), reviewedSinceReset: true })).toBe(
      'suspended',
    );
    expect(cardState({ review: row({ suspendedAt: at, suspendReason: 'leech' }), reviewedSinceReset: true })).toBe(
      'leech',
    );
  });
});

describe('grade names', () => {
  it('names 0 to 3 as Again, Hard, Good, Easy', () => {
    expect(GRADE_KEYS).toEqual(['again', 'hard', 'good', 'easy']);
    expect([0, 1, 2, 3].map(gradeKey)).toEqual(['again', 'hard', 'good', 'easy']);
  });
  it('has no name for anything else', () => {
    expect([-1, 4, 1.5, Number.NaN].map(gradeKey)).toEqual([null, null, null, null]);
  });
});

describe('defaults', () => {
  it('starts a card over as a new one and lists at most 100 reviews', () => {
    expect(FRESH_SCHEDULE).toEqual({ easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 });
    expect(emptyHistory()).toEqual({ dueAt: null, intervalDays: 0, easeFactor: 2.5, lapses: 0 });
    expect(HISTORY_LIMIT).toBe(100);
  });
});
