import { describe, expect, it } from 'vitest';
import { marketPoints, positionForecast, rankSeason } from '../scoring';

describe('forecast scoring', () => {
  it('prefers lastP, falls back to cost basis, skips mixed legacy positions', () => {
    expect(positionForecast({ lastP: 0.8, yesShares: 0, noShares: 5, spent: 1 })).toBe(0.8);
    expect(positionForecast({ lastP: null, yesShares: 10, noShares: 0, spent: 6 })).toBeCloseTo(
      0.6,
    );
    expect(positionForecast({ lastP: null, yesShares: 0, noShares: 10, spent: 4 })).toBeCloseTo(
      0.6,
    );
    expect(positionForecast({ lastP: null, yesShares: 10, noShares: 10, spent: 9 })).toBeNull();
  });

  it('rewards confident correct calls and punishes confident wrong ones', () => {
    expect(marketPoints(0.5, true)).toBe(0);
    expect(marketPoints(0.9, true)).toBeGreaterThan(0);
    expect(marketPoints(0.9, false)).toBeLessThan(0);
  });

  it('ranks by points and averages Brier per scored market', () => {
    const r = rankSeason([
      { userId: 'a', p: 0.9, outcomeYes: true },
      { userId: 'b', p: 0.9, outcomeYes: false },
      { userId: 'b', p: 0.6, outcomeYes: true },
    ]);
    expect(r.map((x) => x.userId)).toEqual(['a', 'b']);
    expect(r[1]!.scored).toBe(2);
  });
});
