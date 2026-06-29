import type { BuyerDynamicState, EffectId } from './types';
import { BUYERS, EFFECTS } from './content';

export const RESTOCK_PER_MS = 1 / 45000; // full recovery over ~45s real (~a few in-game hours)
export const DEPLETE_PER_UNIT = 0.08;     // each unit sold saturates the buyer a little
export const REP_PER_SALE = 0.02;         // reputation gained per unit sold
export const REP_PREF_BONUS = 0.03;       // extra reputation when the product matches their preference

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Demand regenerates toward 1.0 over time. */
export function restockDemand(demand: number, dtMs: number): number {
  return Math.min(1, demand + RESTOCK_PER_MS * dtMs);
}

/** Each unit sold to a buyer lowers their demand. */
export function depleteDemand(demand: number, units: number): number {
  return Math.max(0, demand - DEPLETE_PER_UNIT * units);
}

/** Scarce buyer pays a premium; saturated buyer discounts. ~0.6..1.3. */
export function demandPriceMult(demand: number): number {
  return 0.6 + clamp01(demand) * 0.7;
}

/** Small premium that rises with reputation. 1.0..1.15. */
export function reputationPriceMult(rep: number): number {
  return 1 + clamp01(rep) * 0.15;
}

/** Add to reputation, clamped to [0,1]. */
export function gainReputation(rep: number, delta: number): number {
  return clamp01(rep + delta);
}

/** Fresh dynamic state for every buyer (full demand, no reputation, base preference). */
export function initialBuyerStates(): Record<string, BuyerDynamicState> {
  const out: Record<string, BuyerDynamicState> = {};
  for (const b of BUYERS) out[b.id] = { demand: 1, reputation: 0, preferredEffect: b.preferredEffect };
  return out;
}

export const DRIFT_CHANCE = 0.0008; // per drift-tick chance a buyer's preference shifts
export const DRIFT_INTERVAL_MS = 1000; // roll preference drift at most once per game-second (FPS-independent)

const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];

/**
 * Occasionally shift a buyer's preferred effect. Deterministic from `roll ∈ [0,1)`:
 * no drift unless roll < DRIFT_CHANCE; the sub-range then selects the new (different) effect.
 * Returns the same reference when no drift occurs.
 */
export function driftPreference(state: BuyerDynamicState, roll: number): BuyerDynamicState {
  if (roll >= DRIFT_CHANCE) return state;
  const others = EFFECT_IDS.filter((e) => e !== state.preferredEffect);
  const idx = Math.min(others.length - 1, Math.floor((roll / DRIFT_CHANCE) * others.length));
  return { ...state, preferredEffect: others[idx] };
}
