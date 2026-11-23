/** UTC calendar-day arithmetic on `YYYY-MM-DD` strings. No timezone can shift a result. */
const DAY_MS = 86_400_000;
const FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole UTC days since 1970-01-01. Throws on a malformed or non-existent date (2026-02-30). */
export function dayIndex(date: string): number {
  const m = FORMAT.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== date) throw new Error(`Invalid date: ${date}`);
  return ms / DAY_MS;
}

/** Inverse of `dayIndex`, `YYYY-MM-DD`. */
export function dateOfIndex(i: number): string {
  return new Date(i * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return dateOfIndex(dayIndex(date) + n);
}
