/**
 * Locale-aware date formatting for plan days (YYYY-MM-DD, treated as local).
 * Formatting in UTC with a UTC-midnight Date keeps "Thu 15 Oct" from becoming
 * "Wed 14 Oct" for anyone west of Greenwich.
 */

import { parseDay } from '@/lib/dunesday/schedule';

export function fmtDay(day: string, lang: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(lang, { timeZone: 'UTC', ...opts }).format(parseDay(day));
  } catch {
    return day;
  }
}

export const LONG: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
export const SHORT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
};
