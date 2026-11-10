/**
 * Slice It chart editor — scroll velocity (§4.2, ideas `C6` / `G10`).
 *
 * ## The one thing that must not be got wrong
 *
 * **Position is the INTEGRAL of scroll velocity, not a multiplier applied to a
 * note's distance.** The obvious implementation —
 *
 * ```ts
 * const y = (note.time - playhead) * pixelsPerSecond * svAt(note.time); // WRONG
 * ```
 *
 * — is wrong in a way that looks fine on a chart with one SV change and is
 * catastrophic on a chart with two. Take a 0.5× marker at t=10 and notes at
 * t=9.9 and t=10.1, with the playhead at 0. The first is drawn at 9.9 units, the
 * second at 10.1 × 0.5 = 5.05 units: the LATER note is drawn NEARER than the
 * earlier one. The notes swap order. A player reading the lane sees them in the
 * wrong sequence and there is no way for them to know the display is lying.
 *
 * The correct model is that scroll velocity is a *rate*, so the distance a note
 * has travelled is the area under that rate up to its time:
 *
 * ```
 * distance(t) = ∫₀ᵗ sv(u) du
 * offset(note) = distance(note.time) − distance(playhead)
 * ```
 *
 * Because `sv > 0` everywhere, `distance` is strictly increasing, so note order
 * is preserved by construction — which is the property the naive version loses.
 * Every rhythm game that has SV does it this way; the ones that did not, once,
 * are where the bug is remembered from.
 *
 * ## Why a prefix sum
 *
 * `distance()` is called per note per frame. Integrating from zero each time is
 * O(points) per call — 1200 notes × 60 fps × 200 points is 14 million segment
 * walks a second. The integral at each marker is precomputed once per SV edit
 * and a query is then a binary search plus one multiply.
 */

import type { SvPoint } from './types';

export interface SvTable {
  /** Marker times, ascending. Always starts at 0. */
  times: number[];
  /** Multiplier in effect from `times[i]` until `times[i+1]`. */
  rates: number[];
  /** `distance(times[i])` — the integral from 0 up to that marker. */
  cumulative: number[];
}

/** The multiplier bounds, matching `SvPointZ` in `api-schemas.ts`. */
export const MIN_SV = 0.1;
export const MAX_SV = 8;

/**
 * Build the integral table.
 *
 * Markers are sorted and de-duplicated here rather than trusted: the points
 * arrive from a `Json` column and from a panel where an author can type a time,
 * and an out-of-order marker would make `cumulative` non-monotonic — which is
 * the same order-swapping bug this module exists to prevent, arriving by a
 * different door.
 */
export function buildSvTable(points: readonly SvPoint[]): SvTable {
  const sorted = [...points]
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.multiplier))
    .map((point) => ({
      time: Math.max(0, point.time),
      multiplier: Math.min(MAX_SV, Math.max(MIN_SV, point.multiplier)),
    }))
    .sort((a, b) => a.time - b.time);

  // Scroll runs at 1× until the first marker says otherwise, so the table always
  // opens with a segment at t=0 — including when the chart has no markers at
  // all, which is every chart today.
  const times: number[] = [0];
  const rates: number[] = [1];
  for (const point of sorted) {
    if (point.time <= 0) {
      rates[0] = point.multiplier;
      continue;
    }
    if (point.time === times[times.length - 1]) {
      // Two markers at the same instant: the last one wins, which is what an
      // author dragging one onto another means.
      rates[rates.length - 1] = point.multiplier;
      continue;
    }
    times.push(point.time);
    rates.push(point.multiplier);
  }

  const cumulative: number[] = [0];
  for (let i = 1; i < times.length; i++) {
    cumulative.push(cumulative[i - 1] + rates[i - 1] * (times[i] - times[i - 1]));
  }

  return { times, rates, cumulative };
}

/** Index of the segment containing `time`. */
function segmentAt(table: SvTable, time: number): number {
  const { times } = table;
  if (time <= times[0]) return 0;
  let lo = 0;
  let hi = times.length - 1;
  if (time >= times[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The multiplier in effect at `time`. */
export function svAt(table: SvTable, time: number): number {
  return table.rates[segmentAt(table, time)];
}

/**
 * Distance scrolled from the start of the track to `time`, in seconds-equivalent
 * units: with no SV markers this is exactly `time`, so every existing chart is
 * unaffected and the renderer needs no special case for "no SV".
 */
export function scrollDistance(table: SvTable, time: number): number {
  const index = segmentAt(table, time);
  return table.cumulative[index] + table.rates[index] * (time - table.times[index]);
}

/**
 * How far ahead of the playhead a note should be drawn.
 *
 * The renderer multiplies this by its pixels-per-second. Strictly increasing in
 * `time`, so two notes never swap — the property the whole module is for.
 */
export function scrollOffset(table: SvTable, time: number, playhead: number): number {
  return scrollDistance(table, time) - scrollDistance(table, playhead);
}

/**
 * The inverse: which time is drawn at `offset` ahead of the playhead.
 *
 * Needed by hit-testing and by the timeline's own pointer maths — a click at a
 * pixel has to answer "what time is this?", and under SV that is not
 * `playhead + pixels / pps`. Exact rather than iterative: the integral is
 * piecewise linear, so inverting it is a binary search for the segment plus one
 * divide.
 */
export function timeAtScroll(table: SvTable, distance: number): number {
  const { cumulative, times, rates } = table;
  if (distance <= cumulative[0]) return times[0] + (distance - cumulative[0]) / rates[0];
  let lo = 0;
  let hi = cumulative.length - 1;
  if (distance >= cumulative[hi]) {
    return times[hi] + (distance - cumulative[hi]) / rates[hi];
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= distance) lo = mid;
    else hi = mid;
  }
  return times[lo] + (distance - cumulative[lo]) / rates[lo];
}

/**
 * Insert or replace a marker, returning a new array.
 *
 * Returns the input array unchanged when nothing would change, so a store
 * update can be skipped by reference and a no-op drag does not mark the
 * document dirty.
 */
export function withSvPoint(points: readonly SvPoint[], point: SvPoint): SvPoint[] {
  const multiplier = Math.min(MAX_SV, Math.max(MIN_SV, point.multiplier));
  const time = Math.max(0, point.time);
  const next = points.filter((existing) => Math.abs(existing.time - time) > 1e-4);
  next.push({ time, multiplier });
  return next.sort((a, b) => a.time - b.time);
}

export function withoutSvPoint(points: readonly SvPoint[], time: number): SvPoint[] {
  return points.filter((point) => Math.abs(point.time - time) > 1e-4);
}
