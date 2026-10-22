/**
 * Serve-time reconciliation of a CACHED signed-in timeline page.
 *
 * The signed-in first page is cached per viewer for up to 60s (15s fresh + 45s
 * stale-while-revalidate). Everything in it was true when it was assembled, and
 * a handful of those facts are permissions or moderation, which 03-rules 1.3
 * says are never stale: a block or mute, a post deleted by its author or an
 * admin, a post whose audience was tightened, an unfollow (Following surface),
 * a close-friends circle that dropped the viewer, a tag the viewer just muted.
 * Waiting out the TTL showed all of those for up to a minute.
 *
 * Rather than chase every writer of those facts (admin report actions, trash,
 * automod, circle edits, ... live in many modules), the cached page is
 * RE-CHECKED against the source of truth every time it is served, and anything
 * that no longer passes is dropped. That is one primary-key lookup of the page's
 * <= `limit` posts plus reads of caches that are already invalidated
 * synchronously (hidden authors, signals), plus a fresh follow / circle read only
 * when the page actually contains an item that depends on one. What stays
 * cached is the expensive part: ranking, hydration, reactions, display objects.
 *
 * What is NOT reconciled (staleness stays a stated product decision, <= 60s):
 * counts, liked/reposted/bookmarked bits, new posts, and rank order.
 *
 * The rules mirror the assembly queries in `timeline.ts`:
 *   For-You    PUBLIC | own | FOLLOWERS of a followed author | CIRCLE of a circle
 *              the viewer is in
 *   Following  the above, restricted to followed authors (reposter, for a repost),
 *              and without PRIVATE posts (own included)
 */

import { prisma } from '../prisma.server';
import type { FeedItem } from '../feed-types';
import { getHiddenAuthorIds } from '../moderation.server';
import { getSignals } from './signals.server';

type Surface = 'following' | 'foryou';

interface PostRow {
  id: string;
  userId: string;
  audience: string;
  deletedAt: Date | null;
  communityId: string | null;
  hashtags: { hashtag: { tag: string } }[];
  unlocks: { id: string }[];
}

export interface ReconcileResult {
  items: FeedItem[];
  /** A paywalled post on the page has since been unlocked by the viewer: the cached
   *  copy still shows it locked, so the caller should drop the cache entry and
   *  re-assemble rather than keep serving a paid-for post as locked. */
  needsRefresh: boolean;
}

export async function reconcileCachedPage(
  items: FeedItem[],
  viewerId: string,
  surface: Surface,
): Promise<ReconcileResult> {
  const posts = items.filter((i) => i.type === 'rmhark');
  if (posts.length === 0) return { items, needsRefresh: false };

  const postIds = [...new Set(posts.map((i) => i.actualId ?? i.id))];
  const [hidden, rows, signals] = await Promise.all([
    getHiddenAuthorIds(viewerId),
    prisma.rMHark.findMany({
      where: { id: { in: postIds } },
      select: {
        id: true,
        userId: true,
        audience: true,
        deletedAt: true,
        communityId: true,
        hashtags: { select: { hashtag: { select: { tag: true } } } },
        unlocks: { where: { userId: viewerId }, select: { id: true } },
      },
      take: postIds.length,
    }) as Promise<PostRow[]>,
    getSignals(viewerId),
  ]);
  const hiddenSet = new Set(hidden);
  const mutedTags = new Set(signals.mutedTags);
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Fresh follow / circle membership, only for the ids an item's visibility hangs on.
  const needFollow = new Set<string>();
  const needCircle = new Set<string>();
  for (const item of posts) {
    const row = byId.get(item.actualId ?? item.id);
    if (!row) continue;
    if (surface === 'following') needFollow.add(item.repostedBy?.id ?? row.userId);
    if (row.audience === 'FOLLOWERS' && row.userId !== viewerId) needFollow.add(row.userId);
    if (row.audience === 'CIRCLE' && row.userId !== viewerId) needCircle.add(row.userId);
  }
  const [followRows, circleRows] = await Promise.all([
    needFollow.size
      ? prisma.follow.findMany({
          where: { followerId: viewerId, followingId: { in: [...needFollow] } },
          select: { followingId: true },
          take: needFollow.size,
        })
      : [],
    needCircle.size
      ? prisma.closeFriend.findMany({
          where: { memberId: viewerId, ownerId: { in: [...needCircle] } },
          select: { ownerId: true },
          take: needCircle.size,
        })
      : [],
  ]);
  const followed = new Set(followRows.map((f) => f.followingId));
  const inCircle = new Set(circleRows.map((c) => c.ownerId));

  let needsRefresh = false;
  const kept = items.filter((item) => {
    if (item.type !== 'rmhark') return true;
    const row = byId.get(item.actualId ?? item.id);
    if (!row || row.deletedAt) return false;
    // The feed only ever holds posts outside communities (the assembly query requires
    // communityId null); one that has one now is never served from a cached page, so
    // a private community's post cannot leak through the cache.
    if (row.communityId) return false;
    if (hiddenSet.has(row.userId) || (item.repostedBy && hiddenSet.has(item.repostedBy.id))) {
      return false;
    }
    if (mutedTags.size && row.hashtags.some((h) => mutedTags.has(h.hashtag.tag))) return false;

    const own = row.userId === viewerId;
    if (surface === 'following') {
      if (!followed.has(item.repostedBy?.id ?? row.userId)) return false;
      // The Following query excludes PRIVATE top-level posts (own included).
      if (!item.repostedBy && row.audience === 'PRIVATE') return false;
    }
    switch (row.audience) {
      case 'PUBLIC':
        break;
      case 'FOLLOWERS':
        if (!own && !followed.has(row.userId)) return false;
        break;
      case 'CIRCLE':
        if (!own && !inCircle.has(row.userId)) return false;
        break;
      default: // PRIVATE (others'), SUPPORTERS (supporter set not resolved here)
        if (!own) return false;
    }
    if (item.locked && row.unlocks.length > 0) needsRefresh = true;
    return true;
  });

  return { items: kept, needsRefresh };
}
