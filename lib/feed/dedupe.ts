/**
 * Feed repost de-duplication — pure, no I/O.
 *
 * Split out of `timeline.ts` (which pulls in Prisma) so the logic can be unit
 * tested and reused without a database, following the same pure/`.server` split
 * used by `signals.ts` / `signals.server.ts`.
 */

import type { FeedItem } from '../feed-types';

/**
 * Drop a repost when the post it points at already appears within the last
 * `windowSize` emitted items, so a burst of reposts of the same post doesn't
 * stack up in the feed. Non-reposts are never dropped.
 *
 * `windowSize: 0` means "compare against nothing", i.e. keep every repost. The
 * previous implementation read the window with `result.slice(-windowSize)`,
 * and because `-0 === 0`, `slice(-0)` returns the WHOLE array — so a zero
 * window silently meant "compare against everything", the exact opposite. No
 * caller passes 0 (both feed surfaces use the default), so this only ever
 * changes behaviour for a value that never reaches it.
 */
export function deduplicateReposts(items: FeedItem[], windowSize = 2): FeedItem[] {
  const result: FeedItem[] = [];
  for (const item of items) {
    if (item.repostedBy) {
      const underlyingId = item.actualId ?? item.id;
      // Walk the trailing window in place. This used to `slice(-windowSize)`
      // and `map` it to ids on every repost — two throwaway arrays per item to
      // look at (by default) two entries.
      let seenRecently = false;
      for (let i = Math.max(0, result.length - windowSize); i < result.length; i++) {
        const prev = result[i];
        if ((prev.actualId ?? prev.id) === underlyingId) {
          seenRecently = true;
          break;
        }
      }
      if (seenRecently) continue;
    }
    result.push(item);
  }
  return result;
}
