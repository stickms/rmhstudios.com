import { describe, it, expect } from 'vitest';
import {
  priceYes,
  priceNo,
  costToBuyShares,
  sharesForBudget,
  pricePercent,
} from '../lmsr';

const B = 120;

describe('lmsr', () => {
  it('starts at 50/50 with no shares outstanding', () => {
    expect(priceYes(0, 0, B)).toBeCloseTo(0.5, 10);
    expect(priceNo(0, 0, B)).toBeCloseTo(0.5, 10);
  });

  it('YES and NO prices always sum to 1', () => {
    for (const [qy, qn] of [[10, 3], [200, 50], [0, 400], [999, 1]]) {
      expect(priceYes(qy, qn, B) + priceNo(qy, qn, B)).toBeCloseTo(1, 10);
    }
  });

  it('keeps the price strictly inside (0, 1) for realistic skews', () => {
    // ~600 shares of one-sided flow on a b=120 book is already a lopsided book
    // but stays numerically inside the open interval.
    const p = priceYes(600, 0, B);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('buying YES raises the YES price', () => {
    const before = priceYes(0, 0, B);
    const after = priceYes(50, 0, B);
    expect(after).toBeGreaterThan(before);
  });

  it('costs more to buy the same shares as a side gets more expensive', () => {
    const cheap = costToBuyShares(0, 0, B, 'YES', 10);
    const pricey = costToBuyShares(200, 0, B, 'YES', 10);
    expect(pricey).toBeGreaterThan(cheap);
    // First shares of a fresh 50/50 market cost roughly half a coin each.
    expect(cheap / 10).toBeGreaterThan(0.4);
    expect(cheap / 10).toBeLessThan(0.6);
  });

  it('sharesForBudget is the inverse of costToBuyShares', () => {
    for (const [qy, qn, budget] of [
      [0, 0, 50],
      [100, 40, 120],
      [0, 300, 25],
      [500, 500, 200],
    ]) {
      const shares = sharesForBudget(qy, qn, B, 'YES', budget);
      const cost = costToBuyShares(qy, qn, B, 'YES', shares);
      expect(cost).toBeCloseTo(budget, 6);
    }
  });

  it('returns 0 shares for a non-positive budget', () => {
    expect(sharesForBudget(0, 0, B, 'YES', 0)).toBe(0);
    expect(sharesForBudget(0, 0, B, 'NO', -5)).toBe(0);
  });

  it('pricePercent is clamped to 1..99', () => {
    expect(pricePercent(0, 0, B)).toBe(50);
    expect(pricePercent(100000, 0, B)).toBe(99);
    expect(pricePercent(0, 100000, B)).toBe(1);
  });
});
