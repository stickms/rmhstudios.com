import { describe, expect, it } from 'vitest';
import { footrule, maxFootrule, pointsForDistance, ranksWithTies } from '../scoring';
import { formatRankingValue } from '../format';

const OFFICIAL = ['a', 'b', 'c', 'd', 'e'];

describe('footrule', () => {
  it('is 0 for the official order', () => {
    expect(footrule(OFFICIAL, [...OFFICIAL])).toBe(0);
  });

  it('is 12 for a reversed order of five', () => {
    expect(footrule(OFFICIAL, [...OFFICIAL].reverse())).toBe(12);
    expect(maxFootrule(5)).toBe(12);
  });

  it('adds up how far each item is from its place', () => {
    // a and b swapped: each is one place away
    expect(footrule(OFFICIAL, ['b', 'a', 'c', 'd', 'e'])).toBe(2);
    // a moved to the end: a is 4 away, the other four one each
    expect(footrule(OFFICIAL, ['b', 'c', 'd', 'e', 'a'])).toBe(8);
  });

  it('is symmetric', () => {
    const guess = ['c', 'a', 'e', 'b', 'd'];
    expect(footrule(OFFICIAL, guess)).toBe(footrule(guess, OFFICIAL));
  });

  it('refuses orders that are not the same labels once each', () => {
    expect(footrule(OFFICIAL, ['a', 'b', 'c', 'd'])).toBeNull();
    expect(footrule(OFFICIAL, ['a', 'a', 'c', 'd', 'e'])).toBeNull();
    expect(footrule(OFFICIAL, ['a', 'b', 'c', 'd', 'z'])).toBeNull();
  });

  it('never exceeds the maximum over every order of five', () => {
    const perms = (items: string[]): string[][] =>
      items.length <= 1
        ? [items]
        : items.flatMap((item, i) =>
            perms([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
          );
    const distances = perms(OFFICIAL).map((p) => footrule(OFFICIAL, p) as number);
    expect(Math.max(...distances)).toBe(12);
    expect(Math.min(...distances)).toBe(0);
    expect(distances.every((d) => d % 2 === 0)).toBe(true);
  });
});

describe('pointsForDistance', () => {
  it('is (12 - distance) x 50', () => {
    expect(pointsForDistance(12)).toBe(0);
    expect(pointsForDistance(10)).toBe(100);
    expect(pointsForDistance(2)).toBe(500);
    expect(pointsForDistance(8)).toBe(200);
  });

  it('adds 200 for a perfect order only', () => {
    expect(pointsForDistance(0)).toBe(600 + 200);
    expect(pointsForDistance(2)).toBe(500);
  });

  it('stays inside 0 to 800 even for an out-of-range distance', () => {
    expect(pointsForDistance(40)).toBe(0);
    expect(pointsForDistance(-3)).toBe(800);
  });
});

describe('ranksWithTies', () => {
  it('gives equal scores the same place and skips the next', () => {
    const ranked = ranksWithTies([
      { id: 'a', score: 900 },
      { id: 'b', score: 900 },
      { id: 'c', score: 700 },
      { id: 'd', score: 700 },
      { id: 'e', score: 100 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3, 3, 5]);
  });

  it('ranks a lone leader 1 and keeps the input order', () => {
    const ranked = ranksWithTies([
      { id: 'x', score: 5 },
      { id: 'y', score: 9 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['x', 2],
      ['y', 1],
    ]);
  });
});

describe('formatRankingValue', () => {
  it('writes years, BC years, latitudes and powers of ten', () => {
    expect(formatRankingValue(1066, 'year')).toBe('1066');
    expect(formatRankingValue(-44, 'year')).toBe('44 BC');
    expect(formatRankingValue(-35.28, 'degrees latitude')).toBe('35.28° S');
    expect(formatRankingValue(64.15, 'degrees latitude')).toBe('64.15° N');
    expect(formatRankingValue(-6, 'power of ten')).toBe('10^-6');
  });

  it('groups digits and appends the unit', () => {
    expect(formatRankingValue(142984, 'km')).toBe('142,984 km');
    expect(formatRankingValue(0.534, 'g/cm³')).toBe('0.534 g/cm³');
  });
});
