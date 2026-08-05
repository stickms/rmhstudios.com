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
import { cachedMany, invalidateCached } from '@/lib/cached.server';
import { hashTagged } from '@/lib/redis.server';
import { userDisplaySelect, resolveUser, type ResolvedUser } from '@/lib/user-display';

const USER_DISPLAY_TTL_MS = 60_000;

/**
 * Hash-tagged (`{user-display}:<id>`) so the whole family shares one Redis
 * Cluster slot: the batched read below is an `MGET`, which a cluster only
 * answers when every key in the batch hashes to the same slot. Single instance
 * today; this is what keeps that from becoming a migration-day surprise.
 */
const userDisplayKey = (id: string) => hashTagged('user-display', id);

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

  const idByKey = new Map(ids.map((id) => [userDisplayKey(id), id]));

  // Three batched steps, in cost order: L1 for everything, ONE Redis MGET for
  // the L1 misses, ONE `findMany({ id: { in } })` for whatever neither layer
  // had (perf audit §2.9 — a 20-item feed page can reference ~40 distinct
  // authors).
  //
  // The previous shape ran a `cached()` per id inside a `Promise.all`, which
  // meant ~40 individual Redis round trips per cold page, and prefetched the
  // *L1* misses from Postgres — so every id that Redis was already holding was
  // queried from the database anyway. `cachedMany` orders the layers properly:
  // the loader below only ever sees ids that are in neither cache.
  //
  // Ids with no matching user resolve to a cached miss (short negative TTL), so
  // a hard-deleted author stops widening this `IN (…)` list on every request.
  const resolved = await cachedMany<ResolvedUser>(
    [...idByKey.keys()],
    USER_DISPLAY_TTL_MS,
    async (missingKeys) => {
      const missingIds = missingKeys.flatMap((key) => {
        const id = idByKey.get(key);
        return id ? [id] : [];
      });
      const rows = await prisma.user.findMany({
        where: { id: { in: missingIds } },
        select: userDisplaySelect,
      });
      return new Map(rows.map((row) => [userDisplayKey(row.id), resolveUser(row)]));
    },
  );

  for (const [key, id] of idByKey) {
    const user = resolved.get(key);
    if (user) map.set(id, user);
  }

  return map;
}

/**
 * Drop the cached display object for a user. Call after they edit their profile
 * (name/avatar) or equip/unequip cosmetics so their own next feed read reflects
 * the change immediately instead of waiting out the TTL.
 *
 * This also clears a cached *miss*, but no create path needs to call it for
 * that reason: the key is the user id, a `cuid()` minted by the insert itself,
 * so nothing can have looked the id up — and therefore cached its absence —
 * before the row existed. Negative entries here can only ever come from an id
 * that WAS real (a hard-deleted account still referenced by an old row), which
 * never becomes real again.
 */
export function invalidateUserDisplay(userId: string): void {
  // Fire-and-forget: drops the local L1 copy synchronously and broadcasts the
  // drop to every instance over Redis pub/sub. Signature stays `void` for the
  // existing fire-and-forget callers.
  void invalidateCached(userDisplayKey(userId));
}
