/**
 * Batched, cached author-display resolution for the feed hot path.
 *
 * The feed used to join `UserProfile` + equipped `inventory` (cosmetics) onto
 * every post row via `userDisplaySelect` — post author, quoted-original author,
 * and reposter, ~40 relation fan-outs on a 20-item page, on every request.
 * That resolved display object is viewer-independent and changes only when a
 * user edits their profile or equips/unequips an item, so instead we:
 *
 *   1. select only the scalar author ids in the feed query (no user join), and
 *   2. resolve the distinct ids here — cache hit per id (60s TTL), one batched
 *      `findMany` for the misses — and hand the timeline a `Map` to look up.
 *
 * Cross-viewer shared (the same author's card is identical for everyone), so a
 * warm cache makes the per-page author cost approach zero DB work.
 */

import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { cached, invalidateCached } from '@/lib/cached.server';
import { userDisplaySelect, resolveUser, type ResolvedUser } from '@/lib/user-display';

const USER_DISPLAY_TTL_MS = 60_000;
const userDisplayKey = (id: string) => `user-display:${id}`;

/**
 * Resolve display objects for a set of author ids. Nulls/undefined/dupes are
 * ignored. Returns a `Map<userId, ResolvedUser>`; ids with no matching user
 * (e.g. hard-deleted between queries) are simply absent from the map.
 */
export async function getUserDisplayMap(
  userIds: (string | null | undefined)[],
): Promise<Map<string, ResolvedUser>> {
  const map = new Map<string, ResolvedUser>();
  const ids = [...new Set(userIds.filter((v): v is string => !!v))];
  if (ids.length === 0) return map;

  // Batch the cold path: any id absent from the in-process L1 cache is loaded in
  // ONE `findMany({ id: { in } })` here, instead of N parallel `findUnique`s
  // (perf audit §2.9 — a 20-item feed page can reference ~40 distinct authors, so
  // after each 60s TTL expiry the old code fired ~40 point queries that queued
  // 4-deep on the pool). The per-id `cached()` calls below then resolve their
  // loader from this prefetch map, so the DB is touched at most once per call.
  const l1Misses = ids.filter((id) => apiCache.get(userDisplayKey(id)) === undefined);
  const prefetched = new Map<string, ResolvedUser | null>();
  if (l1Misses.length > 0) {
    const rows = await prisma.user.findMany({
      where: { id: { in: l1Misses } },
      select: userDisplaySelect,
    });
    for (const row of rows) prefetched.set(row.id, resolveUser(row));
    for (const id of l1Misses) if (!prefetched.has(id)) prefetched.set(id, null);
  }

  // Resolve each id through the shared L1(in-process)+L2(Redis) cache. Warm L1
  // ids resolve with zero work; L1-cold ids consult L2, then fall back to the
  // batched prefetch above (no per-id DB). Routing through `cached()` keeps the
  // cross-instance invalidation subscription and L2 write-through intact.
  // Missing users (hard-deleted between queries) resolve to null and are neither
  // cached nor added to the map.
  const resolved = await Promise.all(
    ids.map((id) =>
      cached<ResolvedUser | null>(
        userDisplayKey(id),
        USER_DISPLAY_TTL_MS,
        async () => prefetched.get(id) ?? null,
        { shouldCache: (v) => v !== null },
      ),
    ),
  );

  for (let i = 0; i < ids.length; i++) {
    const r = resolved[i];
    if (r) map.set(ids[i], r);
  }

  return map;
}

/**
 * Drop the cached display object for a user. Call after they edit their profile
 * (name/avatar) or equip/unequip cosmetics so their own next feed read reflects
 * the change immediately instead of waiting out the TTL.
 */
export function invalidateUserDisplay(userId: string): void {
  // Fire-and-forget: drops the local L1 copy synchronously and broadcasts the
  // drop to every instance over Redis pub/sub. Signature stays `void` for the
  // existing fire-and-forget callers.
  void invalidateCached(userDisplayKey(userId));
}
