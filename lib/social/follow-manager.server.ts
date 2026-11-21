/**
 * The follow manager (/follows): list the people a member follows or is followed by, with the filters and
 * sorts the page offers, and the bulk actions it runs.
 *
 * Every write here keeps the same invariants as `applyFollow` in `./engagement.server`: the edge, both
 * denormalised counters (never below zero) and the `FollowEvent` row change in ONE transaction, and only for
 * an edge that actually existed, so the log and the counters can never disagree with the graph. Unfollows go
 * through `unfollowUser` itself (as `lib/bulk` does) so notifications, caches and webhooks stay consistent.
 *
 * `.server.ts`: never import from a component.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { removeNotification } from '@/lib/notifications.server';
import { followUser, unfollowUser } from '@/lib/social/engagement.server';
import { invalidateFollowingIds } from '@/lib/social/follow-graph.server';
import { invalidateAudience, recordFollowEvent } from '@/lib/social/follow-events.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  FOLLOW_PAGE_SIZE,
  MAX_BULK_IDS,
  UNDO_WINDOW_MS,
  cleanIds,
  decodeFollowCursor,
  encodeFollowCursor,
  escapeLike,
  inactiveCutoff,
  normalizeSearch,
  type BulkResult,
  type FollowFilter,
  type FollowPage,
  type FollowRowData,
  type FollowSort,
  type FollowTab,
} from '@/lib/social/follow-filters';

export interface ListFollowsOptions {
  tab: FollowTab;
  filter: FollowFilter;
  q: string;
  sort: FollowSort;
  cursor?: string | null | undefined;
}

interface EdgeRow {
  edgeId: string;
  followedAt: Date;
  userId: string;
  sortKey: Date | string;
  lastActive: Date | null;
  reverse: boolean;
}

/** The sort key as the cursor stores it: an ISO time, or the lowercased display name. */
function keyToString(key: Date | string): string {
  return key instanceof Date ? key.toISOString() : key;
}

/**
 * One page of a member's following or followers, keyset-paginated on `(sort key, edge id)`.
 *
 * "Last active" is the later of the person's latest public post and latest comment on a public post, read with two index
 * probes per emitted row (`rmheet(userId, createdAt)`, `rmheet_comment(userId, createdAt)`), so it is one
 * query per page. The inactive filter is a `NOT EXISTS` over the same two indexes.
 */
