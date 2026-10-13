/**
 * Birthdays (G1) — pure and client-safe. Month/day only, always UTC, so the
 * daily job, the profile badge and the scheduled-gift shortcut agree on "today".
 */
import { z } from 'zod';

export const birthdaySchema = z
  .object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) })
  .refine(({ month, day }) => isValidMonthDay(month, day), { message: 'Not a real date' });

export type BirthdayInput = z.infer<typeof birthdaySchema>;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidMonthDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1]!;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Feb 29 is observed on Feb 28 in years that have no Feb 29. */
export function observedDay(month: number, day: number, year: number): number {
  return month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
}

export function isBirthdayOn(month: number, day: number, now: Date): boolean {
  return (
    now.getUTCMonth() + 1 === month &&
    now.getUTCDate() === observedDay(month, day, now.getUTCFullYear())
  );
}

/** The next occurrence, today included, as 12:00 UTC (a sensible delivery time). */
export function nextBirthdayAt(month: number, day: number, now: Date): Date {
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    const at = Date.UTC(year, month - 1, observedDay(month, day, year), 12);
    if (at >= now.getTime() - 12 * 3_600_000) return new Date(at);
  }
  return new Date(Date.UTC(now.getUTCFullYear() + 1, month - 1, day, 12));
}
