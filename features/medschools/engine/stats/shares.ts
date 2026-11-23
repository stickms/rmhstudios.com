import { RECENCY_RATIO } from './constants';

/** A day's reported count; `day` = days since the cycle's day zero. Sparse input is fine. */
export interface DayCount {
  day: number;
  count: number;
}

export function cumulativeAt(days: readonly DayCount[], day: number): number {
  let n = 0;
  for (const d of days) if (d.day <= day) n += d.count;
  return n;
}

export function seasonTotal(days: readonly DayCount[]): number {
  let n = 0;
  for (const d of days) n += d.count;
  return n;
}

/** Fraction of the season total reported by `day`: 0 when the season is empty, 1 after its last day. */
export function shareAt(days: readonly DayCount[], day: number): number {
  const total = seasonTotal(days);
  return total > 0 ? cumulativeAt(days, day) / total : 0;
}

/** 1, .5, .25 ... normalised to sum to 1 (newest first). */
export function recencyWeights(n: number): number[] {
  if (n <= 0) return [];
  const raw = Array.from({ length: n }, (_, k) => RECENCY_RATIO ** k);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}
