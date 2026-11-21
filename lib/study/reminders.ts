/**
 * Pure rules of the daily flashcard reminder: the 15-minute time grid, the next send instant for a local
 * time in a time zone (DST-safe through `wallToUtcMs`), and the pause rule. No database, no clock: the
 * server module passes the instant in.
 */
import { addDays, dayOf, parseDay, wallToUtcMs } from '@/lib/calendar/tz';

/** After this many reminders with no review in between, reminders pause until the member resumes. */
export const PAUSE_AFTER_REMINDERS = 14;

/** A reminder missed by more than this (the jobs worker was down) is skipped, not sent hours late. */
export const MAX_LATE_MS = 3 * 60 * 60_000;

/** The most rows one sweep run reads. */
export const SWEEP_BATCH = 1000;

export const DEFAULT_REMINDER_TIME = '18:00';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `HH:MM` on the 15-minute grid. */
export function isGridTime(time: string): boolean {
  const m = TIME_RE.exec(time);
  return !!m && Number(m[2]) % 15 === 0;
}

/** All 96 grid times, `00:00` to `23:45`. */
export const GRID_TIMES: readonly string[] = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
});

/**
 * The first instant after `fromMs` at which the clocks in `timeZone` read `localTime`, in epoch ms. A time a
 * spring-forward skips fires just after the gap; a time a fall-back repeats fires at its first occurrence.
 * Throws on a time that is not `HH:MM`.
 */
export function nextReminderMs(localTime: string, timeZone: string, fromMs: number): number {
  const m = TIME_RE.exec(localTime);
  if (!m) throw new Error(`bad reminder time: ${localTime}`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  let day = dayOf(fromMs, timeZone);
  // Today's reading may already have passed, and a later day's reading can land before `fromMs` only
  // across an odd offset change, so walk forward until one is strictly after.
  for (let i = 0; i < 3; i++) {
    const p = parseDay(day);
    if (!p) throw new Error(`bad day: ${day}`);
    const at = wallToUtcMs({ y: p.y, mo: p.mo, d: p.d, h, mi }, timeZone);
    if (at > fromMs) return at;
    day = addDays(day, 1);
  }
  throw new Error('no reminder instant found');
}

/** Whether the reminder that was due at `dueMs` is still worth sending at `nowMs`. */
export function isStale(dueMs: number, nowMs: number): boolean {
  return nowMs - dueMs > MAX_LATE_MS;
}
