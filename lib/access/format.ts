/**
 * Format preferences (24h clock / week start / number format) applied on top of
 * the UI locale. Pure functions over an `AccessPrefs`, so components pass in the
 * hydration-safe `useAccessPrefs()` value and tests need no DOM.
 */
import type { AccessPrefs } from '@/lib/access/prefs';

/** Intl option fragment for the clock preference; empty on `auto`. */
export function clockOptions(p: Pick<AccessPrefs, 'clock'>): { hour12?: boolean } {
  return p.clock === 'auto' ? {} : { hour12: p.clock === '12' };
}

export function formatClockTime(
  date: Date | number,
  p: Pick<AccessPrefs, 'clock'>,
  locale?: string,
) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...clockOptions(p),
  }).format(date);
}

/** 0 = Sunday … 6 = Saturday. `auto` keeps the Sunday-first grid the app already uses. */
export function weekStartDay(p: Pick<AccessPrefs, 'weekStart'>): 0 | 1 | 6 {
  return p.weekStart === '1' ? 1 : p.weekStart === '6' ? 6 : 0;
}

export function formatNumberPref(
  n: number,
  p: Pick<AccessPrefs, 'numberFormat'>,
  opts?: Intl.NumberFormatOptions,
  locale?: string,
): string {
  return new Intl.NumberFormat(p.numberFormat === 'auto' ? locale : p.numberFormat, opts).format(n);
}
