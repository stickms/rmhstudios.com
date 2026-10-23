/**
 * How often arcs happen (docs/plans/plasmatic-jelly/03-arcs.md §2.2, §3, §10). `ARC_BUDGET` is the single source of
 * the tuning table; the scheduler, click handler and renderer read every number from it.
 *
 * ```
 * λ_pair(gap) = λ0 · exp(−gap / L)        λ0 = 0.05 s⁻¹, L = 48 px, gap ∈ [0, 240]
 * Λ           = min(Σ λ_pair · m, Λ_max)   Λ_max = 0.5 s⁻¹ (≤ 1 ambient arc / 2 s)
 * next        = max(T_min, Exp(Λ))         T_min = 1.2 s
 * pair        ~ λ_pair · charge_a · charge_b
 * ```
 *
 * Pure: times are passed in, randomness is a seeded {@link Rand}.
 */

import { FLASH_LEDGER } from '../tiers';
import { randExp, type Rand } from './rng';

export const ARC_BUDGET = {
  /** Pair rate at contact (s⁻¹). */
  lambda0: 0.05,
  /** e-folding gap (px). */
  decayLength: 48,
  /** Pairs farther apart are ignored (px). */
  maxGap: 240,
  /** Viewport-wide ambient cap (s⁻¹). */
  maxAmbientRate: 0.5,
  /** Minimum time between ambient arcs (ms). */
  minAmbientIntervalMs: 1200,
  /** Rate multiplier on coarse pointers/touch. */
  coarseMultiplier: 0.6,
  /** Charge: recharge time constant (ms), eligibility threshold, drain per arc. */
  chargeTauMs: 4000,
  chargeThreshold: 0.35,
  chargeDrain: 0.6,
  /** Click arcs: edge-gap radius (px) and bolt counts. */
  clickRadius: 180,
  maxClickBolts: 3,
  maxClickBoltsTouch: 2,
  /** Second and third bolt thresholds (px). */
  secondBoltGap: 60,
  thirdBoltGap: 120,
  /** Bolts start this far apart (ms). */
  clickStaggerMs: 25,
  /** Cursor discharge reach (px). */
  dischargeRadius: 90,
  maxLiveArcs: 4,
  flashMax: FLASH_LEDGER.maxOnsets,
  flashWindowMs: FLASH_LEDGER.windowMs,
  dprCap: 1.5,
  dprCapCoarse: 1,
  warmupMs: 3000,
  maxCandidates: 150,
  /** Candidates smaller than this on either side never arc (px). */
  minCandidateSize: 24,
  /** Spatial hash cell (px): `maxGap / 1.5`. */
  cellSize: 160,
  /** Nearest pairs kept per element. */
  maxPairsPerElement: 12,
} as const;

/** Ambient rate for one pair at `gap` px (s⁻¹). `λ0` at contact, 0 beyond `maxGap` or for overlapping pairs. */
export function pairRate(gap: number): number {
  if (!(gap >= 0) || gap > ARC_BUDGET.maxGap) return 0;
  return ARC_BUDGET.lambda0 * Math.exp(-gap / ARC_BUDGET.decayLength);
}

/** Pointer mode multiplier `m`: 1 fine, 0.6 coarse, 0 quiet. */
export function modeMultiplier(pointer: 'fine' | 'coarse', quiet = false): number {
  if (quiet) return 0;
  return pointer === 'coarse' ? ARC_BUDGET.coarseMultiplier : 1;
}

/** Superposed rate `Λ = min(Σλ · m, Λ_max)`, with `Λ_max` lowered to match a tier's minimum interval. */
export function totalRate(
  rates: Iterable<number>,
  multiplier = 1,
  minIntervalMs: number = 2000,
): number {
  let sum = 0;
  for (const r of rates) if (r > 0) sum += r;
  const tierCap = Number.isFinite(minIntervalMs) && minIntervalMs > 0 ? 1000 / minIntervalMs : 0;
  return Math.max(0, Math.min(sum * Math.max(0, multiplier), ARC_BUDGET.maxAmbientRate, tierCap));
}

/**
 * Delay to the next ambient arc (ms): `max(T_min, Exp(Λ))`, or `Infinity` when `Λ = 0` — in which case the
 * scheduler arms no timer at all.
 */
export function nextAmbientDelayMs(
  rate: number,
  rand: Rand,
  minIntervalMs: number = ARC_BUDGET.minAmbientIntervalMs,
): number {
  if (!(rate > 0)) return Infinity;
  return Math.max(minIntervalMs, randExp(rand, rate) * 1000);
}

/**
 * A charge `q ∈ [0, 1]` after `dtMs` of recharge: `q + (1 − q)(1 − e^{−dt/τ})`. Evaluated lazily from timestamps,
 * so no element needs a timer.
 */
export function chargeAt(q: number, dtMs: number): number {
  const q0 = Math.max(0, Math.min(1, q));
  if (!(dtMs > 0)) return q0;
  return q0 + (1 - q0) * (1 - Math.exp(-dtMs / ARC_BUDGET.chargeTauMs));
}

/** A pair can arc only when both ends hold at least the threshold charge. */
export function chargeEligible(qa: number, qb: number): boolean {
  return qa >= ARC_BUDGET.chargeThreshold && qb >= ARC_BUDGET.chargeThreshold;
}

/** Charge left after an arc drains it (a click drains the clicked element to 0 with `amount = 1`). */
export function drainCharge(q: number, amount: number = ARC_BUDGET.chargeDrain): number {
  return Math.max(0, q - amount);
}

/**
 * Pick an index with probability proportional to its weight, or `-1` when every weight is ≤ 0. `u` is one uniform
 * draw in [0, 1).
 */
export function pickWeighted(weights: ArrayLike<number>, u: number): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) if (weights[i] > 0) total += weights[i];
  if (!(total > 0)) return -1;
  let acc = 0;
  const target = Math.max(0, Math.min(1, u)) * total;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (!(w > 0)) continue;
    last = i;
    acc += w;
    if (target < acc) return i;
  }
  return last;
}

/**
 * Bolts for a click, from the gaps of the in-range neighbours sorted ascending (§3 Targets):
 * `1 + (nearest < 60) + (third < 120 && fine)`, capped at 3 (2 on touch) and at the number of neighbours, and at the
 * tier's `clickBolts`.
 */
export function clickBoltCount(
  sortedGaps: readonly number[],
  fine: boolean,
  tierMax: number = ARC_BUDGET.maxClickBolts,
): number {
  if (sortedGaps.length === 0) return 0;
  let n = 1;
  if (sortedGaps[0] < ARC_BUDGET.secondBoltGap) n++;
  if (fine && sortedGaps.length >= 3 && sortedGaps[2] < ARC_BUDGET.thirdBoltGap) n++;
  const cap = fine ? ARC_BUDGET.maxClickBolts : ARC_BUDGET.maxClickBoltsTouch;
  return Math.max(0, Math.min(n, cap, sortedGaps.length, tierMax));
}

/** Click target weight: `exp(−gap/L)`, so repeated clicks vary instead of always hitting the nearest. */
export function clickWeight(gap: number): number {
  if (!(gap >= 0) || gap > ARC_BUDGET.clickRadius) return 0;
  return Math.exp(-gap / ARC_BUDGET.decayLength);
}