export async function listFollows(userId: string, opts: ListFollowsOptions): Promise<FollowPage> {
  const { tab, filter, sort } = opts;
  const q = normalizeSearch(opts.q);
  const cursor = decodeFollowCursor(opts.cursor);

  const selfCol = tab === 'following' ? Prisma.sql`f."followerId"` : Prisma.sql`f."followingId"`;
  const otherCol = tab === 'following' ? Prisma.sql`f."followingId"` : Prisma.sql`f."followerId"`;
  // The reverse edge: on Following, do they follow me; on Followers, do I follow them.
  const reverse =
    tab === 'following'
      ? Prisma.sql`EXISTS (SELECT 1 FROM follow r WHERE r."followerId" = u.id AND r."followingId" = ${userId})`
      : Prisma.sql`EXISTS (SELECT 1 FROM follow r WHERE r."followerId" = ${userId} AND r."followingId" = u.id)`;

  const cutoff = inactiveCutoff().toISOString();
  const postsSince = Prisma.sql`EXISTS (SELECT 1 FROM rmheet p WHERE p."userId" = u.id AND p."deletedAt" IS NULL AND p.audience = 'PUBLIC' AND p."communityId" IS NULL AND p."createdAt" >= ${cutoff}::timestamp)`;
  // A comment counts only when the post it sits on is itself publicly visible: a comment on a private,
  // followers-only, community or deleted post would otherwise leak that activity through "last active".
  const commentsSince = Prisma.sql`EXISTS (SELECT 1 FROM rmheet_comment c JOIN rmheet cp ON cp.id = c."rmheetId" WHERE c."userId" = u.id AND c."deletedAt" IS NULL AND cp."deletedAt" IS NULL AND cp.audience = 'PUBLIC' AND cp."communityId" IS NULL AND c."createdAt" >= ${cutoff}::timestamp)`;

  const lastActive = Prisma.sql`GREATEST(
    (SELECT max(p2."createdAt") FROM rmheet p2 WHERE p2."userId" = u.id AND p2."deletedAt" IS NULL AND p2.audience = 'PUBLIC' AND p2."communityId" IS NULL),
    (SELECT max(c2."createdAt") FROM rmheet_comment c2 JOIN rmheet cp2 ON cp2.id = c2."rmheetId" WHERE c2."userId" = u.id AND c2."deletedAt" IS NULL AND cp2."deletedAt" IS NULL AND cp2.audience = 'PUBLIC' AND cp2."communityId" IS NULL))`;

  const sortKey =
    sort === 'name'
      ? Prisma.sql`lower(coalesce(p."displayName", u.name, u.handle, ''))`
      : sort === 'active'
        ? Prisma.sql`coalesce(${lastActive}, 'epoch'::timestamp)`
        : Prisma.sql`f."createdAt"`;

  const search = q
    ? Prisma.sql`AND (u.name ILIKE ${`%${escapeLike(q)}%`} ESCAPE '\\' OR u.handle ILIKE ${`%${escapeLike(q)}%`} ESCAPE '\\' OR u.username ILIKE ${`%${escapeLike(q)}%`} ESCAPE '\\' OR p."displayName" ILIKE ${`%${escapeLike(q)}%`} ESCAPE '\\')`
    : Prisma.empty;
  const filterSql =
    filter === 'not-mutual'
      ? Prisma.sql`AND NOT ${reverse}`
      : filter === 'inactive'
        ? Prisma.sql`AND NOT ${postsSince} AND NOT ${commentsSince}`
        : Prisma.empty;

  // Name sorts ascending; the two time sorts newest first.
  const ascending = sort === 'name';
  const keyType = sort === 'name' ? Prisma.sql`::text` : Prisma.sql`::timestamp`;
  const keyset = cursor
    ? ascending
      ? Prisma.sql`WHERE ("sortKey", "edgeId") > (${cursor.k}${keyType}, ${cursor.id})`
      : Prisma.sql`WHERE ("sortKey", "edgeId") < (${cursor.k}${keyType}, ${cursor.id})`
    : Prisma.empty;
  const order = ascending
    ? Prisma.sql`ORDER BY "sortKey" ASC, "edgeId" ASC`
    : Prisma.sql`ORDER BY "sortKey" DESC, "edgeId" DESC`;

  const edges = await prisma.$queryRaw<EdgeRow[]>`
    SELECT * FROM (
      SELECT f.id AS "edgeId", f."createdAt" AS "followedAt", u.id AS "userId",
             ${sortKey} AS "sortKey", ${lastActive} AS "lastActive", ${reverse} AS "reverse"
      FROM follow f
      JOIN "user" u ON u.id = ${otherCol}
      LEFT JOIN user_profile p ON p."userId" = u.id
      WHERE ${selfCol} = ${userId} ${search} ${filterSql}
    ) page
    ${keyset}
    ${order}
    LIMIT ${FOLLOW_PAGE_SIZE + 1}`;

  const hasMore = edges.length > FOLLOW_PAGE_SIZE;
  const pageEdges = hasMore ? edges.slice(0, FOLLOW_PAGE_SIZE) : edges;

  const [users, me] = await Promise.all([
    pageEdges.length
      ? prisma.user.findMany({
          where: { id: { in: pageEdges.map((e) => e.userId) } },
          select: userDisplaySelect,
        })
      : Promise.resolve([]),
    prisma.user.findUnique({
      where: { id: userId },
      select: { followerCount: true, followingCount: true },
    }),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));

  const rows: FollowRowData[] = [];
  for (const edge of pageEdges) {
    const user = byId.get(edge.userId);
    if (!user) continue;
    const resolved = resolveUser(user);
    rows.push({
      id: resolved.id,
      name: resolved.name,
      image: resolved.image,
      handle: resolved.handle,
      username: resolved.username,
      isVerified: resolved.isVerified,
      followsYou: tab === 'followers' ? true : edge.reverse,
      youFollow: tab === 'following' ? true : edge.reverse,
      followedAt: edge.followedAt.toISOString(),
      lastActive: edge.lastActive ? edge.lastActive.toISOString() : null,
    });
  }

  const last = pageEdges[pageEdges.length - 1];
  return {
    rows,
    nextCursor:
      hasMore && last ? encodeFollowCursor({ k: keyToString(last.sortKey), id: last.edgeId }) : null,
    counts: { following: me?.followingCount ?? 0, followers: me?.followerCount ?? 0 },
  };
}

