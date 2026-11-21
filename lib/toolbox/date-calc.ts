/**
 * Calendar-date arithmetic on plain dates (`YYYY-MM-DD`), with no time of day
 * and no time zone, so a daylight-saving change can never turn a day into 23
 * or 25 hours. Every date is held as a day number (days since 1970-01-01).
 */

export interface PlainDate {
  year: number;
  month: number;
  day: number;
}

export function parsePlainDate(s: string): PlainDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > daysInMonth(date.year, date.month)) return null;
  return date;
}

export function formatPlainDate(d: PlainDate): string {
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toDayNumber(d: PlainDate): number {
  return Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);
}

export function fromDayNumber(n: number): PlainDate {
  const date = new Date(n * 86_400_000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(d: PlainDate): number {
  return new Date(toDayNumber(d) * 86_400_000).getUTCDay();
}

/**
 * Whole years, months and days from `a` to `b` (b ≥ a), counted the way people
 * do: 31 January to 28 February is 28 days, not "0 months", and 31 January to
 * 1 March is 1 month and 1 day.
 */
export function calendarDifference(a: PlainDate, b: PlainDate): { years: number; months: number; days: number } {
  let years = b.year - a.year;
  let months = b.month - a.month;
  let days = b.day - a.day;
  if (days < 0) {
    months--;
    // Borrow the length of the month before b's month.
    const prevMonth = b.month === 1 ? 12 : b.month - 1;
    const prevYear = b.month === 1 ? b.year - 1 : b.year;
    days += daysInMonth(prevYear, prevMonth);
    if (days < 0) days = b.day;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, days };
}

/** Monday-to-Friday days from `a` up to but not including `b` (b ≥ a). */
export function businessDaysBetween(a: PlainDate, b: PlainDate): number {
  const start = toDayNumber(a);
  const end = toDayNumber(b);
  const total = end - start;
  const weeks = Math.floor(total / 7);
  let count = weeks * 5;
  // Day 0 (1970-01-01) was a Thursday, so weekday(n) = (n + 4) mod 7.
  for (let n = start + weeks * 7; n < end; n++) {
    const w = (((n + 4) % 7) + 7) % 7;
    if (w !== 0 && w !== 6) count++;
  }
  return count;
}

export interface DateDifference {
  /** Signed: negative when the end is before the start. */
  totalDays: number;
  weeks: number;
  remainderDays: number;
  calendar: { years: number; months: number; days: number };
  businessDays: number;
}

export function differenceBetween(start: PlainDate, end: PlainDate, inclusive = false): DateDifference {
  const forward = toDayNumber(end) >= toDayNumber(start);
  const [a, b] = forward ? [start, end] : [end, start];
  const bEnd = inclusive ? fromDayNumber(toDayNumber(b) + 1) : b;
  const days = toDayNumber(bEnd) - toDayNumber(a);
  const sign = forward ? 1 : -1;
  return {
    totalDays: sign * days,
    weeks: Math.floor(days / 7),
    remainderDays: days % 7,
    calendar: calendarDifference(a, bEnd),
    businessDays: sign * businessDaysBetween(a, bEnd),
  };
}

/**
 * Add years, months, weeks and days (any may be negative). Months move first
 * and clamp to the month's end, as calendars do: 31 January + 1 month is 28 or
 * 29 February, not 3 March.
 */
export function addToDate(
  d: PlainDate,
  delta: { years?: number; months?: number; weeks?: number; days?: number },
): PlainDate {
  const totalMonths = d.year * 12 + (d.month - 1) + (delta.years ?? 0) * 12 + (delta.months ?? 0);
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths - year * 12 + 1;
  const day = Math.min(d.day, daysInMonth(year, month));
  return fromDayNumber(toDayNumber({ year, month, day }) + (delta.weeks ?? 0) * 7 + (delta.days ?? 0));
}

/** Move by `n` Monday-to-Friday days; a weekend start counts from the next working day. */
export function addBusinessDays(d: PlainDate, n: number): PlainDate {
  let day = toDayNumber(d);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    day += step;
    const w = (((day + 4) % 7) + 7) % 7;
    if (w !== 0 && w !== 6) left--;
  }
  return fromDayNumber(day);
}
