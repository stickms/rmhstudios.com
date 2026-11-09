/** Formatters with the unit in the NAME — never an ambiguous `formatTime`. */

/** `m:ss` from seconds (floored, negatives clamp to 0). `hours: true` → `h:mm:ss` once past an hour. */
export function formatClockSeconds(seconds: number, opts: { hours?: boolean } = {}): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (opts.hours) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}:${pad(m)}:${pad(s % 60)}`;
    return `${m}:${pad(s % 60)}`;
  }
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Short duration from milliseconds, rounded to the second: `42s` / `3m 7s`. */
export function formatDurationMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Compact count (`1.2K`, `3.4M`) via Intl; `locale` defaults to the runtime's. */
export function formatCompact(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
