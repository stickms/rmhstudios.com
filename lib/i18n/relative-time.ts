/**
 * "3 days ago" / "in 2 hours", in the viewer's own locale.
 *
 * `Intl.RelativeTimeFormat` instead of date-fns' `formatDistanceToNow`, whose
 * English output would otherwise land inside an already-translated sentence
 * ("bearbeitet 3 days ago"). Pure, so pages and components can share it.
 */
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

export function formatRelativeTime(at: Date | string | number, locale: string, now = Date.now()): string {
  const seconds = Math.round((new Date(at).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale || 'en', { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(seconds, 'second');
}
