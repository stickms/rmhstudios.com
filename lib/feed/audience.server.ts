/**
 * Post-audience visibility helpers.
 *
 * A post is visible to a viewer when it's PUBLIC, the viewer is the author,
 * it's FOLLOWERS-only and the viewer follows the author, or it's SUPPORTERS-only
 * (Creator Studio, §3) and the viewer holds an active membership of the author.
 */

import { prisma } from '@/lib/prisma.server';
import { getBlockedAuthorIds, getHiddenAuthorIds } from '@/lib/moderation.server';

/**
 * A Prisma `where` fragment restricting rMHark queries to what `viewerId` may
 * see. `supportedCreatorIds` is the set of authors the viewer currently
 * supports (active CreatorMembership) — pass it to reveal SUPPORTERS-only posts
 * from those authors. When omitted, supporters-only posts are simply hidden
 * (never leaked), which is the safe default for callers that haven't resolved
 * the supporter set.
 */
export function audienceWhere(
  viewerId: string | null,
  followingIds: string[],
  supportedCreatorIds: string[] = [],
  circleOwnerIds: string[] = [],
) {
  if (!viewerId) return { audience: 'PUBLIC' as const };
  return {
    OR: [
      { audience: 'PUBLIC' as const },
      { userId: viewerId },
      { audience: 'FOLLOWERS' as const, userId: { in: followingIds } },
      { audience: 'SUPPORTERS' as const, userId: { in: supportedCreatorIds } },
      // CIRCLE (§11): visible to members of the author's close-friends circle.
      { audience: 'CIRCLE' as const, userId: { in: circleOwnerIds } },
    ],
  };
}

/**
 * The EXACT audience rule as a relation predicate, for reads that reach a post
 * whose author is arbitrary (bookmarks, saves, threads, profile likes/reposts,
 * quotes, the repost gate). `audienceWhere` takes id lists, which forces a cap on
 * the follow list (`getFollowingIds` keeps 5,000) and a pre-resolved supporter
 * set; this form asks the database about the viewer's real rows instead, so it
 * answers exactly what `canViewPost` answers: PUBLIC, own, FOLLOWERS the viewer
 * follows (any follow, however old), SUPPORTERS of an author the viewer holds an
 * unexpired membership of, CIRCLE of an author whose circle the viewer is in.
 * Nothing is bound as a parameter, so a 2,000-follow viewer costs what a
 * 2-follow viewer does. Timeline assembly keeps using `audienceWhere` with the
 * capped list, deliberately: that is bounded fan-out, not visibility.
 */
export function audienceWhereExact(viewerId: string | null) {
  if (!viewerId) return { audience: 'PUBLIC' as const };
  return {
    OR: [
      { audience: 'PUBLIC' as const },
      { userId: viewerId },
      { audience: 'FOLLOWERS' as const, user: { followers: { some: { followerId: viewerId } } } },
      {
        audience: 'SUPPORTERS' as const,
        user: {
          creatorMemberships: { some: { supporterId: viewerId, expiresAt: { gt: new Date() } } },
        },
      },
      { audience: 'CIRCLE' as const, user: { closeFriendsOwned: { some: { memberId: viewerId } } } },
    ],
  };
}

/**
 * Posts in a PRIVATE community are members-only (WS4's rule, `requireReadable`:
 * any role in `community_member`). This is the `where` fragment for "not a post
 * the viewer is locked out of": posts outside any community and posts in a public
 * community pass; a private community's posts pass only for its members.
 * `isNot` on the optional relation also matches posts with no community, so no
 * `communityId IS NULL OR ...` is needed (and no `OR` key to collide with the
 * audience / keyset `OR`). Anonymous viewers are members of nothing.
 *
 * Feeds that already require `communityId: null` (the timeline, lists) do not
 * need it; every read that can reach a community post does.
 */
export function communityVisibleWhere(viewerId: string | null) {
  return {
    community: {
      isNot: {
        isPrivate: true,
        ...(viewerId ? { members: { none: { userId: viewerId } } } : {}),
      },
    },
  };
}

/** Whether `viewerId` may see posts of this community (membership of a private one). */
async function communityReadable(communityId: string | null, viewerId: string | null): Promise<boolean> {
  if (!communityId) return true;
  const c = await prisma.community.findUnique({
    where: { id: communityId },
    select: {
      isPrivate: true,
      members: viewerId ? { where: { userId: viewerId }, select: { id: true }, take: 1 } : false,
    },
  });
  if (!c) return false;
  return !c.isPrivate || (c.members?.length ?? 0) > 0;
}

/** Active-creator ids the viewer currently supports (for `audienceWhere`). */
export async function supportedCreatorIds(viewerId: string | null): Promise<string[]> {
  if (!viewerId) return [];
  const rows = await prisma.creatorMembership.findMany({
    where: { supporterId: viewerId, expiresAt: { gt: new Date() } },
    select: { creatorId: true },
  });
  return rows.map((r) => r.creatorId);
}

/** Owner ids whose close-friends circle the viewer is in (for `audienceWhere`). */
export async function circleOwnerIds(viewerId: string | null): Promise<string[]> {
  if (!viewerId) return [];
  const rows = await prisma.closeFriend.findMany({
    where: { memberId: viewerId },
    select: { ownerId: true },
  });
  return rows.map((r) => r.ownerId);
}

