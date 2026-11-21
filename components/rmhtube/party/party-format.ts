/** Time formatting for the watch-party views: the viewer's zone and locale, computed when the view renders. */
import { relativeStart } from '@/lib/rmhtube/parties';

/** The party's time in the viewer's own zone and locale (`Intl` defaults to both). */
export function formatPartyTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** "in 2 hours", "tomorrow", "5 minutes ago". Not a ticking timer: it is read once per render. */
export function formatRelativeStart(iso: string, nowMs: number, locale: string): string {
  const { value, unit } = relativeStart(Date.parse(iso), nowMs);
  try {
    return new Intl.RelativeTimeFormat(locale, {
      numeric: 'auto',
    }).format(value, unit);
  } catch {
    return '';
  }
}

/** `YYYY-MM-DDTHH:mm` in the viewer's zone, for a `datetime-local` input. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}
