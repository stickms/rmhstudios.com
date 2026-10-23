/**
 * Bolt shapes (docs/plans/plasmatic-jelly/03-arcs.md §1.1): a seeded midpoint-displacement channel between two rim
 * points, with at most three short branches, generated once per strike into `Float32Array`s so the renderer's frames
 * only stroke precomputed paths.
 *
 * - The channel is subdivided until segments are ≤ 8px, up to 64 segments.
 * - Level-0 displacement is `0.16·len` perpendicular to the chord; each level multiplies it by `0.55`.
 * - Total deviation is soft-capped (`tanh`) below `0.22·len`, so a bolt never wanders over unrelated UI.
 * - A midpoint created at depth ≤ 2 forks with probability 0.14: length `0.25–0.45×` the remaining channel, heading
 *   `±22–38°` off the chord, two fewer subdivision levels (≤ 16 segments), half intensity, never forking again.
 *
 * Pure and deterministic: the same seed gives byte-identical arrays.
 */

import type { Point } from './geometry';
import { mixSeed, mulberry32, randInt, randRange, randSign, type Rand } from './rng';

export const BOLT = {
  maxSegmentPx: 8,
  maxSegments: 64,
  displacement: 0.16,
  decay: 0.55,
  maxDeviation: 0.22,
  branchChance: 0.14,
  branchMaxDepth: 2,
  maxBranches: 3,
  branchMaxSegments: 16,
  branchLength: [0.25, 0.45] as const,
  branchAngleDeg: [22, 38] as const,
  branchIntensity: 0.5,
  /** Re-strikes keep this share of the previous channel's displacement (§1.2). */
  restrikeKeep: 0.7,
} as const;

export interface BoltBranch {
  /** x, y pairs. */
  points: Float32Array;
  /** Relative intensity (0.5). */
  intensity: number;
}

export interface BoltPath {
  /** Main channel as x, y pairs; first and last are exactly the endpoints. */
  points: Float32Array;
  /** Perpendicular offset of each channel point from the chord (px), for re-strikes and tests. */
  offsets: Float32Array;
  branches: BoltBranch[];
  /** Bounding box of every point (the renderer inflates it by the glow width for its dirty rect). */
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Chord length (px). */
  length: number;
  seed: number;
}

export interface BoltOptions {
  seed: number;
  /** First-level displacement as a share of the length (default 0.16). */
  displacement?: number;
  /** Allow branches (default true). */
  branches?: boolean;
}

/** Number of channel segments for a chord: the power of two that brings segments to ≤ 8px, capped. */
export function segmentCount(len: number, max: number = BOLT.maxSegments): number {
  if (!(len > BOLT.maxSegmentPx)) return 1;
  const n = 2 ** Math.ceil(Math.log2(len / BOLT.maxSegmentPx));
  return Math.max(1, Math.min(max, n));
}

/**
 * Midpoint displacement of `n + 1` perpendicular offsets (`n` a power of two), soft-capped at `maxDev`. Calls
 * `onMidpoint(index, depth)` for every midpoint in creation order.
 */
function displace(
  n: number,
  len: number,
  rand: Rand,
  displacement: number,
  onMidpoint?: (index: number, depth: number) => void,
): Float64Array {
  const y = new Float64Array(n + 1);
  let d = displacement * len;
  for (let step = n / 2, depth = 0; step >= 1; step /= 2, depth++) {
    for (let m = step; m < n; m += 2 * step) {
      y[m] = (y[m - step] + y[m + step]) / 2 + (2 * rand() - 1) * d;
      onMidpoint?.(m, depth);
    }
    d *= BOLT.decay;
  }
  const cap = BOLT.maxDeviation * len;
  for (let i = 0; i <= n; i++) y[i] = cap * Math.tanh(y[i] / cap);
  y[0] = 0;
  y[n] = 0;
  return y;
}

/** Lay perpendicular offsets along the chord a → b. Endpoints are written exactly. */
function layOut(a: Point, b: Point, y: ArrayLike<number>): Float32Array {
  const n = y.length - 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const out = new Float32Array(2 * (n + 1));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out[2 * i] = a.x + dx * t + px * y[i];
    out[2 * i + 1] = a.y + dy * t + py * y[i];
  }
  out[0] = a.x;
  out[1] = a.y;
  out[2 * n] = b.x;
  out[2 * n + 1] = b.y;
  return out;
}

function bboxOf(arrays: Float32Array[]): BoltPath['bbox'] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i += 2) {
      x0 = Math.min(x0, arr[i]);
      x1 = Math.max(x1, arr[i]);
      y0 = Math.min(y0, arr[i + 1]);
      y1 = Math.max(y1, arr[i + 1]);
    }
  }
  return { x0, y0, x1, y1 };
}

