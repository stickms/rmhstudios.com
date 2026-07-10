import type { InventoryState } from './types';

export interface PropertyTier {
  tier: number; name: string; cost: number; rankReq: number;
  plots: number; cooldownMult: number; stashCap: number; passiveIncomePerSec: number;
}

export const PROPERTY_TIERS: PropertyTier[] = [
  { tier: 0, name: 'Rented Lot',   cost: 0,    rankReq: 0, plots: 3,  cooldownMult: 1.0,  stashCap: 60,  passiveIncomePerSec: 0 },
  { tier: 1, name: 'The Lockup',   cost: 500,  rankReq: 1, plots: 6,  cooldownMult: 0.9,  stashCap: 150, passiveIncomePerSec: 0.5 },
  { tier: 2, name: 'The Bungalow', cost: 2000, rankReq: 3, plots: 9,  cooldownMult: 0.8,  stashCap: 350, passiveIncomePerSec: 1.5 },
  { tier: 3, name: 'The Warehouse',cost: 6000, rankReq: 5, plots: 12, cooldownMult: 0.7,  stashCap: 800, passiveIncomePerSec: 4 },
];

export interface PropertyEffects { plots: number; cooldownMult: number; stashCap: number; passiveIncomePerSec: number; }

export function propertyEffects(tier: number): PropertyEffects {
  const i = Math.max(0, Math.min(PROPERTY_TIERS.length - 1, tier));
  const t = PROPERTY_TIERS[i];
  return { plots: t.plots, cooldownMult: t.cooldownMult, stashCap: t.stashCap, passiveIncomePerSec: t.passiveIncomePerSec };
}

export function stashCount(inventory: InventoryState): number {
  const base = inventory.baseStock.reduce((n, e) => n + e.units, 0);
  const pkg = inventory.packaged.reduce((n, s) => n + s.units, 0);
  return base + pkg;
}
