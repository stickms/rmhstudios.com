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
  it('is 1 exactly at the threshold', () => {
    expect(heatPenaltyFactor(HEAT_PENALTY_THRESHOLD)).toBe(1);
  });
  it('clamps to 0.5 above max heat', () => {
    expect(heatPenaltyFactor(150)).toBeCloseTo(0.5, 5);
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
  it('reduces offer under high heat by the heat penalty factor', () => {
    const low = buyerOffer(energizingProduct, doug, 0, 1.0);
    const high = buyerOffer(energizingProduct, doug, MAX_HEAT, 1.0);
    expect(high).toBeLessThan(low);
    const base = productValue(energizingProduct);
    // doug.basePriceFactor 0.9 * (1 + 0.25 preference) * heatPenaltyFactor(MAX_HEAT)=0.5
    expect(high).toBe(Math.round(base * 0.9 * 1.25 * 0.5 * 1.0));
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
  it('deep-copies the effects array (no aliasing of input)', () => {
    const result = packageProduct(energizingProduct);
    expect(result.product.effects).not.toBe(energizingProduct.effects);
    expect(result.product.effects).toEqual(energizingProduct.effects);
  });
});

describe('packageProduct qualityMult', () => {
  it('preserves qualityMult on packaged product', () => {
    const p: Product = { baseId: 'glimmerdust', effects: ['glowing'], qualityMult: 1.25 };
    expect(packageProduct(p).product.qualityMult).toBe(1.25);
  });
});
