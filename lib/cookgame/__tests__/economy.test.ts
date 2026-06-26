import { describe, it, expect } from 'vitest';
import {
  buyerOffer, heatPenaltyFactor, applyHeatOnSale, decayHeat, packageProduct,
  HEAT_PER_SALE, MAX_HEAT, HEAT_PENALTY_THRESHOLD, UNITS_PER_BATCH,
} from '../economy';
import { BUYERS } from '../content';
import { productValue } from '../effects';
import type { Product } from '../types';

const doug = BUYERS.find((b) => b.id === 'doug')!;
const energizingProduct: Product = { baseId: 'greenstart', effects: ['energizing'] };

describe('heatPenaltyFactor', () => {
  it('is 1 below threshold', () => {
    expect(heatPenaltyFactor(HEAT_PENALTY_THRESHOLD - 1)).toBe(1);
  });
  it('is 0.5 at max heat', () => {
    expect(heatPenaltyFactor(MAX_HEAT)).toBeCloseTo(0.5, 5);
  });
});

describe('buyerOffer', () => {
  it('applies preference bonus when buyer likes an effect', () => {
    const base = productValue(energizingProduct);
    const offer = buyerOffer(energizingProduct, doug, 0, 1.0);
    // doug.basePriceFactor 0.9 * (1 + 0.25 preference) = 1.125
    expect(offer).toBe(Math.round(base * 0.9 * 1.25 * 1.0));
  });
  it('no preference bonus when effect absent', () => {
    const calmOnly: Product = { baseId: 'greenstart', effects: ['calming'] };
    const base = productValue(calmOnly);
    const offer = buyerOffer(calmOnly, doug, 0, 1.0);
    expect(offer).toBe(Math.round(base * 0.9 * 1.0));
  });
  it('reduces offer under high heat', () => {
    const low = buyerOffer(energizingProduct, doug, 0, 1.0);
    const high = buyerOffer(energizingProduct, doug, MAX_HEAT, 1.0);
    expect(high).toBeLessThan(low);
  });
});

describe('heat helpers', () => {
  it('applyHeatOnSale adds and clamps', () => {
    expect(applyHeatOnSale(0)).toBe(HEAT_PER_SALE);
    expect(applyHeatOnSale(MAX_HEAT)).toBe(MAX_HEAT);
  });
  it('decayHeat subtracts and floors at 0', () => {
    expect(decayHeat(10, 2)).toBe(9); // 0.5/s * 2s = 1
    expect(decayHeat(0.2, 100)).toBe(0);
  });
});

describe('packageProduct', () => {
  it('yields UNITS_PER_BATCH units', () => {
    expect(packageProduct(energizingProduct).units).toBe(UNITS_PER_BATCH);
  });
});
