/**
 * The current-cycle forecast (phase 5, D3 and D4): historical share curves, recency weights, a Poisson-noised
 * Monte Carlo of the rest of the season, p10/p50/p90 per day. Pure: no I/O, no clock, seeded noise.
 *
 * Never sums sources: every history cycle handed in is already from the SAME source as the current primary series
 * (the job picks them); this module only sees day counts.
 */
import type { MedSource } from '../types';
import { DRAWS, EARLY_SHARE, EARLY_WIDEN, IMPLIED_MIN_SHARE, MAX_HISTORY, MIN_HISTORY_TOTAL } from './constants';
import { mulberry32, poisson, quantile } from './random';
import { cumulativeAt, recencyWeights, seasonTotal, type DayCount } from './shares';

export interface HistoryCycle {
  cycleYear: number;
  source: MedSource;
  days: DayCount[];
}
export interface ForecastInput {
  /** The primary series' daily counts through asOfDay (days since THIS cycle's day zero). */
  current: DayCount[];
  /** Yesterday: the last fully reported day. */
  asOfDay: number;
  /** The cycle's last day, in days since day zero. */
  endDay: number;
  /** Newest first. Raw: the engine drops cycles under MIN_HISTORY_TOTAL and keeps at most MAX_HISTORY. */
  history: HistoryCycle[];
  seed: number;
}
export interface BandPoint {
  day: number;
  p10: number;
  p50: number;
  p90: number;
}
export interface Quantiles {
  p10: number;
  p50: number;
  p90: number;
}
export interface ForecastBasis {
  cycleYear: number;
  source: MedSource;
  /** The weight the cycle had in the draws (0 when it could not give an implied total in FULL mode). */
  weight: number;
  total: number;
  shareAtAsOf: number;
  impliedTotal: number | null;
}
export interface ForecastResult {
  mode: 'FULL' | 'EARLY' | 'NONE';
  observed: number;
  meanShare: number | null;
  basis: ForecastBasis[];
  /** asOfDay .. endDay, step 1. Empty when NONE or when asOfDay is outside [0, endDay). */
  band: BandPoint[];
  total: Quantiles | null;
  /** Days since day zero: the day the cumulative reaches half of the final total. */
  halfDay: Quantiles | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Cumulative count at each day of [from, to] (everything before `from` is in the first value). */
function denseCumulative(days: readonly DayCount[], from: number, to: number): Float64Array {
  const out = new Float64Array(to - from + 1);
  let base = 0;
  for (const d of days) {
    if (d.day <= from) base += d.count;
    else if (d.day <= to) out[d.day - from] = (out[d.day - from] ?? 0) + d.count;
  }
  let run = base;
  for (let i = 0; i < out.length; i++) {
    run += out[i] ?? 0;
    out[i] = run;
  }
  return out;
}

interface Prepared {
  h: HistoryCycle;
  total: number;
  s0: number;
  weight: number;
  /** Remaining-share path q(d) for d = asOfDay..endDay; 0 throughout when nothing is left (s0 >= 1). */
  q: Float64Array;
}

function widen(q: Quantiles, lo: number, hi: number): Quantiles {
  const p10 = Math.max(lo, q.p50 - EARLY_WIDEN * (q.p50 - q.p10));
  const p90 = Math.min(hi, q.p50 + EARLY_WIDEN * (q.p90 - q.p50));
  return { p10, p50: q.p50, p90 };
}

export function forecastCycle(input: ForecastInput): ForecastResult {
  const { asOfDay, endDay, seed } = input;
  const current = input.current.filter((d) => d.day <= asOfDay);
  const observed = cumulativeAt(current, asOfDay);
  const usable = input.history.filter((h) => seasonTotal(h.days) >= MIN_HISTORY_TOTAL).slice(0, MAX_HISTORY);
  if (usable.length === 0) {
    return { mode: 'NONE', observed, meanShare: null, basis: [], band: [], total: null, halfDay: null };
  }

  const weights = recencyWeights(usable.length);
  const cycleAt = (h: HistoryCycle, from: number, to: number): Float64Array => denseCumulative(h.days, from, to);
  const span = Math.max(0, endDay - asOfDay);
  const shareFor = (h: HistoryCycle, total: number): { s0: number; q: Float64Array } => {
    // share at asOf, and the share path over asOfDay..endDay (clamped: a cycle past its end is simply 1)
    const lo = Math.min(asOfDay, endDay);
    const cum = cycleAt(h, lo, lo + span);
    const s0 = total > 0 ? (cum[0] ?? 0) / total : 0;
    const q = new Float64Array(span + 1);
    if (s0 < 1) {
      for (let i = 0; i <= span; i++) q[i] = Math.min(1, Math.max(0, ((cum[i] ?? 0) / total - s0) / (1 - s0)));
    }
    return { s0, q };
  };
  const prepared: Prepared[] = usable.map((h, k) => {
    const total = seasonTotal(h.days);
    const { s0, q } = shareFor(h, total);
    return { h, total, s0, weight: weights[k] ?? 0, q };
  });
  const meanShare = prepared.reduce((n, p) => n + p.weight * p.s0, 0);
  const eligible = prepared.filter((p) => p.s0 >= IMPLIED_MIN_SHARE);
  const full = meanShare >= EARLY_SHARE && observed > 0 && eligible.length > 0;
  const mode = full ? 'FULL' : 'EARLY';

  // Sampling weights: FULL draws only from cycles that give an implied total, renormalised.
  const pool = full ? eligible : prepared;
  const poolSum = pool.reduce((n, p) => n + p.weight, 0);
  const sampling = new Map<Prepared, number>(pool.map((p) => [p, poolSum > 0 ? p.weight / poolSum : 1 / pool.length]));
  const basis: ForecastBasis[] = prepared.map((p) => ({
    cycleYear: p.h.cycleYear,
    source: p.h.source,
    weight: sampling.get(p) ?? 0,
    total: p.total,
    shareAtAsOf: p.s0,
    impliedTotal: p.s0 >= IMPLIED_MIN_SHARE ? observed / p.s0 : null,
  }));
  const result = { mode, observed, meanShare, basis } as const;

  if (asOfDay < 0 || asOfDay >= endDay) {
    return { ...result, band: [], total: null, halfDay: null };
  }

  // Stratified inverse CDF over the pool: the weights are exact, not sampled.
  const cdf: { p: Prepared; upTo: number }[] = [];
  let acc = 0;
  for (const p of pool) {
    acc += sampling.get(p) ?? 0;
    cdf.push({ p, upTo: acc });
  }
  const pick = (u: number): Prepared => (cdf.find((c) => u <= c.upTo) ?? cdf[cdf.length - 1])!.p;

  const rnd = mulberry32(seed);
  const n = span + 1;
  const grid = new Float64Array(n * DRAWS); // [day index][draw]
  const remaining = new Float64Array(DRAWS);
  const chosen: Prepared[] = [];
  for (let i = 0; i < DRAWS; i++) {
    const p = pick((i + 0.5) / DRAWS);
    chosen.push(p);
    const mean = full ? (observed / p.s0) * (1 - p.s0) : 0;
    const r = full ? poisson(mean, rnd) : Math.max(0, poisson(p.total, rnd) - observed);
    remaining[i] = r;
    for (let d = 0; d < n; d++) grid[d * DRAWS + i] = observed + r * (p.q[d] ?? 0);
  }

  const lowBound = observed;
  const band: BandPoint[] = [];
  const col = new Float64Array(DRAWS);
  let prev: Quantiles = { p10: observed, p50: observed, p90: observed };
  for (let d = 0; d < n; d++) {
    for (let i = 0; i < DRAWS; i++) col[i] = grid[d * DRAWS + i] ?? 0;
    const sorted = Array.from(col).sort((a, b) => a - b);
    let q: Quantiles = { p10: quantile(sorted, 0.1), p50: quantile(sorted, 0.5), p90: quantile(sorted, 0.9) };
    if (mode === 'EARLY') q = widen(q, lowBound, Number.POSITIVE_INFINITY);
    // Running max: the three series never fall (widening and rounding must not break it).
    q = {
      p10: Math.max(prev.p10, q.p10),
      p50: Math.max(prev.p50, q.p50),
      p90: Math.max(prev.p90, q.p90),
    };
    prev = q;
    band.push({ day: asOfDay + d, p10: round2(q.p10), p50: round2(q.p50), p90: round2(q.p90) });
  }
  // Rounding keeps the order; guarantee the first point is exactly the observed count.
  const first = band[0];
  if (first) {
    first.p10 = observed;
    first.p50 = observed;
    first.p90 = observed;
  }
  const last = band[band.length - 1];
  const total: Quantiles | null = last ? { p10: last.p10, p50: last.p50, p90: last.p90 } : null;

  // halfDay: first day the cumulative (observed, then drawn) reaches half of that draw's final total.
  const minDay = current.reduce((m, d) => Math.min(m, d.day), 0);
  const obsCum = denseCumulative(current, minDay, asOfDay);
  const halves: number[] = [];
  for (let i = 0; i < DRAWS; i++) {
    const finalTotal = observed + (remaining[i] ?? 0) * (chosen[i]?.q[span] ?? 0);
    if (finalTotal <= 0) continue;
    const target = finalTotal / 2;
    let day: number | null = null;
    for (let k = 0; k < obsCum.length; k++) {
      if ((obsCum[k] ?? 0) >= target) {
        day = minDay + k;
        break;
      }
    }
    if (day === null) {
      for (let d = 1; d < n; d++) {
        if ((grid[d * DRAWS + i] ?? 0) >= target) {
          day = asOfDay + d;
          break;
        }
      }
    }
    halves.push(day ?? endDay);
  }
  let halfDay: Quantiles | null = null;
  if (halves.length > 0) {
    halves.sort((a, b) => a - b);
    let h: Quantiles = { p10: quantile(halves, 0.1), p50: quantile(halves, 0.5), p90: quantile(halves, 0.9) };
    if (mode === 'EARLY') h = widen(h, minDay, endDay);
    halfDay = { p10: Math.round(h.p10), p50: Math.round(h.p50), p90: Math.round(h.p90) };
  }
  return { ...result, band, total, halfDay };
}
