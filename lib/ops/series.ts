// Chart series for /admin/alarms: one chart per metric an alarm rule watches,
// bucketed to a readable number of points, with every rule's threshold on it.
// Pure and client-safe (the page shares the types).

import { METRIC_ALARMS, type EffectiveRule, type SeriesRow, type Stat } from './alarm-rules';

export const RANGES = {
  '1h': { ms: 60 * 60_000, bucketMs: 60_000 },
  '24h': { ms: 24 * 60 * 60_000, bucketMs: 15 * 60_000 },
  '7d': { ms: 7 * 24 * 60 * 60_000, bucketMs: 2 * 60 * 60_000 },
} as const;
export type RangeId = keyof typeof RANGES;

/** A production deploy result, drawn as a marker on every chart. */
export interface DeployMarker {
  at: number;
  sha: string;
  status: 'success' | 'rolledback' | 'fail' | string;
}

export interface ChartThreshold {
  value: number;
  /** e.g. "A08 · 10 min" */
  label: string;
  muted: boolean;
}

export interface ChartSeries {
  key: string;
  metric: string;
  dim: string;
  stat: Stat;
  unit: EffectiveRule['unit'];
  title: string;
  /** For dim '*': the series is the worst dimension per point. */
  worstOf: boolean;
  thresholds: ChartThreshold[];
  points: { t: number; v: number }[];
}

/** One chart per distinct metric|dim|stat among the rules, keeping rule order. */
export function chartSpecs(rules: EffectiveRule[]) {
  const specs = new Map<
    string,
    {
      metric: string;
      dim: string;
      stat: Stat;
      unit: EffectiveRule['unit'];
      title: string;
      rules: EffectiveRule[];
    }
  >();
  for (const r of rules) {
    const key = `${r.metric}|${r.dim}|${r.stat}`;
    const s = specs.get(key);
    if (s) s.rules.push(r);
    else
      specs.set(key, {
        metric: r.metric,
        dim: r.dim,
        stat: r.stat,
        unit: r.unit,
        title: r.title,
        rules: [r],
      });
  }
  return [...specs.entries()].map(([key, s]) => ({ key, ...s }));
}

const STEPS_MIN = [1, 5, 15, 30, 60, 120];
const MIN_POINTS = 12;

/**
 * The range's bucket size — unless the stored history is younger than the
 * range, in which case the largest step that still gives MIN_POINTS points
 * over the history that exists. Otherwise a fresh history (just deployed, or
 * after a gap) shows "no data" on 24h / 7d for its first hours.
 */
export function bucketFor(range: RangeId, rows: SeriesRow[], now: number): number {
  const { ms, bucketMs } = RANGES[range];
  let oldest = now;
  for (const r of rows) {
    const t = new Date(r.at).getTime();
    if (t < oldest && t >= now - ms) oldest = t;
  }
  const span = now - oldest;
  let best = 60_000;
  for (const m of STEPS_MIN) {
    const step = m * 60_000;
    if (step > bucketMs) break;
    if (span / step >= MIN_POINTS) best = step;
  }
  return best;
}

export function buildSeries(
  rules: EffectiveRule[],
  rows: SeriesRow[],
  range: RangeId,
  now: number,
): ChartSeries[] {
  const { ms } = RANGES[range];
  const bucketMs = bucketFor(range, rows, now);
  const start = Math.floor((now - ms) / bucketMs) * bucketMs;
  return chartSpecs(rules).map((spec) => {
    const mine = rows.filter(
      (r) =>
        r.metric === spec.metric &&
        (spec.dim === '*' || r.dim === spec.dim) &&
        r[spec.stat] !== null,
    );
    // bucket → dim → weighted accumulators
    const buckets = new Map<number, Map<string, { sum: number; weight: number }>>();
    for (const r of mine) {
      const t = new Date(r.at).getTime();
      if (t < start) continue;
      const b = Math.floor(t / bucketMs) * bucketMs;
      const byDim = buckets.get(b) ?? new Map();
      buckets.set(b, byDim);
      const acc = byDim.get(r.dim) ?? { sum: 0, weight: 0 };
      // Same weighting as the alarm evaluation: by samples, or evenly for gauges.
      const w = r.count > 0 ? r.count : 1;
      acc.sum += (r[spec.stat] as number) * w;
      acc.weight += w;
      byDim.set(r.dim, acc);
    }
    const points = [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([t, byDim]) => ({
        t,
        v: Math.round(Math.max(...[...byDim.values()].map((a) => a.sum / a.weight)) * 100) / 100,
      }));
    return {
      key: spec.key,
      metric: spec.metric,
      dim: spec.dim,
      stat: spec.stat,
      unit: spec.unit,
      title: spec.rules.length > 1 ? spec.title.replace(/ (spiking|high)$/, '') : spec.title,
      worstOf: spec.dim === '*',
      thresholds: spec.rules.map((r) => ({
        value: r.threshold,
        label: `${r.id} · ${r.forMinutes} min`,
        muted: r.muted,
      })),
      points,
    };
  });
}

/** Metrics any chart needs, for the server query. */
export const CHART_METRICS = [...new Set(METRIC_ALARMS.map((r) => r.metric))];