/** Generate a bolt from `a` to `b`. */
export function generateBolt(a: Point, b: Point, opts: BoltOptions): BoltPath {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = segmentCount(len);
  const rand = mulberry32(opts.seed);
  const forks: number[] = [];
  const y = displace(n, len, rand, opts.displacement ?? BOLT.displacement, (m, depth) => {
    if (depth <= BOLT.branchMaxDepth) forks.push(m);
  });
  const points = layOut(a, b, y);
  const branches =
    opts.branches === false ? [] : makeBranches(a, b, points, n, len, forks, opts.seed);
  return {
    points,
    offsets: Float32Array.from(y),
    branches,
    bbox: bboxOf([points, ...branches.map((br) => br.points)]),
    length: len,
    seed: opts.seed,
  };
}

function makeBranches(
  a: Point,
  b: Point,
  points: Float32Array,
  n: number,
  len: number,
  candidates: number[],
  seed: number,
): BoltBranch[] {
  const rand = mulberry32(mixSeed(seed, 0xb7a9));
  const heading = Math.atan2(b.y - a.y, b.x - a.x);
  const out: BoltBranch[] = [];
  for (const m of candidates) {
    if (out.length >= BOLT.maxBranches) break;
    const roll = rand();
    const lengthShare = randRange(rand, BOLT.branchLength[0], BOLT.branchLength[1]);
    const angle =
      randSign(rand) *
      randRange(rand, BOLT.branchAngleDeg[0], BOLT.branchAngleDeg[1]) *
      (Math.PI / 180);
    const branchSeed = mixSeed(seed, 0x51 + m);
    if (roll >= BOLT.branchChance) continue;
    const remaining = (1 - m / n) * len;
    const blen = remaining * lengthShare;
    if (blen < 2) continue;
    const start = { x: points[2 * m], y: points[2 * m + 1] };
    const end = {
      x: start.x + Math.cos(heading + angle) * blen,
      y: start.y + Math.sin(heading + angle) * blen,
    };
    const bn = segmentCount(blen, Math.min(BOLT.branchMaxSegments, Math.max(1, n / 4)));
    const by = displace(bn, blen, mulberry32(branchSeed), BOLT.displacement);
    out.push({ points: layOut(start, end, by), intensity: BOLT.branchIntensity });
  }
  return out;
}

/**
 * A re-strike `k` (1, 2…): the channel regenerated from `seed + k` keeping 70% of the previous displacement — the same
 * path with flickering detail. Branches are regenerated from the new seed. If the endpoints moved enough to change
 * the segment count, a fresh bolt is returned.
 */
export function restrikeBolt(
  base: BoltPath,
  a: Point,
  b: Point,
  k: number,
  keep: number = BOLT.restrikeKeep,
): BoltPath {
  const seed = mixSeed(base.seed, k);
  const fresh = generateBolt(a, b, { seed });
  if (fresh.offsets.length !== base.offsets.length) return fresh;
  const n = fresh.offsets.length - 1;
  const y = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) y[i] = keep * base.offsets[i] + (1 - keep) * fresh.offsets[i];
  const points = layOut(a, b, y);
  return {
    points,
    offsets: Float32Array.from(y),
    branches: fresh.branches,
    bbox: bboxOf([points, ...fresh.branches.map((br) => br.points)]),
    length: fresh.length,
    seed,
  };
}

/**
 * A rim fizz (§3): 3–5 short sparks (8–20px, 2–3 segment zigzags) leaving `origin` along `normal` ± 50°. `count`
 * overrides the number (the keyboard fizz uses 2).
 */
export function generateFizz(
  origin: Point,
  normal: Point,
  seed: number,
  count?: number,
): Float32Array[] {
  const rand = mulberry32(seed);
  const nLen = Math.hypot(normal.x, normal.y) || 1;
  const base = Math.atan2(normal.y / nLen, normal.x / nLen);
  const sparks = count ?? randInt(rand, 3, 5);
  const out: Float32Array[] = [];
  for (let s = 0; s < sparks; s++) {
    const angle = base + randRange(rand, -50, 50) * (Math.PI / 180);
    const len = randRange(rand, 8, 20);
    const segs = randInt(rand, 2, 3);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const pts = new Float32Array(2 * (segs + 1));
    pts[0] = origin.x;
    pts[1] = origin.y;
    for (let i = 1; i <= segs; i++) {
      const t = (i / segs) * len;
      const j = i === segs ? 0 : randRange(rand, -0.25, 0.25) * len;
      pts[2 * i] = origin.x + ux * t - uy * j;
      pts[2 * i + 1] = origin.y + uy * t + ux * j;
    }
    out.push(pts);
  }
  return out;
}
