/**
 * Post-audience visibility helpers.
 *
 * A post is visible to a viewer when it's PUBLIC, the viewer is the author,
 * it's FOLLOWERS-only and the viewer follows the author, or it's SUPPORTERS-only
 * (Creator Studio, §3) and the viewer holds an active membership of the author.
 */

import { prisma } from '@/lib/prisma.server';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';

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
 * profile's likes - where the post's author is arbitrary, so visibility has to
 * be checked in full: not deleted, audience rules (PUBLIC / own / FOLLOWERS the
 * viewer follows / CIRCLE the viewer is in), and not by an author the viewer
 * blocked, muted or was blocked by. Nest it under the relation:
 * `{ rmhark: await viewerVisiblePostWhere(viewerId) }`.
 *
 * Costs the viewer's cached follow graph + hidden-author set (both in-process
 * hits when warm) and one circle read; anonymous viewers cost nothing.
 */
export async function viewerVisiblePostWhere(viewerId: string | null): Promise<Record<string, unknown>> {
  if (!viewerId) return { deletedAt: null, audience: 'PUBLIC' as const };
  const [following, circles, hidden] = await Promise.all([
    getFollowingIds(viewerId),
    circleOwnerIds(viewerId),
    getHiddenAuthorIds(viewerId),
  ]);
  return {
    deletedAt: null,
    ...audienceWhere(viewerId, following, [], circles),
    ...(hidden.length ? { userId: { notIn: hidden } } : {}),
  };
}

/** Whether a single post is visible to a viewer (used on the post-detail route). */
export async function canViewPost(
  post: { userId: string; audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'SUPPORTERS' | 'CIRCLE' },
  viewerId: string | null,
): Promise<boolean> {
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
