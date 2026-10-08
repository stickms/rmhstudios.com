/**
 * Rebar & Rutabaga — the booking rules, with no database and no Prisma.
 *
 * The page has always stated these rules in `Reservations.tsx`; until now
 * nothing enforced them, because the only way to book was a `mailto:` and the
 * enforcement happened in somebody's inbox. This module is those same sentences
 * as code, and it is deliberately the only place they exist as logic:
 *
 *   - **Wednesday to Saturday.** ("Nights: Wednesday – Saturday")
 *   - **Two seatings, 17:30 and 20:45.** ("Seatings: 17:30 · 20:45")
 *   - **Bookings open on the first of each month at 09:00 CET, for the month
 *     after next.** So on 3 March you may book April... no: the month after
 *     next is May. March's window opens 1 March and covers all of May.
 *
 * Client-safe: the form needs to grey out a Tuesday before it sends anything,
 * and the server needs to refuse one that arrives anyway. Two copies of that
 * would disagree the first time one was edited.
 *
 * ## Why the times are Europe/Stockholm and not UTC
 *
 * A restaurant's seating is a wall-clock fact in the room it happens in. 17:30
 * is 17:30 in Gothenburg whether the reader is in Karachi or Chicago, and
 * whether or not Sweden is on summer time that week. So a reservation stores
 * the LOCAL service date (a calendar day, no zone) plus which of the two
 * seatings it is, and the instant is derived for display. Storing a UTC instant
 * would make the seating drift an hour twice a year.
 */

/** The two seatings, as the page prints them. */
export const SEATINGS = ['17:30', '20:45'] as const;
export type Seating = (typeof SEATINGS)[number];

/** Service runs Wednesday (3) through Saturday (6), by `Date#getUTCDay`. */
export const SERVICE_DAYS = [3, 4, 5, 6] as const;

/**
 * Covers per seating.
 *
 * Twenty-two is the dining room; `RoomSchedule.tsx` draws the same room. The
 * kitchen plates nine courses per guest by hand, so this is a hard ceiling
 * rather than a target, and the overbooking a restaurant normally does would be
 * the wrong behaviour here: there is no bar to wait at.
 */
export const COVERS_PER_SEATING = 22;

/** Largest party the form takes. Above this the `mailto:` is the right path. */
export const MAX_PARTY_SIZE = 6;

/** The restaurant's own timezone. */
export const RESTAURANT_TZ = 'Europe/Stockholm';

/** A calendar day, no time and no zone: `YYYY-MM-DD`. */
export type ServiceDate = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Is this a well-formed `YYYY-MM-DD` that names a real day? */
export function isServiceDateShape(value: string): value is ServiceDate {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Does the restaurant serve on this date at all? */
export function isServiceDay(date: ServiceDate): boolean {
  if (!isServiceDateShape(date)) return false;
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return (SERVICE_DAYS as readonly number[]).includes(day);
}

/** `YYYY-MM` for a service date. */
function monthOf(date: ServiceDate): string {
  return date.slice(0, 7);
}

/** Add `n` months to a `YYYY-MM`, carrying the year. */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const zero = y * 12 + (m - 1) + n;
  return `${String(Math.floor(zero / 12)).padStart(4, '0')}-${String((zero % 12) + 1).padStart(2, '0')}`;
}

/**
 * The single month currently open for booking: the month after next, relative
 * to `now` in the restaurant's timezone.
 *
 * `now` is read in Europe/Stockholm, not UTC — a request at 23:30 UTC on 31
 * January is already 1 February in Gothenburg, and that is the moment the
 * window is supposed to turn over.
 */
export function bookableMonth(now: Date = new Date()): string {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  return addMonths(local.slice(0, 7), 2);
}

/** Why a requested date cannot be booked, or null when it can. */
export type BookingRefusal = 'malformed' | 'not-a-service-day' | 'outside-window';

/**
 * Check a date against every rule the page states. Order matters only for which
 * message the guest is shown first, and shape errors come first because the
 * other two questions are meaningless for a string that is not a date.
 */
export function checkServiceDate(date: string, now: Date = new Date()): BookingRefusal | null {
  if (!isServiceDateShape(date)) return 'malformed';
  if (!isServiceDay(date)) return 'not-a-service-day';
  if (monthOf(date) !== bookableMonth(now)) return 'outside-window';
  return null;
}

/** Every servable date in the currently open month, in order. */
export function bookableDates(now: Date = new Date()): ServiceDate[] {
  const ym = bookableMonth(now);
  const [y, m] = ym.split('-').map(Number);
  // Day 0 of the NEXT month is the last day of this one.
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: ServiceDate[] = [];
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    if (isServiceDay(date)) out.push(date);
  }
  return out;
}

/** Is this one of the two seatings? */
export function isSeating(value: string): value is Seating {
  return (SEATINGS as readonly string[]).includes(value);
}

/** Remaining covers, floored at zero so a manual overbook cannot read negative. */
export function seatsLeft(booked: number): number {
  return Math.max(0, COVERS_PER_SEATING - booked);
}

/** Can a party of `size` still be seated against `booked` covers? */
export function fits(booked: number, size: number): boolean {
  return size >= 1 && size <= MAX_PARTY_SIZE && seatsLeft(booked) >= size;
}
