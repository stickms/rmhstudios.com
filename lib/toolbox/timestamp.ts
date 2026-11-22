/**
 * Unix timestamps and dates.
 *
 * A bare number is read by its size, the way logs and APIs use them: up to 11
 * digits is seconds, 12 to 14 milliseconds, 15 to 17 microseconds and more is
 * nanoseconds (a seconds value of 12 digits would be the year 5138). The unit
 * can be fixed instead when the guess would be wrong.
 */

export type TimeUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';

export type UnitChoice = TimeUnit | 'auto';

export function guessUnit(digits: string): TimeUnit {
  const n = digits.replace(/^[-+]/, '').split('.')[0]?.length ?? 0;
  if (n <= 11) return 'seconds';
  if (n <= 14) return 'milliseconds';
  if (n <= 17) return 'microseconds';
  return 'nanoseconds';
}

const PER_MS: Record<TimeUnit, number> = { seconds: 1e-3, milliseconds: 1, microseconds: 1e3, nanoseconds: 1e6 };

export type TimestampParse =
  { ok: true; date: Date; unit: TimeUnit | 'date' } | { ok: false; reason: 'empty' | 'invalid' | 'out-of-range' };

/** JavaScript dates span ±8.64e15 ms around 1970. */
const MAX_MS = 8.64e15;

export function parseTimestamp(input: string, unit: UnitChoice = 'auto'): TimestampParse {
  const s = input.trim();
  if (!s) return { ok: false, reason: 'empty' };
  if (/^[-+]?\d+(\.\d+)?$/.test(s)) {
    const u = unit === 'auto' ? guessUnit(s) : unit;
    const ms = Number(s) / PER_MS[u];
    if (!Number.isFinite(ms) || Math.abs(ms) > MAX_MS) return { ok: false, reason: 'out-of-range' };
    return { ok: true, date: new Date(Math.trunc(ms)), unit: u };
  }
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return { ok: false, reason: 'invalid' };
  return { ok: true, date: new Date(ms), unit: 'date' };
}

/** Day of the year, 1 to 366, in UTC. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000) + 1;
}

/** ISO 8601 week-numbering year and week, in UTC. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7) };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365.2425 * 86_400_000],
  ['month', 30.436875 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1000],
];

/** The largest whole unit between `date` and `now`, signed: `[-3, 'day']` is three days ago. */
export function relativeParts(date: Date, now: Date): [number, Intl.RelativeTimeFormatUnit] {
  const diff = date.getTime() - now.getTime();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return [Math.trunc(diff / ms), unit];
  }
  return [0, 'second'];
}

/** Seconds since the epoch, as Unix tools print it (floored, so pre-1970 instants round down). */
export function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
