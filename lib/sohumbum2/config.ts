/**
 * The constants `/sohumbum2` shares between its server and client halves.
 *
 * Client-safe on purpose: the page formats durations and picks status colours
 * with these, and the OG card and the API read the same values, so the subject
 * and the zone are defined once instead of in three files that can drift.
 */

/**
 * The tracked Discord account.
 *
 * This has to match `DISCORD_WATCH_USER_IDS` on the bot side (which defaults to
 * the same id). It is duplicated rather than shared because the two halves are
 * different runtimes — a Go worker and a Node web tier — and the page needs to
 * know whose rows to read without a round trip to the bot.
 */
export const SUBJECT_DISCORD_ID = '169194892269060096';

/** The site handle the dossier links to, matching `/sohumbum`. */
export const SUBJECT_HANDLE = 'superflameaura';

/** Fallback display name, used until the tracker has cached his real one. */
export const SUBJECT_FALLBACK_NAME = 'Sohum Joshi';

/**
 * The zone every day boundary is drawn in. Must match `DISCORD_WATCH_TIMEZONE`
 * on the bot side — the rollups are already bucketed by it, so a mismatch here
 * would mislabel rows rather than re-bucket them.
 */
export const TRACKING_TIME_ZONE = 'America/New_York';

/** How many days of history the calendar loads by default. */
export const DEFAULT_HISTORY_DAYS = 120;

/** Upper bound on a client-requested window, so one URL cannot scan the table. */
export const MAX_HISTORY_DAYS = 400;

/**
 * How often the page refetches while it is visible.
 *
 * Ten seconds: the tracker's own flush is a minute, but voice joins and messages
 * land in the database the moment they happen, and this is a page whose entire
 * premise is watching a number go up.
 */
export const LIVE_POLL_MS = 10_000;

/** Discord's status colours, used for the dot and the profile card's rail. */
export const STATUS_COLORS = {
  online: '#23a55a',
  idle: '#f0b232',
  dnd: '#f23f43',
  offline: '#80848e',
} as const;

/**
 * `4h 12m` / `38m` / `—`.
 *
 * Shared by the page, the charts and the OG card so one duration never reads
 * three ways. Zero renders as an em dash rather than "0m": an empty cell should
 * look empty.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

/** `4:12:07`, for the live counter that ticks. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** `2h ago` / `just now`. */
export function formatAgo(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/** `1,284`, with the grouping the page's locale uses. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}
