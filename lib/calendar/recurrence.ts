/**
 * K4 — recurring group events. Pure and client-safe.
 *
 * The rule is two characters on the event row (`W` weekly, `M` monthly on the
 * same nth weekday), plus an optional end date and a timezone. Occurrences are
 * COMPUTED for the window being looked at and never stored — a weekly event
 * with no end date would otherwise need an unbounded number of rows.
 *
 * Wall-clock time is preserved in the event's timezone, so an 8pm game night
 * stays at 8pm after a daylight-saving change instead of drifting to 9pm.
 */
import { wallTimeOf, wallToUtcMs } from './tz';

export const RECURRENCE_RULES = ['W', 'M'] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export function isRecurrenceRule(v: unknown): v is RecurrenceRule {
  return v === 'W' || v === 'M';
}

export interface Occurrence {
  /** 0 for the first occurrence. Drives the rotating host. */
  index: number;
  startsAt: Date;
}

export interface RecurringSeries {
  rule: RecurrenceRule;
  tz: string;
  first: Date;
  until: Date | null;
}

const DAY_MS = 86_400_000;
/** Hard cap on one expansion — a safety rail on the caller's arithmetic. */
export const MAX_EXPANSION = 120;

/** The Nth (1–4) weekday of a month, where 5 means "the last one". */
function nthWeekdayInMonth(y: number, mo: number, weekday: number, n: number): number {
  const firstDow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const firstHit = 1 + ((weekday - firstDow + 7) % 7);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (n >= 5) {
    let d = firstHit + 28;
    if (d > daysInMonth) d -= 7;
    return d;
  }
  return firstHit + (n - 1) * 7;
}

/** Start of occurrence number `k` (k = 0 is the first). */
export function occurrenceStart(series: RecurringSeries, k: number): Date {
  const w = wallTimeOf(series.first.getTime(), series.tz);
  if (series.rule === 'W') {
    const day = new Date(Date.UTC(w.y, w.mo - 1, w.d + 7 * k));
    return new Date(
      wallToUtcMs(
        {
          y: day.getUTCFullYear(),
          mo: day.getUTCMonth() + 1,
          d: day.getUTCDate(),
          h: w.h,
          mi: w.mi,
        },
        series.tz,
      ),
    );
  }
  const n = Math.min(5, Math.ceil(w.d / 7));
  const monthIndex = w.mo - 1 + k;
  const y = w.y + Math.floor(monthIndex / 12);
  const mo = (((monthIndex % 12) + 12) % 12) + 1;
  const d = nthWeekdayInMonth(y, mo, w.weekday, n);
  return new Date(wallToUtcMs({ y, mo, d, h: w.h, mi: w.mi }, series.tz));
}

/** Rough index to start scanning from, always at or before the true one. */
function estimateStart(series: RecurringSeries, from: Date): number {
  const delta = from.getTime() - series.first.getTime();
  if (delta <= 0) return 0;
  const k =
    series.rule === 'W' ? Math.floor(delta / (7 * DAY_MS)) : Math.floor(delta / (31 * DAY_MS));
  return Math.max(0, k - 1);
}

/** Occurrences whose start is within [from, to], oldest first. */
export function occurrencesBetween(
  series: RecurringSeries,
  from: Date,
  to: Date,
  max = MAX_EXPANSION,
): Occurrence[] {
  const out: Occurrence[] = [];
  const hardEnd = series.until ? Math.min(to.getTime(), endOfDay(series.until)) : to.getTime();
  for (let k = estimateStart(series, from); out.length < max; k++) {
    const startsAt = occurrenceStart(series, k);
    if (startsAt.getTime() > hardEnd) break;
    if (startsAt.getTime() >= from.getTime()) out.push({ index: k, startsAt });
    if (k > 5000) break;
  }
  return out;
}

/** The first occurrence starting at or after `from`, or null once the series has ended. */
export function nextOccurrence(series: RecurringSeries, from: Date): Occurrence | null {
  const horizon = new Date(Math.max(from.getTime(), series.first.getTime()) + 400 * DAY_MS);
  return occurrencesBetween(series, from, horizon, 1)[0] ?? null;
}

/** Is `at` exactly one of the series' occurrences? Returns its index, else null. */
export function occurrenceIndexOf(series: RecurringSeries, at: Date): number | null {
  const found = occurrencesBetween(
    series,
    new Date(at.getTime() - 1000),
    new Date(at.getTime() + 1000),
    2,
  ).find((o) => o.startsAt.getTime() === at.getTime());
  return found ? found.index : null;
}

/** The host of occurrence `index`: the rotation's [index % length], else the owner. */
export function hostFor(ownerId: string, rotation: readonly string[], index: number): string {
  if (rotation.length === 0) return ownerId;
  return rotation[((index % rotation.length) + rotation.length) % rotation.length];
}

/** `until` is a calendar date: the series may still occur ON that day. */
function endOfDay(d: Date): number {
  return d.getTime() + DAY_MS - 1;
}

export type OccurrenceStatus = 'going' | 'maybe';

/**
 * Who is attending ONE occurrence of a repeating event.
 *
 * An "every time" RSVP carries over to each occurrence; a row for that specific
 * occurrence overrides it — including `no`, which is how somebody who is
 * normally there sits one out without giving up their standing RSVP.
 */
export function effectiveAttendance(
  everyTime: readonly { userId: string; status: string }[],
  occurrence: readonly { userId: string; status: string }[],
): Map<string, OccurrenceStatus> {
  const out = new Map<string, OccurrenceStatus>();
  const ok = (s: string): s is OccurrenceStatus => s === 'going' || s === 'maybe';
  for (const r of everyTime) if (ok(r.status)) out.set(r.userId, r.status);
  for (const r of occurrence) {
    if (ok(r.status)) out.set(r.userId, r.status);
    else out.delete(r.userId);
  }
  return out;
}
