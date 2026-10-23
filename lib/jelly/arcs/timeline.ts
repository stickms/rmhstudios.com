/**
 * One arc's life over time (docs/plans/plasmatic-jelly/03-arcs.md §1.2): pre-glow, 1–3 strikes separated by dips
 * that never go dark, then an afterglow.
 *
 * ```
 *   0ms   pre-glow: contact glows 0 → 0.4, no channel
 *  40ms   strike 1: channel I = 1.0 (30–50ms)
 *         dip: I = 0.45, never 0 (25–45ms)
 *         re-strike k: I = 0.85, channel regenerated from seed + k
 *  end    final strike ends (per-kind bounds below)
 *  +0–160 afterglow: core only, I = 0.3·exp(−t/55ms)
 * ```
 *
 * | kind      | strikes | final strike ends | energy   |
 * | --------- | ------- | ----------------- | -------- |
 * | ambient   | 1–2     | 80–180ms          | 0.5–0.7  |
 * | click     | 1–3     | 120–250ms         | 0.8–1.0  |
 * | key       | 1       | 100ms             | 0.45     |
 * | fizz      | 1       | 90ms              | 0.5      |
 * | discharge | 1       | 80–120ms          | 0.4      |
 *
 * Pure and seeded. The renderer samples {@link arcIntensity} each frame; the runtime asks the flash ledger before
 * each {@link strikeOnsets} entry and calls {@link truncateStrikes} when one is refused.
 */

import { mulberry32, randInt, randRange } from './rng';

export type ArcKind = 'ambient' | 'click' | 'key' | 'fizz' | 'discharge';

export const TIMELINE = {
  preGlowMs: 40,
  preGlowPeak: 0.4,
  strikeHoldMs: [30, 50] as const,
  dipMs: [25, 45] as const,
  dipLevel: 0.45,
  firstStrike: 1,
  restrike: 0.85,
  afterglowMs: [100, 160] as const,
  afterglowStart: 0.3,
  afterglowTauMs: 55,
  /** Contact glow while a channel is lit. */
  contactGlow: 1,
} as const;

interface KindSpec {
  strikes: readonly [number, number];
  endMs: readonly [number, number];
  energy: readonly [number, number];
  preGlow: boolean;
  afterglow: boolean;
}

export const ARC_KINDS: Readonly<Record<ArcKind, KindSpec>> = {
  ambient: {
    strikes: [1, 2],
    endMs: [80, 180],
    energy: [0.5, 0.7],
    preGlow: true,
    afterglow: true,
  },
  click: { strikes: [1, 3], endMs: [120, 250], energy: [0.8, 1], preGlow: true, afterglow: true },
  key: { strikes: [1, 1], endMs: [100, 100], energy: [0.45, 0.45], preGlow: true, afterglow: true },
  fizz: { strikes: [1, 1], endMs: [90, 90], energy: [0.5, 0.5], preGlow: false, afterglow: false },
  discharge: {
    strikes: [1, 1],
    endMs: [80, 120],
    energy: [0.4, 0.4],
    preGlow: true,
    afterglow: true,
  },
};

export interface Strike {
  /** Onset (ms from the arc's request). */
  at: number;
  /** Hold (ms). */
  hold: number;
  /** Channel intensity while held. */
  peak: number;
}

export interface ArcTimeline {
  kind: ArcKind;
  energy: number;
  preGlowMs: number;
  strikes: Strike[];
  /** When the final strike ends (ms). */
  strikeEndMs: number;
  afterglowMs: number;
  /** Total life including afterglow (ms). */
  lifeMs: number;
}

export type ArcPhase = 'preglow' | 'strike' | 'dip' | 'afterglow' | 'done';

export interface ArcSample {
  /** Channel intensity (0 = no channel drawn). */
  I: number;
  /** Contact-glow intensity. */
  glow: number;
  phase: ArcPhase;
  /** Index of the current/last strike (−1 before the first). */
  strike: number;
}

/**
 * Plan one arc. The strike/dip durations are drawn from their ranges and then scaled together so the final strike
 * ends inside the kind's bounds — the per-kind life bounds hold by construction.
 */
