/**
 * Pure planning for "queue a playlist" and "save the queue as a playlist".
 *
 * The hub reads the playlist rows and hands them here with the room's remaining
 * capacity; this module decides which rows join the queue (in playlist order),
 * which cannot be played and how the adder is told. It does no I/O and never
 * probes a link: probing up to a hundred URLs for one click would turn the hub
 * into an outbound-request amplifier, so an item `parseMedia` cannot place is
 * skipped and counted.
 */

import { MAX_QUEUE_SIZE } from './constants';
import { parseMedia, type ParsedMedia } from './media';

/** Hard ceiling on rows read for one playlist add. */
export const PLAYLIST_FETCH_CAP = 200;
/** Extra rows read beyond the free slots, so a few unplayable rows do not leave seats empty. */
export const PLAYLIST_SKIP_ALLOWANCE = 20;
/** Most items "Save as playlist" sends (the playlist module's own cap applies if lower). */
export const SAVE_QUEUE_MAX_ITEMS = 200;

export interface PlaylistRowInput {
  url: string | null;
  title: string;
  durationMs: number | null;
  thumbnail: string | null;
}

export interface PlannedItem {
  media: ParsedMedia;
  title: string;
  /** Seconds, as the room's queue stores it; null when the playlist did not know. */
  durationSec: number | null;
  thumbnailUrl: string | null;
}

export interface PlaylistQueuePlan {
  accepted: PlannedItem[];
  /** Rows examined that could not be placed (no URL, or a link the parser rejects). */
  skipped: number;
  /** Playlist size as the adder sees it in the notice. */
  total: number;
  /** True when a playable row was left behind because the queue ran out of room. */
  full: boolean;
}

/** How many rows the hub reads for a room with `remaining` free slots. */
export function playlistFetchLimit(remaining: number): number {
  return Math.max(0, Math.min(PLAYLIST_FETCH_CAP, remaining + PLAYLIST_SKIP_ALLOWANCE));
}

export function remainingCapacity(queueLength: number, max: number = MAX_QUEUE_SIZE): number {
  return Math.max(0, max - queueLength);
}

/**
 * Which of `rows` (already in playlist order) join the queue. `itemCount` is the
 * playlist's stored size; the notice's total is never smaller than the rows read.
 */
export function planPlaylistQueue(
  rows: readonly PlaylistRowInput[],
  remaining: number,
  itemCount: number,
): PlaylistQueuePlan {
  const accepted: PlannedItem[] = [];
  let skipped = 0;
  let full = false;
  for (const row of rows) {
    const media = row.url ? parseMedia(row.url) : null;
    if (!media) {
      skipped += 1;
      continue;
    }
    if (accepted.length >= remaining) {
      full = true;
      break;
    }
    accepted.push({
      media,
      title: row.title,
      durationSec: row.durationMs !== null && row.durationMs > 0 ? Math.round(row.durationMs / 1000) : null,
      thumbnailUrl: row.thumbnail ?? media.thumbnailUrl ?? null,
    });
  }
  // A row that fills the last seat is not "left behind"; one more playable row is.
  return { accepted, skipped, total: Math.max(itemCount, rows.length), full };
}

/** What the adder is told once the hub has acted (sent to that socket only). */
export interface PlaylistQueueResult {
  added: number;
  total: number;
  skipped: number;
  full: boolean;
}

export function toResult(plan: PlaylistQueuePlan): PlaylistQueueResult {
  return {
    added: plan.accepted.length,
    total: plan.total,
    skipped: plan.skipped,
    full: plan.full,
  };
}

/** The shape of the notice, which the component turns into translated text. */
export type PlaylistNoticeKind = 'all' | 'partial-full' | 'none-playable' | 'none-full';

export function noticeKind(r: PlaylistQueueResult): PlaylistNoticeKind {
  if (r.added === 0) return r.full ? 'none-full' : 'none-playable';
  return r.full ? 'partial-full' : 'all';
}

/** A queue item reduced to what a saved playlist row stores. */
export interface QueueItemLike {
  url: string;
  title: string;
  thumbnailUrl: string | null;
  addedByName?: string | null;
  duration: number | null;
}

export interface SaveQueueRow {
  externalId: string;
  title: string;
  subtitle: string | null;
  thumbnail: string | null;
  url: string;
  durationMs: number | null;
}

/**
 * The queue as playlist rows, in queue order, at most `SAVE_QUEUE_MAX_ITEMS`.
 * The same video queued twice is one row (playlists de-dupe by `externalId`, which
 * is the URL, exactly as the per-item "Add to playlist" does).
 */
export function queueToPlaylistRows(
  queue: readonly QueueItemLike[],
  max: number = SAVE_QUEUE_MAX_ITEMS,
): SaveQueueRow[] {
  const seen = new Set<string>();
  const rows: SaveQueueRow[] = [];
  for (const item of queue) {
    if (rows.length >= max) break;
    const externalId = item.url.slice(0, 255);
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    rows.push({
      externalId,
      title: item.title.slice(0, 300) || externalId,
      subtitle: item.addedByName ?? null,
      thumbnail: item.thumbnailUrl ? item.thumbnailUrl.slice(0, 500) : null,
      url: item.url.slice(0, 1000),
      durationMs: durationSecToMs(item.duration),
    });
  }
  return rows;
}

/** Queue durations are seconds; playlist rows store milliseconds. */
export function durationSecToMs(sec: number | null | undefined): number | null {
  return sec !== null && sec !== undefined && sec > 0 ? Math.round(sec * 1000) : null;
}
