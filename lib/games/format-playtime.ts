/**
 * How the library words time played: "42 min" under an hour, "10.5 h" above.
 * Numbers only; the unit words are not translated here because the library shows
 * them as compact data in Geist Mono, like the rest of its stats.
 */

export function formatPlaytime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

export type LastPlayed =
  { key: 'never' } | { key: 'today' } | { key: 'yesterday' } | { key: 'days'; days: number };

const DAY_MS = 86_400_000;
const utcDayIndex = (d: Date) => Math.floor(d.getTime() / DAY_MS);

/** Which phrase to show for a last-played time; the caller translates it. */
export function formatLastPlayed(iso: string | null, now: Date = new Date()): LastPlayed {
  if (!iso) return { key: 'never' };
  const days = utcDayIndex(now) - utcDayIndex(new Date(iso));
  if (days <= 0) return { key: 'today' };
  if (days === 1) return { key: 'yesterday' };
  return { key: 'days', days };
}
