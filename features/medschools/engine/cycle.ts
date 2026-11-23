import type { MedEventType } from './types';

const DAY_MS = 86_400_000;

/** Entry year from a label: '2026-2027' -> 2027. */
export function cycleYearFromLabel(label: string): number {
  const m = /^(\d{4})-(\d{4})$/.exec(label.trim());
  if (!m) throw new Error(`Invalid cycle label: ${label}`);
  const first = Number(m[1]);
  const second = Number(m[2]);
  if (second !== first + 1) throw new Error(`Invalid cycle label: ${label}`);
  return second;
}

export function defaultDayZero(cycleYear: number): string {
  return `${cycleYear - 1}-06-01`;
}

function utcDay(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

/** Whole days from `dayZeroOn` to `date` (both YYYY-MM-DD), computed in UTC so no timezone can shift it. */
export function dayOfCycle(date: string, dayZeroOn: string): number {
  return utcDay(date) - utcDay(dayZeroOn);
}

/** UTC month (0-based) at which an event type starts belonging to the NEXT entry year. */
const NEXT_CYCLE_FROM_MONTH: Record<MedEventType, number> = {
  SECONDARY: 5, // June 1: secondaries open for the next cycle
  INTERVIEW: 6, // July 1
  ACCEPTANCE: 8, // September 1: summer decisions still belong to that August's class
  WAITLIST: 8,
  REJECTION: 8,
  WITHDRAWN: 8,
  HOLD: 8,
};

/**
 * Entry year an event belongs to, by its type (ruling R0): decisions roll over on
 * September 1, interviews on July 1, secondaries on June 1, all in UTC.
 */
export function cycleYearOf(date: Date, type: MedEventType): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() < NEXT_CYCLE_FROM_MONTH[type] ? year : year + 1;
}

/** "2026–2027" for entry year 2027, the way a cycle is named on the pages and cards. */
export function cycleLabel(cycleYear: number): string {
  return `${cycleYear - 1}\u2013${cycleYear}`;
}

/**
 * `cycleLabel` wrapped in a left-to-right isolate (U+2066 .. U+2069), for the pages. In a right-to-left sentence the
 * bidi algorithm lays "2026\u20132027" out as "2027\u20132026", so a cycle read backwards in `ar`; the isolate keeps the
 * years in order and leaves the text around it alone. The OG cards use the plain `cycleLabel`.
 */
export function cycleLabelIsolated(cycleYear: number): string {
  return `\u2066${cycleLabel(cycleYear)}\u2069`;
}

/** Last UTC day of the cycle (the day before the next cycle's default start). */
export function cycleEndOn(cycleYear: number): string {
  return `${cycleYear}-05-31`;
}
