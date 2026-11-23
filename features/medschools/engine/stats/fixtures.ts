/** Test-only builders for engine/stats. Not imported by production code. */
import type { DayCount } from './shares';

/**
 * A triangular season: weight rises linearly from `startDay` to `peakDay` and falls to `endDay` (inclusive). Integer
 * counts that sum exactly to `total`: each day's count is the difference of the rounded cumulative, so the share curve
 * follows the triangle to within one event. Deterministic.
 */
export function triangleCycle(opts: { total: number; startDay: number; peakDay: number; endDay: number }): DayCount[] {
  const { total, startDay, peakDay, endDay } = opts;
  const weights: { day: number; w: number }[] = [];
  for (let d = startDay; d <= endDay; d++) {
    const w = d <= peakDay ? (d - startDay + 1) / (peakDay - startDay + 1) : (endDay - d + 1) / (endDay - peakDay + 1);
    weights.push({ day: d, w });
  }
  const sum = weights.reduce((n, r) => n + r.w, 0);
  const out: DayCount[] = [];
  let cum = 0;
  let prev = 0;
  for (const { day, w } of weights) {
    cum += w;
    const now = Math.round((total * cum) / sum);
    if (now > prev) out.push({ day, count: now - prev });
    prev = now;
  }
  return out;
}

/** The same days with every count multiplied and rounded (zero counts dropped). */
export function scale(days: readonly DayCount[], factor: number): DayCount[] {
  return days.map((d) => ({ day: d.day, count: Math.round(d.count * factor) })).filter((d) => d.count > 0);
}