/**
 * The `where` fragment for "the post behind this row, as `viewerId` may see it".
 *
 * For reads that reach a post through another row - a profile's reposts, a
 * profile's likes, a bookmark, a thread - where the post's author is arbitrary,
 * so visibility has to be checked in full and must agree with `canViewPost` /
 * `canReadThread`: not deleted, the exact audience rules (`audienceWhereExact`),
 * private-community membership, and not by an author the viewer BLOCKED or was
 * blocked by. Mutes are deliberately not here: a mute only filters feeds, it
 * does not make a post unreadable. Nest it under the relation:
 * `{ rmhark: await viewerVisiblePostWhere(viewerId) }`.
 *
 * FEEDS (community feed, hall of fame, list timeline) pass `{ hideMuted: true }`:
 * they also drop muted authors, as every other feed does. Reads by id never do.
 *
 * Costs the viewer's cached block set (an in-process hit when warm); the
 * follow / supporter / circle checks run inside the one query. Anonymous
 * viewers cost nothing.
 */
export async function viewerVisiblePostWhere(
  viewerId: string | null,
  opts: { hideMuted?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (!viewerId) {
    return { deletedAt: null, audience: 'PUBLIC' as const, ...communityVisibleWhere(null) };
  }
  const excluded = opts.hideMuted
    ? await getHiddenAuthorIds(viewerId)
    : await getBlockedAuthorIds(viewerId);
  return {
    deletedAt: null,
    ...audienceWhereExact(viewerId),
    ...communityVisibleWhere(viewerId),
    ...(excluded.length ? { userId: { notIn: excluded } } : {}),
  };
}

/** Whether a single post is visible to a viewer (used on the post-detail route). */
export async function canViewPost(
  post: {
    userId: string;
    audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'SUPPORTERS' | 'CIRCLE';
    /** Required so no caller can forget the private-community rule. */
    communityId: string | null;
  },
  viewerId: string | null,
): Promise<boolean> {
  // Private-community posts are members-only, whatever the post's own audience.
  // (Zero cost for the ordinary post: communityId is null.)
  if (!(await communityReadable(post.communityId, viewerId))) return false;
  if (post.audience === 'PUBLIC') return true;
  if (!viewerId) return false;
  if (post.userId === viewerId) return true;
  if (post.audience === 'PRIVATE') return false;
  if (post.audience === 'CIRCLE') {
    const member = await prisma.closeFriend.findUnique({
      where: { ownerId_memberId: { ownerId: post.userId, memberId: viewerId } },
      select: { ownerId: true },
    });
    return !!member;
  }
  if (post.audience === 'SUPPORTERS') {
    // Active membership of the author (any tier).
    const membership = await prisma.creatorMembership.findUnique({
      where: { creatorId_supporterId: { creatorId: post.userId, supporterId: viewerId } },
      select: { expiresAt: true },
    });
    return !!membership && membership.expiresAt > new Date();
  }
  // FOLLOWERS — viewer must follow the author.
  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: post.userId } },
    select: { id: true },
  });
  return !!follow;
}

/** The post fields that decide whether its comments may be read. */
export interface ThreadPost {
  userId: string;
  audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'SUPPORTERS' | 'CIRCLE';
  deletedAt: Date | null;
  communityId: string | null;
}

/**
 * May `viewerId` read the comments of this post? Same rule as the timeline,
 * reposts and the profile tabs (not deleted, audience, not by a blocked author),
 * evaluated per post so SUPPORTERS-only posts keep working for their supporters.
 * Every comment read goes through here: a comment endpoint reached by post or
 * comment id used to answer for any post, so a PRIVATE post's thread, commenter
 * identities and likers were readable by anyone who had (or guessed) an id.
 *
 * Costs nothing extra for a PUBLIC post (the blocked-author set is an in-process
 * cache hit); one targeted read for FOLLOWERS / CIRCLE / SUPPORTERS.
 */
export async function canReadThread(post: ThreadPost | null, viewerId: string | null): Promise<boolean> {
  if (!post || post.deletedAt) return false;
  if (viewerId && viewerId !== post.userId) {
    // Blocks deny reads; a mute only filters feeds (getBlockedAuthorIds, not the hidden set).
    const blocked = await getBlockedAuthorIds(viewerId);
    if (blocked.includes(post.userId)) return false;
  }
  return canViewPost(post, viewerId);
}

/** `canReadThread` for a post id (one extra primary-key read). */
export async function canReadPostThread(postId: string, viewerId: string | null): Promise<boolean> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { userId: true, audience: true, deletedAt: true, communityId: true },
  });
  return canReadThread(post, viewerId);
}

/**
 * `canReadThread` for the post a COMMENT belongs to. The post is derived from the
 * comment, never from a post id in the URL: routes like
 * `/rmharks/:id/comment/:commentId/like` carry both, and nothing ties them.
 */
export async function canReadCommentThread(commentId: string, viewerId: string | null): Promise<boolean> {
  const c = await prisma.rMHarkComment.findUnique({
    where: { id: commentId },
    select: {
      rmhark: { select: { userId: true, audience: true, deletedAt: true, communityId: true } },
    },
  });
  return canReadThread(c?.rmhark ?? null, viewerId);
}
