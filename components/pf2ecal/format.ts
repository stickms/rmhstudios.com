/**
 * Every string of time the page renders.
 *
 * The rule the table asked for: **show my local time, with the exact Central
 * time in parentheses.** So a player in Denver sees `6:00 PM (7:00 PM CDT)` and
 * one in London sees `1:00 AM (7:00 PM CDT)` — one clock they can act on, and
 * one shared reference everybody can quote at each other.
 *
 * Two details that are easy to get wrong and visible when you do:
 *
 * 1. **The parenthetical is dropped when it would repeat the line.** A player
 *    already in Central would otherwise read `7:00 PM (7:00 PM CDT)`. They get
 *    `7:00 PM CDT` instead: same information, no stutter. The comparison is on
 *    the rendered wall-clock string rather than on the timezone name, so
 *    `America/Winnipeg` and `America/Chicago` — different zones, identical
 *    clock — collapse correctly too.
 *
 * 2. **"CDT" is never hardcoded.** It is whatever `America/Chicago` is actually
 *    observing at that instant, so a session on 2026-11-06 says CST. Writing
 *    the literal string would make the page wrong for four months of the year,
 *    silently, in the one place people go to avoid being wrong about the time.
 */

import {
  REFERENCE_TIME_ZONE,
  isSameZonedDay,
  resolveLocalTimeZone,
  zoneAbbreviation,
} from '@/lib/pf2ecal/zoned-time';

/** `7:00 PM` — no zone, no date. */
export function formatClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
}

/** `Wed, Aug 12` — weekday and date, no year. */
export function formatDayLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(instant);
}

/** `Wednesday, August 12, 2026` — the long form for a session header. */
export function formatFullDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(instant);
}

export interface TimeDisplay {
  /** The viewer's own clock: `7:00 PM – 11:00 PM`. */
  local: string;
  /**
   * The Central reference, already parenthesised — `(7:00 PM CDT)` — or an
   * empty string when the viewer is on the same clock and it would only repeat.
   */
  reference: string;
  /** `CDT` / `CST`, for the times the label is wanted on its own. */
  referenceAbbreviation: string;
  /** True when local and Central render identically. */
  isLocalReference: boolean;
}

/**
 * The full time line for a session: local range, plus the Central reference.
 *
 * `timeZone` is passed in rather than resolved here so a component can render
 * the same session in a different zone (and so SSR is deterministic — see
 * `useLocalTimeZone`).
 */
export function describeSessionTime(
  startsAt: Date,
  endsAt: Date,
  localTimeZone: string,
): TimeDisplay {
  const localStart = formatClock(startsAt, localTimeZone);
  const localEnd = formatClock(endsAt, localTimeZone);
  const refStart = formatClock(startsAt, REFERENCE_TIME_ZONE);
  const abbreviation = zoneAbbreviation(startsAt, REFERENCE_TIME_ZONE);

  // An end time on the following day gets its own marker, so an 8pm-to-midnight
  // session does not read as ending in the past.
  const crossesMidnight = !isSameZonedDay(startsAt, endsAt, localTimeZone);
  const local = `${localStart} – ${localEnd}${crossesMidnight ? ' +1' : ''}`;

  const isLocalReference = localStart === refStart;
  return {
    local: isLocalReference ? `${local} ${abbreviation}` : local,
    reference: isLocalReference ? '' : `(${refStart} ${abbreviation})`,
    referenceAbbreviation: abbreviation,
    isLocalReference,
  };
}

/**
 * A short relative phrase — `today`, `tomorrow`, `in 9 days`, `3 days ago`.
 *
 * Two deliberate choices:
 *
 * 1. **Day units, computed in the viewer's zone**, not a millisecond division.
 *    "Tomorrow" is a calendar fact: a session 20 hours out is tonight or the
 *    day after depending on what time it is now, and `delta / 86400000` gets
 *    that wrong roughly half the time.
 * 2. **`Intl.RelativeTimeFormat`, not a `t()` key.** It already knows the
 *    phrasing for every locale the site ships, including the ones with no word
 *    for "the day after tomorrow" and the ones that inflect on the number.
 *    `numeric: 'auto'` is what turns "in 0 days" into "today". Routing this
 *    through the catalog would mean hand-translating a problem the platform has
 *    already solved, and getting the plural rules wrong in about eight
 *    languages.
 *
 * It is always relative, never a weekday name. The card already prints
 * `formatDayLabel` immediately to the left, so a weekday-name branch for the
 * coming week rendered "Wed, Aug 12 · Wednesday" — the same word twice with a
 * separator between it.
 */
export function formatRelativeDay(instant: Date, now: Date, timeZone: string): string {
  const startOfDay = (value: Date): number => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
    return Date.parse(`${parts}T00:00:00Z`);
  };
  const days = Math.round((startOfDay(instant) - startOfDay(now)) / 86_400_000);
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(days, 'day');
}

/**
 * `August 2026` — the month grid's header.
 *
 * `timeZone: 'UTC'` is load-bearing, not decoration. The argument is a
 * *calendar month*, not an instant; it is turned into `Date.UTC(y, m-1, 1)`
 * purely so `Intl` has something to format. Without the explicit zone the
 * formatter uses the runtime's own, and midnight UTC on the 1st is the previous
 * month everywhere west of Greenwich — so a viewer in Denver saw a grid full of
 * August dates under the heading "July 2026", and the server (UTC) and the
 * client disagreed about the text, which is a hydration mismatch on top of the
 * wrong label.
 */
export function formatMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * The viewer's timezone, or the campaign default during SSR.
 *
 * Not a hook — see `useLocalTimeZone` in `state.ts` for the hook that defers
 * this to the client. Calling it directly during render would give the server's
 * zone on the first paint and the browser's on the second, which React reports
 * as a hydration mismatch on every time on the page.
 */
export { resolveLocalTimeZone };

/** A `datetime-local` input value (`2026-08-12T20:00`) for an instant in `timeZone`. */
export function toDateTimeLocalValue(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  // `hour12: false` can render midnight as 24 in some ICU builds; the input
  // rejects `T24:00` outright, so normalise before assembling.
  const hour = String(Number.parseInt(get('hour'), 10) % 24).padStart(2, '0');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/** Whether a free-text location is something we should render as a link. */
export function asExternalUrl(location: string): string | null {
  const trimmed = location.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
