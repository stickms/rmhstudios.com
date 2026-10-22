/**
 * Moderation read helpers shared across feed/profile queries.
 */

import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';

const HIDDEN_TTL_MS = 30_000;
const hiddenKey = (userId: string) => `hidden-authors:${userId}`;
const blockedKey = (userId: string) => `blocked-authors:${userId}`;

/**
 * Author ids whose content should be hidden from `userId`'s feed: people they
 * blocked, people they muted, and people who blocked them (so a blocker also
 * disappears from the blocked user's timeline). Returns [] for anonymous users.
 *
 * Runs three queries (blocks, mutes, blocked-by) on every feed read, so the
 * result is cached ~30s and invalidated on block/mute mutations. The acting user
 * always sees fresh state on their next read via `invalidateHiddenAuthors`.
 */
export async function getHiddenAuthorIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  try {
    return await cached<string[]>(hiddenKey(userId), HIDDEN_TTL_MS, async () => {
      const [blocked, muted, blockedBy] = await Promise.all([
        prisma.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
        prisma.userMute.findMany({ where: { muterId: userId }, select: { mutedId: true } }),
        prisma.userBlock.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
      ]);
      const ids = new Set<string>();
      for (const b of blocked) ids.add(b.blockedId);
      for (const m of muted) ids.add(m.mutedId);
      for (const b of blockedBy) ids.add(b.blockerId);
      return [...ids];
    });
  } catch (err) {
    console.error('[moderation] getHiddenAuthorIds failed:', err);
    return [];
  }
}

/**
 * Author ids `userId` may not READ at all: people they blocked and people who
 * blocked them. This is the access-control subset of `getHiddenAuthorIds` (which
 * also holds mutes): a mute only filters feeds, it never makes a post unreadable
 * by id, so every "may this viewer open/engage with this post" check uses this
 * set and feeds keep using the wider hidden set. Cached ~30s, invalidated with
 * the hidden set. Returns [] for anonymous users; a failed lookup throws.
 */
export async function getBlockedAuthorIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  // No catch-and-return-[] here, unlike getHiddenAuthorIds: this set is access
  // control, and "no blocks" on a failed lookup would let a blocked viewer read
  // the post. A failure fails the request instead.
  return cached<string[]>(blockedKey(userId), HIDDEN_TTL_MS, async () => {
    const [blocked, blockedBy] = await Promise.all([
      prisma.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      prisma.userBlock.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
    ]);
    const ids = new Set<string>();
    for (const b of blocked) ids.add(b.blockedId);
    for (const b of blockedBy) ids.add(b.blockerId);
    return [...ids];
  });
}

/**
 * Drop the cached hidden-author set for a user (call after they block/mute or
 * are blocked). A block affects BOTH users' hidden sets, so invalidate both.
 */
export function invalidateHiddenAuthors(...userIds: string[]): void {
  // Fire-and-forget per id: drops each local L1 copy synchronously and
  // broadcasts the drop to every instance over Redis pub/sub so a block hides
  // content cross-instance immediately. Signature stays `void`.
  for (const id of userIds) {
    void invalidateCached(hiddenKey(id));
    void invalidateCached(blockedKey(id));
  }
}
