/**
 * Away messages (sprint 06 #18): the pure rules. Client-safe, no database.
 *
 * An away message is the member's own words (1 to 300 characters) and a window in their time zone. It ends by itself:
 * "active" is a read-time check against `startsAt` and `endsAt`, never a job.
 */
import { addDays, dayOf, isValidTimeZone, parseDay, wallToUtcMs } from '@/lib/calendar/tz';

export const AWAY_BODY_MAX = 300;
/** The end day may be at most this many days after today (in the member's zone). */
export const AWAY_MAX_DAYS = 60;

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The columns the rules read. */
export interface AwayWindow {
  startsAt: Date | string;
  endsAt: Date | string;
}

const ms = (v: Date | string): number => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** Is the message in force right now? Not yet started and ended both say no. */
export function isAwayActive(row: AwayWindow, now: Date = new Date()): boolean {
  const t = now.getTime();
  return ms(row.startsAt) <= t && t < ms(row.endsAt);
}

/** Has it run out? A message that has not started yet has not ended. */
export function isAwayEnded(row: AwayWindow, now: Date = new Date()): boolean {
  return ms(row.endsAt) <= now.getTime();
}

export type AwayWindowError = 'tz' | 'end-day' | 'start-day' | 'end-before-start' | 'ended' | 'too-far';

/**
 * The instants for a window given as days in a time zone. The message starts at local midnight of `startDay` (or now,
 * when it is empty or not after today) and ends when `endDay` ends, so "until Friday" covers all of Friday.
 */
export function resolveAwayWindow(input: {
  startDay?: string | null | undefined;
  endDay: string;
  tz: string;
  now?: Date;
}): { ok: true; startsAt: Date; endsAt: Date } | { ok: false; error: AwayWindowError } {
  const now = input.now ?? new Date();
  const { tz } = input;
  if (!isValidTimeZone(tz)) return { ok: false, error: 'tz' };
  const end = parseDay(input.endDay);
  if (!end) return { ok: false, error: 'end-day' };
  const today = dayOf(now.getTime(), tz);
  if (input.endDay < today) return { ok: false, error: 'ended' };
  if (input.endDay > addDays(today, AWAY_MAX_DAYS)) return { ok: false, error: 'too-far' };

  let startsAt = now;
  if (input.startDay) {
    const start = parseDay(input.startDay);
    if (!start) return { ok: false, error: 'start-day' };
    if (input.startDay > input.endDay) return { ok: false, error: 'end-before-start' };
    if (input.startDay > today) {
      startsAt = new Date(wallToUtcMs({ ...start, h: 0, mi: 0 }, tz));
    }
  }
  const after = parseDay(addDays(input.endDay, 1));
  if (!after) return { ok: false, error: 'end-day' };
  const endsAt = new Date(wallToUtcMs({ ...after, h: 0, mi: 0 }, tz));
  if (endsAt.getTime() <= now.getTime()) return { ok: false, error: 'ended' };
  return { ok: true, startsAt, endsAt };
}

/** The last calendar day the message covers (`YYYY-MM-DD` in its zone): the day before the end instant. */
export function awayLastDay(endsAt: Date | string, tz: string): string {
  return dayOf(ms(endsAt) - 1, tz);
}

/** The first calendar day (`YYYY-MM-DD` in its zone). */
export function awayFirstDay(startsAt: Date | string, tz: string): string {
  return dayOf(ms(startsAt), tz);
}

/** A day string as a Date a formatter can print with `timeZone: 'UTC'` ("3 Dec" in the reader's language). */
export function awayDayDate(day: string): Date {
  const p = parseDay(day);
  return p ? new Date(Date.UTC(p.y, p.mo - 1, p.d, 12)) : new Date(NaN);
}

/** What the header, the profile line and the inbox line show: the end day only, never the text. */
export function awayLineData(row: AwayWindow & { tz: string }): { lastDay: string; date: Date } {
  const lastDay = awayLastDay(row.endsAt, row.tz);
  return { lastDay, date: awayDayDate(lastDay) };
}

/** Is this message's `meta` the label of an away message's automatic reply? */
export function isAwayAutoReply(meta: unknown): boolean {
  return typeof meta === 'object' && meta !== null && (meta as { autoReply?: unknown }).autoReply === 'away';
}
