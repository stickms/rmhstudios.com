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
import { apiCache } from '@/lib/cache';

const TTL_MS = 30_000;
const key = (userId: string) => `following-ids:${userId}`;

/** The ids `userId` follows. Cached ~30s; invalidated on follow/unfollow/block. */
export async function getFollowingIds(userId: string): Promise<string[]> {
  const cached = apiCache.get<string[]>(key(userId));
  if (cached) return cached;
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const ids = rows.map((f) => f.followingId);
  apiCache.set(key(userId), ids, TTL_MS);
  return ids;
}

/** Drop the cached follow list for `userId` (call after they follow/unfollow). */
export function invalidateFollowingIds(userId: string): void {
  apiCache.invalidate(key(userId));
}
