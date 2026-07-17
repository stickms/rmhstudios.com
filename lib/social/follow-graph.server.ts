/**
 * Cached reader for the viewer's follow graph (the ids they follow).
 *
 * The follow list gates the For-You audience filter, the Following feed query,
 * the SSE delivery targeting, and the sidebar recommendations — it was being
 * re-queried in each of those places on every request. It changes rarely and has
 * exact invalidation points (follow/unfollow, block), so a short in-process TTL
 * keeps it off the DB on the feed's hot path. Invalidated on mutation so the
 * acting user always sees a fresh graph on their next read.
 */

import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';

const TTL_MS = 30_000;
const key = (userId: string) => `following-ids:${userId}`;

/**
 * Cap on how many follow ids feed the `userId IN (...)` timeline/audience filter
 * (perf audit §2.8). Fan-out-on-read has no ceiling: a viewer following tens of
 * thousands of accounts otherwise ships a giant literal IN list into every feed
 * query (parse/plan/bind cost + a huge bitmap OR), and caches that array per
 * viewer. We bound it to the most-recently-followed N (index-backed by
 * follow_followerId_createdAt_idx). Well beyond any normal follow count, so it
 * only clips pathological graphs; the true fix for high-degree users is
 * fan-out-on-write timelines.
 */
const FOLLOWING_ID_CAP = 5000;

/** The ids `userId` follows (most-recent first, capped). Cached ~30s; invalidated on follow/unfollow/block. */
export async function getFollowingIds(userId: string): Promise<string[]> {
  return cached<string[]>(key(userId), TTL_MS, async () => {
    const rows = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
      orderBy: { createdAt: 'desc' },
      take: FOLLOWING_ID_CAP,
    });
    return rows.map((f) => f.followingId);
  });
}

/** Drop the cached follow list for `userId` (call after they follow/unfollow). */
export function invalidateFollowingIds(userId: string): void {
  // Fire-and-forget: drops the local L1 copy synchronously and broadcasts the
  // drop to every instance over Redis pub/sub. Signature stays `void`.
  void invalidateCached(key(userId));
}
