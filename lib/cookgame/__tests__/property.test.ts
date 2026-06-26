import { describe, it, expect } from 'vitest';
import { PROPERTY_TIERS, propertyEffects, stashCount } from '../property';
import type { InventoryState } from '../types';

const inv = (baseUnits: number[], packagedUnits: number[]): InventoryState => ({
  additives: {}, inputs: {},
  baseStock: baseUnits.map((u) => ({ baseId: 'greenstart' as const, qualityMult: 1, bonusEffects: [], units: u })),
  plots: [], dryingRack: [],
  workProduct: { baseId: 'greenstart', effects: ['energizing'] }, // must NOT be counted
  packaged: packagedUnits.map((u) => ({ product: { baseId: 'greenstart' as const, effects: [] }, units: u })),
});

describe('PROPERTY_TIERS', () => {
  it('tier 0 is the free starting lot with 3 plots', () => {
    expect(PROPERTY_TIERS[0]).toMatchObject({ tier: 0, cost: 0, rankReq: 0, plots: 3 });
  });
  it('is ordered: ascending tier, non-decreasing plots/stashCap, non-increasing cooldownMult', () => {
    for (let i = 1; i < PROPERTY_TIERS.length; i++) {
      expect(PROPERTY_TIERS[i].tier).toBe(i);
      expect(PROPERTY_TIERS[i].plots).toBeGreaterThanOrEqual(PROPERTY_TIERS[i - 1].plots);
      expect(PROPERTY_TIERS[i].stashCap).toBeGreaterThanOrEqual(PROPERTY_TIERS[i - 1].stashCap);
      expect(PROPERTY_TIERS[i].cooldownMult).toBeLessThanOrEqual(PROPERTY_TIERS[i - 1].cooldownMult);
      expect(PROPERTY_TIERS[i].cost).toBeGreaterThan(PROPERTY_TIERS[i - 1].cost);
    }
  });
});

describe('propertyEffects', () => {
  it('returns the tier effects and clamps out-of-range', () => {
    expect(propertyEffects(0)).toEqual({
      plots: PROPERTY_TIERS[0].plots, cooldownMult: PROPERTY_TIERS[0].cooldownMult,
      stashCap: PROPERTY_TIERS[0].stashCap, passiveIncomePerSec: PROPERTY_TIERS[0].passiveIncomePerSec,
    });
    expect(propertyEffects(-1)).toEqual(propertyEffects(0));
    expect(propertyEffects(999)).toEqual(propertyEffects(PROPERTY_TIERS.length - 1));
  });
});

describe('stashCount', () => {
  it('sums baseStock + packaged units, ignoring workProduct', () => {
    expect(stashCount(inv([3, 2], [5, 4]))).toBe(14);
    expect(stashCount(inv([], []))).toBe(0);
  });
});
