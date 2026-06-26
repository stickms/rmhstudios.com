import type { Product, Buyer } from './types';
import { productValue } from './effects';

export const HEAT_PER_SALE = 8;
export const HEAT_DECAY_PER_SEC = 0.5;
export const HEAT_PENALTY_THRESHOLD = 60;
export const MAX_HEAT = 100;
export const UNITS_PER_BATCH = 5;

export function heatPenaltyFactor(heat: number): number {
  if (heat < HEAT_PENALTY_THRESHOLD) return 1;
  const span = MAX_HEAT - HEAT_PENALTY_THRESHOLD;
  const over = Math.min(heat, MAX_HEAT) - HEAT_PENALTY_THRESHOLD;
  return 1 - 0.5 * (over / span); // 1 → 0.5 across the band
}

export function buyerOffer(product: Product, buyer: Buyer, heat: number, variance: number, priceMult = 1): number {
  const base = productValue(product);
  const pref = product.effects.includes(buyer.preferredEffect) ? 1 + buyer.preferenceBonus : 1;
  const offer = Math.round(base * buyer.basePriceFactor * pref * heatPenaltyFactor(heat) * variance);
  return Math.round(offer * priceMult);
}

export function applyHeatOnSale(heat: number, heatMult = 1): number {
  return Math.min(MAX_HEAT, heat + HEAT_PER_SALE * heatMult);
}

export function decayHeat(heat: number, dtSeconds: number): number {
  return Math.max(0, heat - HEAT_DECAY_PER_SEC * dtSeconds);
}

export function packageProduct(product: Product): { product: Product; units: number } {
  return {
    product: { baseId: product.baseId, effects: [...product.effects], qualityMult: product.qualityMult },
    units: UNITS_PER_BATCH,
  };
}
