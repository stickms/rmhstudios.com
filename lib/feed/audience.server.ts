/**
 * Post-audience visibility helpers.
 *
 * A post is visible to a viewer when it's PUBLIC, the viewer is the author,
 * it's FOLLOWERS-only and the viewer follows the author, or it's SUPPORTERS-only
 * (Creator Studio, §3) and the viewer holds an active membership of the author.
 */

import { prisma } from '@/lib/prisma.server';

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
  supportedCreatorIds: string[] = []
) {
  if (!viewerId) return { audience: 'PUBLIC' as const };
  return {
    OR: [
      { audience: 'PUBLIC' as const },
      { userId: viewerId },
      { audience: 'FOLLOWERS' as const, userId: { in: followingIds } },
      { audience: 'SUPPORTERS' as const, userId: { in: supportedCreatorIds } },
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

/** Whether a single post is visible to a viewer (used on the post-detail route). */
export async function canViewPost(
  post: { userId: string; audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'SUPPORTERS' },
  viewerId: string | null
): Promise<boolean> {
  if (post.audience === 'PUBLIC') return true;
  if (!viewerId) return false;
  if (post.userId === viewerId) return true;
  if (post.audience === 'PRIVATE') return false;
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
