import { describe, expect, it } from 'vitest';
import { scoreFrom, starsFor } from './stars';

describe('starsFor', () => {
  it.each([
    [100, 3],
    [95, 3],
    [94, 2],
    [80, 2],
    [79, 1],
    [60, 1],
    [59, 0],
    [0, 0],
    [NaN, 0],
    [-5, 0],
    [-Infinity, 0],
    [250, 3],
  ] as const)('score %i → %i stars', (score, stars) => {
    expect(starsFor(score)).toBe(stars);
  });
});

describe('scoreFrom', () => {
  it('rounds to a whole percent', () => {
    expect(scoreFrom(7, 10)).toBe(70);
    expect(scoreFrom(2, 3)).toBe(67);
  });
  it('is 0 with nothing attempted', () => {
    expect(scoreFrom(0, 0)).toBe(0);
  });
  it('is 0 for NaN, negative or non-finite inputs', () => {
    const odd = [NaN, -1, Infinity, -Infinity];
    for (const a of odd) expect(scoreFrom(a, 10)).toBe(0);
    for (const b of odd) expect(scoreFrom(5, b)).toBe(0);
    expect(scoreFrom(Infinity, Infinity)).toBe(0);
    expect(scoreFrom(NaN, NaN)).toBe(0);
  });
  it('caps an over-count at 100', () => {
    expect(scoreFrom(12, 10)).toBe(100);
  });
});