/**
 * Remove `followerId` from `userId`'s followers: delete their follow of the member and nothing else. They
 * are not blocked, are not told, and may follow again. Returns whether an edge was actually deleted.
 *
 * The delete is scoped to `followingId = userId`, so a member can only ever remove their own followers.
 */
export async function removeFollower(userId: string, followerId: string): Promise<boolean> {
  if (userId === followerId) return false;
  const removed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.follow.deleteMany({ where: { followerId, followingId: userId } });
    if (count === 0) return false;
    await tx.user.updateMany({
      where: { id: userId, followerCount: { gt: 0 } },
      data: { followerCount: { decrement: 1 } },
    });
    await tx.user.updateMany({
      where: { id: followerId, followingCount: { gt: 0 } },
      data: { followingCount: { decrement: 1 } },
    });
    await recordFollowEvent(tx, { followerId, followingId: userId, kind: 'removed' });
    return true;
  });
  if (!removed) return false;
  invalidateFollowingIds(followerId);
  invalidateAudience(userId);
  // Take back the "followed you" notification, as an unfollow does. Nobody is sent anything new.
  void removeNotification({
    userId,
    actorId: followerId,
    type: 'FOLLOW',
    entityType: 'user',
    entityId: followerId,
  });
  return true;
}

/** Of `ids`, the ones that `where` currently matches in the follow table (the rest are skipped). */
async function currentEdges(
  where: Prisma.FollowWhereInput,
  pick: 'followerId' | 'followingId',
): Promise<Set<string>> {
  const rows = await prisma.follow.findMany({ where, select: { [pick]: true } });
  return new Set(rows.map((r) => r[pick]));
}

function capIds(ids: readonly string[]): string[] {
  const clean = cleanIds(ids);
  if (clean.length > MAX_BULK_IDS) throw new RangeError(`at most ${MAX_BULK_IDS} ids per request`);
  return clean;
}

/**
 * Unfollow each of `ids`, one at a time through `unfollowUser`. Ids the member does not currently follow are
 * skipped and counted.
 */
export async function bulkUnfollow(userId: string, ids: readonly string[]): Promise<BulkResult> {
  const wanted = capIds(ids);
  const current = await currentEdges({ followerId: userId, followingId: { in: wanted } }, 'followingId');
  let done = 0;
  for (const followingId of wanted) {
    if (!current.has(followingId)) continue;
    const result = await unfollowUser({ followerId: userId, followingId });
    if (result.ok && !result.following) done += 1;
  }
  return { done, skipped: wanted.length - done };
}

/** Remove each of `ids` from the member's followers. Ids that do not follow the member are skipped and counted. */
export async function bulkRemoveFollowers(userId: string, ids: readonly string[]): Promise<BulkResult> {
  const wanted = capIds(ids);
  const current = await currentEdges({ followingId: userId, followerId: { in: wanted } }, 'followerId');
  let done = 0;
  for (const followerId of wanted) {
    if (!current.has(followerId)) continue;
    if (await removeFollower(userId, followerId)) done += 1;
  }
  return { done, skipped: wanted.length - done };
}

/**
 * Undo an unfollow: follow again WITHOUT a new follow notification. Only honoured when the member really
 * unfollowed that account within {@link UNDO_WINDOW_MS}, so it cannot be used to follow people silently.
 */
export async function undoUnfollow(userId: string, followingId: string): Promise<boolean> {
  const recent = await prisma.followEvent.findFirst({
    where: {
      followerId: userId,
      followingId,
      kind: 'unfollow',
      createdAt: { gte: new Date(Date.now() - UNDO_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (!recent) return false;
  // A block placed since the unfollow, in either direction, ends the right to undo it.
  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: followingId },
        { blockerId: followingId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  if (blocked) return false;
  const result = await followUser({ followerId: userId, followingId, notify: false });
  return result.ok && result.following;
}
