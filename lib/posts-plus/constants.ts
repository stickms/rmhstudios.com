/**
 * posts-plus (X4 X5 X8 X9 X11 Z7) — client-safe constants and helpers.
 * Nothing here touches Prisma, so components and route modules may import it.
 *
 * Deliberately zod-free: this module is on the home feed's import graph
 * (`lib/feed/timeline.ts`). The API input schemas live in `./schema`.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------ X4 · QOTD ------------------------------- */

export const MAX_QOTD_LENGTH = 280;
/** A member may post at most this many answers to one day's prompt. */
export const MAX_QOTD_ANSWERS_PER_DAY = 5;
/** How many past prompts the /qotd archive lists. */
export const QOTD_ARCHIVE_DAYS = 30;

/** YYYY-MM-DD in UTC. */
export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** True for a real calendar date (rejects 2026-02-31). */
export function isValidDayKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && utcDayKey(d) === key;
}

/* ------------------------------ X5 · series ----------------------------- */

export const MAX_SERIES_TITLE = 80;
export const MAX_SERIES_DESCRIPTION = 280;
export const MAX_SERIES_PER_USER = 50;
export const MAX_SERIES_POSTS = 200;

/** What the "Part k of N" chip needs for one post. */
export interface SeriesNav {
  series: { id: string; title: string; total: number; following: boolean; authorId: string };
  position: number;
  prev: { id: string; handle: string | null } | null;
  next: { id: string; handle: string | null } | null;
}

/* ------------------------------ X8 · expiry ----------------------------- */

export const POST_TTLS = ['1h', '24h', '7d'] as const;
export type PostTtl = (typeof POST_TTLS)[number];

const TTL_MS: Record<PostTtl, number> = { '1h': 3_600_000, '24h': DAY_MS, '7d': 7 * DAY_MS };
export function ttlToExpiry(ttl: PostTtl, now: Date = new Date()): Date {
  return new Date(now.getTime() + TTL_MS[ttl]);
}

/** Read-time rule: an expired post is invisible whether or not the sweep ran. */
export function isExpired(expiresAt: string | Date | null | undefined, now: number = Date.now()) {
  if (!expiresAt) return false;
  const t = typeof expiresAt === 'string' ? Date.parse(expiresAt) : expiresAt.getTime();
  return Number.isFinite(t) && t <= now;
}

export const AUTO_DELETE_MONTHS = [3, 6, 12, 24] as const;
export type AutoDeleteMonths = (typeof AUTO_DELETE_MONTHS)[number];

/* ------------------------------ X9 · notes ------------------------------ */

export const MAX_SAVE_NOTE = 500;

/* --------------------------- Z7 · time capsules -------------------------- */

/** A capsule must stay sealed for at least this long... */
export const MIN_CAPSULE_MS = DAY_MS;
/** ...and at most this long (ten years keeps a typo from sealing a post forever). */
export const MAX_CAPSULE_MS = 3653 * DAY_MS;

export function capsuleDateError(openAt: Date, now: Date = new Date()): string | null {
  const ms = openAt.getTime() - now.getTime();
  if (Number.isNaN(ms)) return 'Invalid date';
  if (ms < MIN_CAPSULE_MS - 60_000) return 'A time capsule must stay sealed for at least a day';
  if (ms > MAX_CAPSULE_MS) return 'A time capsule can be sealed for at most ten years';
  return null;
}

/** "12d 4h", "3h 20m", "5m" — coarse on purpose; the list re-renders once a minute. */
export function formatCountdown(openAt: string | Date, now: number = Date.now()): string {
  const t = typeof openAt === 'string' ? Date.parse(openAt) : openAt.getTime();
  const ms = Math.max(0, t - now);
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, ms > 0 ? 1 : 0)}m`;
}
