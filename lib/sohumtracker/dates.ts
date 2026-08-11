/**
 * Calendar-key arithmetic for `/sohumtracker`.
 *
 * Everything here operates on `YYYY-MM-DD` STRINGS, not on instants. That is the
 * point: the tracker has already decided which local day each row belongs to and
 * written that decision into `dateKey`, so the page must never re-derive a day
 * from a timestamp and a guess at the viewer's zone. Walking dates as UTC
 * midnights is therefore not an approximation — the keys are labels, and UTC is
 * just the arithmetic that never has a DST gap in it.
 *
 * The one instant→key conversion the page needs (what is "today" in the tracking
 * zone) happens on the server and arrives as `todayKey`.
 *
 * Client-safe: no Prisma, no `node:*`.
 */

const MS_PER_DAY = 86_400_000;

/** Parse a `YYYY-MM-DD` key to its UTC midnight. Throws on a malformed key. */
export function dateKeyToUtc(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`bad dateKey: ${dateKey}`);
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/** True for a syntactically valid, real calendar date. */
export function isValidDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const parsed = new Date(`${dateKey}T00:00:00Z`);
  // Round-tripping catches 2026-02-30, which `Date` would roll into March.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateKey;
}

/** Render a UTC instant as a `YYYY-MM-DD` key. */
export function utcToDateKey(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** `2026-08-11` + 3 → `2026-08-14`; negative shifts go backwards. */
export function shiftDateKey(dateKey: string, days: number): string {
  return utcToDateKey(new Date(dateKeyToUtc(dateKey).getTime() + days * MS_PER_DAY));
}

/** Whole days between two keys (`to - from`). */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((dateKeyToUtc(toKey).getTime() - dateKeyToUtc(fromKey).getTime()) / MS_PER_DAY);
}

/** Every key from `fromKey` to `toKey`, inclusive. */
export function enumerateDateKeys(fromKey: string, toKey: string): string[] {
  const span = daysBetween(fromKey, toKey);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, i) => shiftDateKey(fromKey, i));
}

/** 0 = Monday … 6 = Sunday, matching the calendar grid's column order. */
export function mondayIndex(dateKey: string): number {
  return (dateKeyToUtc(dateKey).getUTCDay() + 6) % 7;
}

/**
 * The ISO week key (`2026-W33`) a day falls in.
 *
 * This MUST agree with `isoWeekKey` in
 * `go-services/internal/discordbot/watch_summary.go` — the summarizer writes
 * rows under these keys and the page looks them up by them, so a Sunday-based
 * week here would simply find nothing for half the year. ISO: weeks start
 * Monday, and week 1 is the week containing January 4th.
 */
export function isoWeekKey(dateKey: string): string {
  const date = dateKeyToUtc(dateKey);
  // Shift to the Thursday of this week; the ISO year is whatever year that
  // Thursday lands in, which is what makes a year-straddling week one week.
  const thursday = new Date(date.getTime() + (3 - mondayIndex(dateKey)) * MS_PER_DAY);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * MS_PER_DAY);
  const week = Math.round((thursday.getTime() - jan4Monday.getTime()) / (7 * MS_PER_DAY)) + 1;
  return `${String(isoYear).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;
}

/** The Monday a day's ISO week starts on. */
export function isoWeekStartKey(dateKey: string): string {
  return shiftDateKey(dateKey, -mondayIndex(dateKey));
}

/**
 * The Monday an ISO week key starts on, or null for a malformed key.
 *
 * Round-tripping through `isoWeekKey` is what makes this a VALIDATION and not
 * just a parse: `2026-W53` is a real string and not a real week in a 52-week
 * year, and the only cheap way to know that is to build the Monday it would
 * imply and ask which week that Monday is actually in.
 */
export function isoWeekStart(weekKey: string): string | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return null;
  const [, year, week] = match;
  const weekNumber = Number(week);
  if (weekNumber < 1 || weekNumber > 53) return null;
  const jan4 = new Date(Date.UTC(Number(year), 0, 4));
  const jan4Monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * MS_PER_DAY);
  const monday = utcToDateKey(new Date(jan4Monday.getTime() + (weekNumber - 1) * 7 * MS_PER_DAY));
  return isoWeekKey(monday) === weekKey ? monday : null;
}

/** True for a well-formed key naming a week that exists. */
export function isValidWeekKey(weekKey: string): boolean {
  return isoWeekStart(weekKey) !== null;
}

/** Monday and Sunday of an ISO week, as day keys. Null for a bad key. */
export function isoWeekBounds(weekKey: string): { firstKey: string; lastKey: string } | null {
  const firstKey = isoWeekStart(weekKey);
  if (!firstKey) return null;
  return { firstKey, lastKey: shiftDateKey(firstKey, 6) };
}

/** `2026-W33` + 1 → `2026-W34`, crossing year boundaries correctly. */
export function shiftWeekKey(weekKey: string, weeks: number): string | null {
  const start = isoWeekStart(weekKey);
  if (!start) return null;
  return isoWeekKey(shiftDateKey(start, weeks * 7));
}

/** The month key (`2026-08`) a day falls in. */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** True for a well-formed `YYYY-MM` naming a real month. */
export function isValidMonthKey(monthKey: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

/** `2026-12` + 1 → `2027-01`. */
export function shiftMonthKey(monthKey: string, months: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  return utcToDateKey(shifted).slice(0, 7);
}

/** First and last day of a month key, as day keys. */
export function monthBounds(monthKey: string): { firstKey: string; lastKey: string } {
  const firstKey = `${monthKey}-01`;
  const first = dateKeyToUtc(firstKey);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { firstKey, lastKey: utcToDateKey(last) };
}

const LABEL_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let fmt = LABEL_CACHE.get(key);
  if (!fmt) {
    // `timeZone: 'UTC'` because the key IS a label — formatting it in the
    // viewer's zone would render 2026-08-11 as August 10th west of Greenwich.
    fmt = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
    LABEL_CACHE.set(key, fmt);
  }
  return fmt;
}

/** `Tuesday, August 11` */
export function formatDayLong(dateKey: string): string {
  return formatter({ weekday: 'long', month: 'long', day: 'numeric' }).format(dateKeyToUtc(dateKey));
}

/** `Aug 11` */
export function formatDayShort(dateKey: string): string {
  return formatter({ month: 'short', day: 'numeric' }).format(dateKeyToUtc(dateKey));
}

/** `August 2026` */
export function formatMonthLong(monthKey: string): string {
  return formatter({ month: 'long', year: 'numeric' }).format(dateKeyToUtc(`${monthKey}-01`));
}

/** `Aug 10 – Aug 16`, the span an ISO week key covers. */
export function formatWeekRange(weekKey: string): string {
  const bounds = isoWeekBounds(weekKey);
  if (!bounds) return weekKey;
  return `${formatDayShort(bounds.firstKey)} – ${formatDayShort(bounds.lastKey)}`;
}
