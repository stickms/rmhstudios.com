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

  const misses: string[] = [];
  for (const id of ids) {
    const cached = apiCache.get<ResolvedUser>(userDisplayKey(id));
    if (cached) map.set(id, cached);
    else misses.push(id);
  }

  if (misses.length > 0) {
    const rows = await prisma.user.findMany({
      where: { id: { in: misses } },
      select: userDisplaySelect,
    });
    for (const row of rows) {
      const resolved = resolveUser(row);
      apiCache.set(userDisplayKey(row.id), resolved, USER_DISPLAY_TTL_MS);
      map.set(row.id, resolved);
    }
  }

  return map;
}

/**
 * Drop the cached display object for a user. Call after they edit their profile
 * (name/avatar) or equip/unequip cosmetics so their own next feed read reflects
 * the change immediately instead of waiting out the TTL.
 */
export function invalidateUserDisplay(userId: string): void {
  apiCache.invalidate(userDisplayKey(userId));
}
