import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compact count formatting: 1500 → "1.5K", 2_000_000 → "2.0M".
 * Returns "0" for zero (use a falsy guard at the call site to hide zero counts).
 */
export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

/**
 * Short relative time without an "ago" suffix: "5s", "3m", "2h", "4d", "6mo", "1y".
 * Used in dense feed/comment UIs.
 */
/**
 * Short relative time against an EXPLICIT `now` — "5s", "3h", "2d", "4mo".
 *
 * The `now` parameter is the point. `timeAgoShort` below reads `Date.now()` at
 * render, so the string the server produces and the string the client hydrates
 * with can differ by a tick; `components/ui/RelativeTime` exists to fix that by
 * rendering a deterministic fallback first and only formatting once a clock is
 * available after mount. A formatter it can drive has to take the clock as an
 * argument.
 *
 * Pass this to `<RelativeTime format={relativeTimeShort} />` rather than
 * computing a relative string inline. The feed's two card renderers each had
 * their own copy of this function and the copies disagreed — the wheel card
 * stopped at weeks ("5w") where the column card rolled over to months ("1mo"),
 * so one post read as two different ages depending on which surface you were
 * looking at.
 */
export function relativeTimeShort(timestampMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

/**
 * @deprecated Reads `Date.now()` at render, so it cannot be hydration-safe.
 * Use `relativeTimeShort` through `<RelativeTime/>`.
 */
export function timeAgoShort(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}y`
}

/**
 * Relative time from an epoch-ms timestamp, falling back to a short calendar
 * date (e.g. "Mar 5") once it's older than a day. Used in moderation lists.
 */
export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
