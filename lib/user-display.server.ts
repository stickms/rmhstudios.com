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

  // Resolve each id through the shared L1(in-process)+L2(Redis) cache. Warm ids
  // (the hot-path common case, and now shared across instances via L2) resolve
  // with zero DB work; only ids cold on every layer hit Postgres, as parallel
  // primary-key lookups. Routing through `cached()` also subscribes this process
  // to the invalidation channel so `invalidateUserDisplay` on any instance drops
  // our copy. Missing users (hard-deleted between queries) resolve to null and
  // are neither cached nor added to the map.
  const resolved = await Promise.all(
    ids.map((id) =>
      cached<ResolvedUser | null>(
        userDisplayKey(id),
        USER_DISPLAY_TTL_MS,
        async () => {
          const row = await prisma.user.findUnique({
            where: { id },
            select: userDisplaySelect,
          });
          return row ? resolveUser(row) : null;
        },
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
