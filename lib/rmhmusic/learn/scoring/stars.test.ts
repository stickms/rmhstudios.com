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
});