export function planArc(kind: ArcKind, seed: number): ArcTimeline {
  const spec = ARC_KINDS[kind];
  const rand = mulberry32(seed);
  const n = randInt(rand, spec.strikes[0], spec.strikes[1]);
  const energy = randRange(rand, spec.energy[0], spec.energy[1]);
  const preGlowMs = spec.preGlow ? TIMELINE.preGlowMs : 0;
  const strikeEndMs = Math.round(randRange(rand, spec.endMs[0], spec.endMs[1]));

  const holds: number[] = [];
  const dips: number[] = [];
  for (let i = 0; i < n; i++) {
    holds.push(randRange(rand, TIMELINE.strikeHoldMs[0], TIMELINE.strikeHoldMs[1]));
    if (i < n - 1) dips.push(randRange(rand, TIMELINE.dipMs[0], TIMELINE.dipMs[1]));
  }
  const natural = holds.reduce((s, v) => s + v, 0) + dips.reduce((s, v) => s + v, 0);
  const scale = Math.max(0, strikeEndMs - preGlowMs) / natural;

  const strikes: Strike[] = [];
  let t = preGlowMs;
  for (let i = 0; i < n; i++) {
    const hold = holds[i] * scale;
    strikes.push({ at: t, hold, peak: i === 0 ? TIMELINE.firstStrike : TIMELINE.restrike });
    t += hold + (i < n - 1 ? dips[i] * scale : 0);
  }
  // Land the final strike exactly on its planned end (no floating-point overhang into the afterglow).
  const last = strikes[n - 1];
  last.hold = Math.max(0, strikeEndMs - last.at);
  const afterglowMs = spec.afterglow
    ? Math.round(randRange(rand, TIMELINE.afterglowMs[0], TIMELINE.afterglowMs[1]))
    : 0;
  return {
    kind,
    energy,
    preGlowMs,
    strikes,
    strikeEndMs,
    afterglowMs,
    lifeMs: strikeEndMs + afterglowMs,
  };
}

/** Strike onset times (ms) — each is one flash for the ledger. */
export function strikeOnsets(tl: ArcTimeline): number[] {
  return tl.strikes.map((s) => s.at);
}

/**
 * Keep only the first `keep` strikes (the ledger refused the next one): the arc goes straight to afterglow from the
 * end of the last kept strike. `keep = 0` leaves no channel at all — the caller drops the arc but keeps its flare.
 */
export function truncateStrikes(tl: ArcTimeline, keep: number): ArcTimeline {
  const k = Math.max(0, Math.min(tl.strikes.length, Math.floor(keep)));
  if (k === tl.strikes.length) return tl;
  const strikes = tl.strikes.slice(0, k);
  const last = strikes[strikes.length - 1];
  const strikeEndMs = last ? last.at + last.hold : tl.preGlowMs;
  const afterglowMs = k === 0 ? 0 : tl.afterglowMs;
  return { ...tl, strikes, strikeEndMs, afterglowMs, lifeMs: strikeEndMs + afterglowMs };
}

/** Sample the arc at `t` ms after it was requested. */
export function arcIntensity(tl: ArcTimeline, t: number): ArcSample {
  if (!(t >= 0)) return { I: 0, glow: 0, phase: 'preglow', strike: -1 };
  if (t < tl.preGlowMs) {
    return { I: 0, glow: TIMELINE.preGlowPeak * (t / tl.preGlowMs), phase: 'preglow', strike: -1 };
  }
  for (let i = 0; i < tl.strikes.length; i++) {
    const s = tl.strikes[i];
    const end = s.at + s.hold;
    if (t < s.at) {
      // Between strike i−1 and i: the dip, never dark.
      return { I: TIMELINE.dipLevel, glow: TIMELINE.dipLevel, phase: 'dip', strike: i - 1 };
    }
    if (t < end)
      return { I: s.peak, glow: TIMELINE.contactGlow * s.peak, phase: 'strike', strike: i };
  }
  const last = tl.strikes.length - 1;
  const age = t - tl.strikeEndMs;
  if (age < tl.afterglowMs) {
    return {
      I: TIMELINE.afterglowStart * Math.exp(-age / TIMELINE.afterglowTauMs),
      glow: 0,
      phase: 'afterglow',
      strike: last,
    };
  }
  return { I: 0, glow: 0, phase: 'done', strike: last };
}

/** True once the arc (including afterglow) has finished. */
export function arcDone(tl: ArcTimeline, t: number): boolean {
  return t >= tl.lifeMs;
}
