/**
 * The #989 charge laws, pure (CLAUDE.md "Design system: Plasmatic Jelly" → Electricity; constants `CHARGE` in
 * `lib/jelly/tiers.ts`, mirrored by `--arc-breakdown-gap` / `--arc-formative-lag` / `--pulse-*` in CSS).
 *
 * ```
 * q(t)          = q0 · e^(−dt / decayMs)                                  decay
 * breakdown gap = breakdownGapPx · (1 + breakdownChargeGain · q)           a pair closer than this strikes
 * hop carry     = q · hopFraction, made only while carry ≥ minHopCharge    a click's charge jumping on
 * ring delay    = distance(deposit point → departure rim) / pulseSpeedPxS  the hop waits for the ring
 * F_coulomb     = min(1, attractGain · qa · qb / (gap / attractReachPx)²)  0 beyond the reach
 * ```
 *
 * `ELECTRIC` holds the field controller's own cadence numbers (`field.ts`): how often it re-reads charged pairs, the
 * attraction rate limit, the refractory between breakdown strikes of one pair and how long a hop may wait for the
 * flash ledger. Nothing here touches the DOM or a clock.
 */

import { CHARGE } from '../tiers';

export const ELECTRIC = {
  /** Field re-evaluation period while anything is charged (ms) — also the attraction cadence. */
  tickMs: 100,
  /** Coulomb impulses per pair per second, at most. */
  attractMaxHz: 10,
  /**
   * A pair that just broke down waits at least this long before its formative lag starts again (ms) — about one
   * arc's life, so "closer than the breakdown gap they arc forever" is a steady ≤ 2.5/s per pair before the
   * site-wide ledger (≤ 3/s) caps it further.
   */
  breakdownRefractoryMs: 400,
  /** A hop refused by the flash ledger waits for the ledger to free, but never longer than this (ms). */
  hopWaitMaxMs: 1000,
} as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Electric charge after `dtMs` of decay. */
export function decayCharge(q: number, dtMs: number): number {
  const q0 = clamp01(q);
  if (!(dtMs > 0)) return q0;
  return q0 * Math.exp(-dtMs / CHARGE.decayMs);
}

/** The breakdown gap (px) for a pair whose larger charge is `q`. */
export function breakdownGap(q: number): number {
  return CHARGE.breakdownGapPx * (1 + CHARGE.breakdownChargeGain * clamp01(q));
}

/** Does a pair at rim gap `gap` holding charges `qa`, `qb` break down? Overlapping pairs (gap ≤ 0) never do. */
export function breaksDown(gap: number, qa: number, qb: number): boolean {
  return gap > 0 && gap < breakdownGap(Math.max(qa, qb));
}

/** The charge a body holding `q` hands its neighbour when it jumps, or 0 when that would be below the hop floor. */
export function hopCarry(q: number): number {
  const carry = clamp01(q) * CHARGE.hopFraction;
  return carry >= CHARGE.minHopCharge ? carry : 0;
}

/** How long the pulse ring takes to travel `distancePx` through the gel (ms). */
export function ringDelayMs(distancePx: number): number {
  return (Math.max(0, distancePx) / CHARGE.pulseSpeedPxS) * 1000;
}

/** Coulomb attraction magnitude in [0, 1] for charges `qa`, `qb` at rim gap `gap` (0 beyond the reach). */
export function coulombForce(qa: number, qb: number, gap: number): number {
  if (!(gap >= 0) || gap > CHARGE.attractReachPx) return 0;
  const q = clamp01(qa) * clamp01(qb);
  if (!(q > 0)) return 0;
  const r = Math.max(gap, 1e-3) / CHARGE.attractReachPx;
  return Math.min(1, (CHARGE.attractGain * q) / (r * r));
}

/** Is a pair charged enough to attract? Both ends hold more than the hop floor. */
export function attractEligible(qa: number, qb: number): boolean {
  return qa > CHARGE.minHopCharge && qb > CHARGE.minHopCharge;
}
