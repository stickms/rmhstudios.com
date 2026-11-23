import { describe, expect, it } from 'vitest';
import { cumulativeAt, recencyWeights, seasonTotal, shareAt } from './shares';

const days = [
  { day: 0, count: 2 },
  { day: 3, count: 3 },
  { day: 10, count: 5 },
];

describe('shares', () => {
  it('accumulates through a day', () => {
    expect(cumulativeAt(days, 2)).toBe(2);
    expect(cumulativeAt(days, 3)).toBe(5);
    expect(seasonTotal(days)).toBe(10);
  });
  it('is a share of the season', () => {
    expect(shareAt(days, 3)).toBe(0.5);
    expect(shareAt(days, 99)).toBe(1);
    expect(shareAt(days, -1)).toBe(0);
    expect(shareAt([], 5)).toBe(0);
  });
  it('weights recent cycles more and sums to 1', () => {
    const w = recencyWeights(3);
    [4 / 7, 2 / 7, 1 / 7].forEach((e, i) => expect(w[i]).toBeCloseTo(e, 12));
    expect(recencyWeights(1)).toEqual([1]);
    expect(recencyWeights(0)).toEqual([]);
  });
});
