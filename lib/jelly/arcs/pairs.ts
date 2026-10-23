/**
 * Which jelly elements can arc to which (docs/plans/plasmatic-jelly/03-arcs.md §2.1, §3).
 *
 * {@link buildPairs} uses a spatial hash: every rect is inserted into each cell its box covers after growing it by
 * `maxGap / 2` on every side, so any two rects whose rim gap is ≤ `maxGap` share at least one cell (their grown boxes
 * overlap) and only same-cell rects are ever compared. That is exact — no pair within range is missed — and costs
 * O(n) to hash plus O(n·k) comparisons for local neighbourhoods.
 *
 * Excluded: overlapping pairs and nested pairs (an ancestor and its descendant always overlap geometrically, so
 * `gap ≤ 0` removes them; `nested(i, j)` lets the caller add a DOM `contains()` check for overflowing children) and
 * pairs beyond `maxGap`. Each element keeps at most `maxPerElement` nearest pairs.
 *
 * Pure: rects in, index pairs out. The rebuild runs only when the rect cache changes, never per frame.
 */

import {
  pointToRoundedRect,
  roundedRectGap,
  type Point,
  type RimPoint,
  type RoundedRect,
} from './geometry';
import { ARC_BUDGET, pairRate } from './rate';

export interface ArcPair {
  /** Indices into the rect list, `a < b`. */
  a: number;
  b: number;
  /** Rim-to-rim gap (px, > 0). */
  gap: number;
  /** Ambient rate `λ_pair(gap)` (s⁻¹). */
  rate: number;
}

export interface BuildPairsOptions {
  maxGap?: number;
  cellSize?: number;
  maxPerElement?: number;
  /** Extra exclusion, e.g. `(i, j) => els[i].contains(els[j]) || els[j].contains(els[i])`. */
  nested?: (a: number, b: number) => boolean;
}

export function buildPairs(rects: readonly RoundedRect[], opts: BuildPairsOptions = {}): ArcPair[] {
  const maxGap = opts.maxGap ?? ARC_BUDGET.maxGap;
  const cell = Math.max(1, opts.cellSize ?? ARC_BUDGET.cellSize);
  const perElement = opts.maxPerElement ?? ARC_BUDGET.maxPairsPerElement;
  const grow = maxGap / 2;
  const grid = new Map<string, number[]>();

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!(r.w > 0 && r.h > 0)) continue;
    const cx0 = Math.floor((r.x - grow) / cell);
    const cx1 = Math.floor((r.x + r.w + grow) / cell);
    const cy0 = Math.floor((r.y - grow) / cell);
    const cy1 = Math.floor((r.y + r.h + grow) / cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = `${cx},${cy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(i);
        else grid.set(key, [i]);
      }
    }
  }

  const seen = new Set<number>();
  const pairs: ArcPair[] = [];
  const n = rects.length;
  for (const bucket of grid.values()) {
    for (let p = 0; p < bucket.length; p++) {
      for (let q = p + 1; q < bucket.length; q++) {
        const a = Math.min(bucket[p], bucket[q]);
        const b = Math.max(bucket[p], bucket[q]);
        const id = a * n + b;
        if (seen.has(id)) continue;
        seen.add(id);
        const gap = roundedRectGap(rects[a], rects[b]);
        if (!(gap > 0) || gap > maxGap) continue;
        if (opts.nested?.(a, b)) continue;
        pairs.push({ a, b, gap, rate: pairRate(gap) });
      }
    }
  }

  pairs.sort((x, y) => x.gap - y.gap || x.a - y.a || x.b - y.b);
  const count = new Uint16Array(n);
  const kept: ArcPair[] = [];
  for (const pair of pairs) {
    if (count[pair.a] >= perElement || count[pair.b] >= perElement) continue;
    count[pair.a]++;
    count[pair.b]++;
    kept.push(pair);
  }
  return kept;
}

/**
 * The candidate set (§2.1 Eligibility): visible-sized rects (≥ 24px on both sides) that intersect the viewport,
 * at most `max` of them, nearest the viewport centre first. Returns indices into `rects`.
 */
export function selectCandidates(
  rects: readonly RoundedRect[],
  viewport: { w: number; h: number },
  max: number = ARC_BUDGET.maxCandidates,
): number[] {
  const cx = viewport.w / 2;
  const cy = viewport.h / 2;
  const keep: { i: number; d: number }[] = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.w < ARC_BUDGET.minCandidateSize || r.h < ARC_BUDGET.minCandidateSize) continue;
    if (r.x + r.w <= 0 || r.y + r.h <= 0 || r.x >= viewport.w || r.y >= viewport.h) continue;
    keep.push({ i, d: Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy) });
  }
  keep.sort((a, b) => a.d - b.d || a.i - b.i);
  return keep.slice(0, Math.max(0, max)).map((k) => k.i);
}

export interface ClickTarget {
  index: number;
  gap: number;
}

/** Neighbours of `source` whose rim gap is in `(0, radius]`, nearest first (§3 Targets). */
export function clickTargets(
  source: number,
  rects: readonly RoundedRect[],
  radius: number = ARC_BUDGET.clickRadius,
  nested?: (a: number, b: number) => boolean,
): ClickTarget[] {
  const src = rects[source];
  if (!src) return [];
  const out: ClickTarget[] = [];
  for (let i = 0; i < rects.length; i++) {
    if (i === source) continue;
    const gap = roundedRectGap(src, rects[i]);
    if (!(gap > 0) || gap > radius) continue;
    if (nested?.(source, i)) continue;
    out.push({ index: i, gap });
  }
  out.sort((a, b) => a.gap - b.gap || a.index - b.index);
  return out;
}

/** The nearest rim within `radius` of a point outside every rect — the cursor discharge (§3). */
export function nearestRimWithin(
  p: Point,
  rects: readonly RoundedRect[],
  radius: number = ARC_BUDGET.dischargeRadius,
): { index: number; rim: RimPoint } | null {
  let best: { index: number; rim: RimPoint } | null = null;
  for (let i = 0; i < rects.length; i++) {
    const rim = pointToRoundedRect(p, rects[i]);
    if (rim.distance <= 0) return null; // inside an element: not a discharge
    if (rim.distance > radius) continue;
    if (!best || rim.distance < best.rim.distance) best = { index: i, rim };
  }
  return best;
}
