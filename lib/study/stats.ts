/**
 * Flashcard statistics maths. Pure: days are `YYYY-MM-DD` keys in the viewer's time zone, so
 * the server and the page agree on which cell a review lands in.
 */

export type CardState = 'new' | 'learning' | 'young' | 'mature';

/** A review graded at least this passed (grades are 0 again, 1 hard, 2 good, 3 easy). */
export const PASS_GRADE = 1;
/** Retention is hidden under this many reviews. */
export const MIN_RETENTION_SAMPLES = 20;
export const HEATMAP_DAYS = 365;
export const FORECAST_DAYS = 30;
export const DEFAULT_TIME_ZONE = 'UTC';

const DAY_MS = 24 * 60 * 60 * 1000;

/** New (never reviewed), learning (under a day), young (1 to 20 days), mature (21 or more). */
export function cardState(intervalDays: number, hasReview: boolean): CardState {
  if (!hasReview) return 'new';
  if (intervalDays < 1) return 'learning';
  return intervalDays < 21 ? 'young' : 'mature';
}

/** True when `timeZone` is an IANA name the runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar day `date` falls on in `timeZone`, as `YYYY-MM-DD`. */
export function dayKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function keyToUtc(key: string): number {
  return Date.parse(`${key}T00:00:00Z`);
}

/** `key` shifted by `n` calendar days. */
export function addDays(key: string, n: number): string {
  return new Date(keyToUtc(key) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Daily review streaks. `dayKeys` are the days with at least one review (any order, repeats
 * allowed). The current streak counts back from `today`; an empty today does not end it,
 * the day is not over, so it then counts back from yesterday.
 */
export function streaks(dayKeys: string[], today: string): { current: number; longest: number } {
  const days = [...new Set(dayKeys)].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of days) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = day;
  }
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

/** The share of reviews that passed, or null under {@link MIN_RETENTION_SAMPLES}. */
export function retention(counts: { total: number; passed: number }): {
  rate: number | null;
  samples: number;
} {
  const samples = counts.total;
  return {
    rate: samples < MIN_RETENTION_SAMPLES ? null : counts.passed / samples,
    samples,
  };
}

/** One entry per day from `today`, `days` long. Overdue cards (a day before today) count on today. */
export function forecast(
  due: { date: string; count: number }[],
  today: string,
  days: number = FORECAST_DAYS,
): { date: string; count: number }[] {
  const out = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i), count: 0 }));
  for (const row of due) {
    const index = row.date < today ? 0 : Math.round((keyToUtc(row.date) - keyToUtc(today)) / DAY_MS);
    const slot = out[index];
    if (slot) slot.count += row.count;
  }
  return out;
}

/** Every day of the `days` ending on `today`, oldest first; days with no row count 0. */
export function fillDays(
  counts: { date: string; count: number }[],
  today: string,
  days: number = HEATMAP_DAYS,
): { date: string; count: number }[] {
  const byDay = new Map(counts.map((c) => [c.date, c.count]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    return { date, count: byDay.get(date) ?? 0 };
  });
}
