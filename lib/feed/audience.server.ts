/**
 * Post-audience visibility helpers.
 *
 * A post is visible to a viewer when it's PUBLIC, the viewer is the author, or
 * it's FOLLOWERS-only and the viewer follows the author.
 */

import { prisma } from '@/lib/prisma.server';

/** A Prisma `where` fragment restricting rMHark queries to what `viewerId` may see. */
export function audienceWhere(viewerId: string | null, followingIds: string[]) {
  if (!viewerId) return { audience: 'PUBLIC' as const };
  return {
    OR: [
      { audience: 'PUBLIC' as const },
      { userId: viewerId },
      { audience: 'FOLLOWERS' as const, userId: { in: followingIds } },
    ],
  };
}

/** Whether a single post is visible to a viewer (used on the post-detail route). */
export async function canViewPost(
  post: { userId: string; audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' },
  viewerId: string | null
): Promise<boolean> {
  if (post.audience === 'PUBLIC') return true;
  if (!viewerId) return false;
  if (post.userId === viewerId) return true;
  if (post.audience === 'PRIVATE') return false;
  // FOLLOWERS — viewer must follow the author.
  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: post.userId } },
    select: { id: true },
  });
  return !!follow;
}
