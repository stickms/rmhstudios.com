/**
 * RMHMusic timestamped comments — pure helpers shared by the route, the server
 * helper and the panel. No I/O here so they test without a database.
 */
import { z } from 'zod';

export const COMMENT_MAX_LENGTH = 280;
/** Per user, per track. Keeps one account from papering a song. */
export const COMMENTS_PER_USER_PER_TRACK = 20;
/** A cap on what one list read returns. */
export const COMMENT_LIST_LIMIT = 300;
/** Longest position we accept: well past any track, still a sane int. */
export const MAX_POSITION_MS = 6 * 60 * 60 * 1000;

export const trackUriSchema = z.string().trim().min(1).max(256);

export const createCommentSchema = z.object({
  trackUri: trackUriSchema,
  positionMs: z.number().int().min(0).max(MAX_POSITION_MS),
  body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
});

export interface TrackCommentView {
  id: string;
  positionMs: number;
  body: string;
  author: string;
  mine: boolean;
}

/** `m:ss`, or `h:mm:ss` from an hour up. Negative and non-finite clamp to 0. */
export function formatCommentTime(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Where the player is right now: the stored position plus the time since it
 * was stamped while playing, clamped to the track length when one is known.
 */
export function currentPositionMs(
  playback: { positionMs: number; isPlaying: boolean; updatedAt: number },
  durationMs: number | null | undefined,
  now: number = Date.now(),
): number {
  const elapsed = playback.isPlaying && playback.updatedAt > 0 ? Math.max(0, now - playback.updatedAt) : 0;
  const pos = Math.max(0, playback.positionMs + elapsed);
  return durationMs && durationMs > 0 ? Math.min(pos, durationMs) : pos;
}

/** Stable order by position, then by insertion order (ids are cuids). */
export function sortByPosition<T extends { positionMs: number; id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.positionMs - b.positionMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
