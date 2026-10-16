/**
 * "You're all caught up" (X7) — pure helpers. Client-safe.
 *
 * The marker is one ISO timestamp per member per browser: the newest post the
 * feed had loaded when the member last left it. It is written when the tab is
 * hidden or closed (not on every scroll, not on mount), and read once when the
 * feed mounts. Cross-device sync is deliberately out of scope — a per-viewer
 * convenience, kept in localStorage, costs the server nothing on the hottest
 * read path on the site.
 */

import type { FeedItem } from '@/lib/feed-types';

const KEY_PREFIX = 'rmh:feed:seen-through:v1:';

export function caughtUpKey(userId: string | null | undefined): string {
  return `${KEY_PREFIX}${userId ?? 'anon'}`;
}

/** Items that count as a real, server-confirmed post (no optimistic or pinned-in rows). */
function isSettled(item: FeedItem): boolean {
  return item.type === 'rmhark' && !item.pending && !item.id.startsWith('temp-');
}

/** Newest `createdAt` among settled posts, as an ISO string; null if none. */
export function newestSeen(items: readonly FeedItem[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const item of items) {
    if (!isSettled(item)) continue;
    const ms = Date.parse(item.createdAt);
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      best = item.createdAt;
    }
  }
  return best;
}

/**
 * The id of the first item that belongs to the previous session, provided at
 * least one newer item sits above it — the divider is drawn immediately before
 * that item. Null when there is nothing new, nothing old on screen yet, or no
 * previous session.
 */
export function caughtUpBoundary(
  items: readonly FeedItem[],
  seenThrough: string | null,
): string | null {
  if (!seenThrough) return null;
  const seenMs = Date.parse(seenThrough);
  if (!Number.isFinite(seenMs)) return null;
  let sawNew = false;
  for (const item of items) {
    if (!isSettled(item)) continue;
    const ms = Date.parse(item.createdAt);
    if (!Number.isFinite(ms)) continue;
    if (ms > seenMs) sawNew = true;
    else if (sawNew) return item.id;
  }
  return null;
}
