/**
 * Wave detection (phase 5, D10): a day is a wave when its count is more than 3 x the median of the previous 14 days
 * (zeros included), is at least 5, and at least 7 previous days of data exist. The floor of 5 is the plan's: with a
 * median of 0 the bare rule would call every first invite a wave. Pure; days are days-since-day-zero, sparse is fine.
 */
import { WAVE_FACTOR, WAVE_MIN_COUNT, WAVE_MIN_HISTORY, WAVE_WINDOW } from './constants';
import { quantile } from './random';
import type { DayCount } from './shares';

export interface Wave {
  day: number;
  count: number;
  /** The trailing 14-day median the day was compared with. */
  baseline: number;
}

/**
 * Median of the `window` days before `day` (the day itself excluded), a missing day counting as zero. `firstDay`
 * clips the window at the start of the data, so days before the first report are not counted as quiet days.
 */
export function trailingMedian(
  days: readonly DayCount[],
  day: number,
  window: number = WAVE_WINDOW,
  firstDay: number = Number.NEGATIVE_INFINITY,
): number {
  const from = Math.max(day - window, firstDay);
  const byDay = new Map<number, number>();
  for (const d of days) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.count);
  const values: number[] = [];
  for (let d = from; d < day; d++) values.push(byDay.get(d) ?? 0);
  values.sort((a, b) => a - b);
  return quantile(values, 0.5);
}

export function detectWaves(days: readonly DayCount[], range?: { from: number; to: number }): Wave[] {
  if (days.length === 0) return [];
  const byDay = new Map<number, number>();
  for (const d of days) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.count);
  const first = Math.min(...byDay.keys());
  const last = Math.max(...byDay.keys());
  const out: Wave[] = [];
  for (let day = first + WAVE_MIN_HISTORY; day <= last; day++) {
    if (range && (day < range.from || day > range.to)) continue;
    const count = byDay.get(day) ?? 0;
    if (count < WAVE_MIN_COUNT) continue;
    const baseline = trailingMedian(days, day, WAVE_WINDOW, first);
    if (count > WAVE_FACTOR * baseline) out.push({ day, count, baseline });
  }
  return out;
}
