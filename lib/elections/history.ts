/**
 * Vote-share history for the live graphs. Pure and client-safe.
 *
 * One point per change in a race's vote total (not per poll of the feed), so the
 * series is the shape of the COUNT — the "red mirage" and "blue shift" are visible
 * as the lines move — and a quiet hour does not fill the chart with flat dots.
 */

import type { Race } from './types';

export interface SeriesPoint {
  /** Epoch ms. */
  t: number;
  votes: number;
  /** Share of the vote by candidate id, 0–100. */
  pct: Record<string, number>;
}

export const MAX_POINTS = 160;

/** Add a point for `race` if its total moved; thin the oldest half when the series is full. */
export function appendPoint(
  series: SeriesPoint[],
  race: Race,
  t: number,
  cap = MAX_POINTS,
): SeriesPoint[] {
  if (race.totalVotes <= 0) return series;
  const last = series[series.length - 1];
  if (last && last.votes === race.totalVotes) return series;
  if (last && t < last.t) return series; // never out of order
  const pct: Record<string, number> = {};
  for (const c of race.candidates) pct[c.id] = c.pct;
  let next = [...series, { t, votes: race.totalVotes, pct }];
  if (next.length > cap) {
    // Keep every other point of the older half (the shape survives) and all of the recent half.
    const half = Math.floor(next.length / 2);
    next = [...next.slice(0, half).filter((_, i) => i % 2 === 0), ...next.slice(half)];
  }
  return next;
}

export interface Line {
  id: string;
  points: { x: number; y: number }[];
}

/**
 * Lay a series out for an SVG viewBox: x is time (0–1 across the series), y is share (0–100).
 * Returns one line per requested candidate that appears in the series.
 */
export function layoutLines(
  series: SeriesPoint[],
  candidateIds: string[],
): { lines: Line[]; yMax: number } {
  if (series.length < 2) return { lines: [], yMax: 100 };
  const t0 = series[0].t;
  const span = Math.max(1, series[series.length - 1].t - t0);
  let yMax = 0;
  const lines: Line[] = [];
  for (const id of candidateIds) {
    const points = series
      .filter((p) => id in p.pct)
      .map((p) => ({ x: (p.t - t0) / span, y: p.pct[id] }));
    if (points.length < 2) continue;
    for (const p of points) yMax = Math.max(yMax, p.y);
    lines.push({ id, points });
  }
  // A race at 51–49 should not draw as a flat line at the top: pad the axis, snap to 10s.
  return { lines, yMax: Math.min(100, Math.max(20, Math.ceil((yMax + 5) / 10) * 10)) };
}
