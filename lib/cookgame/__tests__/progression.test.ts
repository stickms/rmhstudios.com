import { describe, it, expect } from 'vitest';
import {
  xpForSale, xpForRecipe, xpForProduction, rankForXp, xpToNextRank, perksAtRank, RANKS,
} from '../progression';

describe('xp sources', () => {
  it('xpForSale scales with value, floored at 1', () => {
    expect(xpForSale(40)).toBe(10);
    expect(xpForSale(0)).toBe(1);
    expect(xpForSale(2)).toBe(1);
  });
  it('recipe and production are fixed positive amounts', () => {
    expect(xpForRecipe()).toBeGreaterThan(0);
    expect(xpForProduction()).toBeGreaterThan(0);
  });
});

describe('RANKS table', () => {
  it('is ordered, starts at rank 0 / threshold 0, perks are sane', () => {
    expect(RANKS[0].rank).toBe(0);
    expect(RANKS[0].xpThreshold).toBe(0);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].xpThreshold).toBeGreaterThan(RANKS[i - 1].xpThreshold);
      expect(RANKS[i].rank).toBe(i);
    }
    for (const r of RANKS) {
      expect(r.perk.priceMult).toBeGreaterThanOrEqual(1);   // price only improves
      expect(r.perk.heatMult).toBeLessThanOrEqual(1);        // heat only improves
      expect(r.perk.cooldownMult).toBeLessThanOrEqual(1);
    }
  });
});

describe('rankForXp / xpToNextRank', () => {
  it('maps xp to the highest reached rank', () => {
    expect(rankForXp(0).rank).toBe(0);
    expect(rankForXp(RANKS[1].xpThreshold).rank).toBe(1);
    expect(rankForXp(RANKS[1].xpThreshold - 1).rank).toBe(0);
    expect(rankForXp(99_999_999).rank).toBe(RANKS[RANKS.length - 1].rank);
  });
  it('xpToNextRank is remaining xp, 0 at max', () => {
    expect(xpToNextRank(0)).toBe(RANKS[1].xpThreshold);
    expect(xpToNextRank(99_999_999)).toBe(0);
  });
});

describe('perksAtRank', () => {
  it('returns that rank perk and clamps out-of-range', () => {
    expect(perksAtRank(0)).toEqual(RANKS[0].perk);
    expect(perksAtRank(-5)).toEqual(RANKS[0].perk);
    expect(perksAtRank(999)).toEqual(RANKS[RANKS.length - 1].perk);
  });
});
