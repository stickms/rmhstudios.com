import { pageSize } from '@/lib/pagination';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import {
  encodeFollowCursor,
  followCursorWhere,
  parseFollowCursor,
  FOLLOW_ORDER_BY,
} from '@/lib/api/follow-cursor';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export const route = apiRoute('/api/profile/$id/followers', {
  GET: defineHandler({ auth: 'optional' }, async ({ request, params, userId: viewerId }) => {
    const { id: idOrHandle } = params;
    const resolvedUser = await prisma.user.findUnique({
      where: { handle: idOrHandle },
      select: { id: true },
    });
    const id = resolvedUser?.id ?? idOrHandle;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = pageSize(searchParams.get('limit'), 20, 50);

    // Get current viewer session for isFollowing status

    const followRecords = await prisma.follow.findMany({
      where: {
        followingId: id,
        ...followCursorWhere(parseFollowCursor(cursor)),
      },
      orderBy: FOLLOW_ORDER_BY,
      take: limit,
      include: {
        follower: { select: userDisplaySelect },
      },
    });

    // Check which of these users the viewer follows
    let viewerFollowingSet = new Set<string>();
    if (viewerId && followRecords.length > 0) {
      const followerIds = followRecords.map((r) => r.follower.id);
      const viewerFollows = await prisma.follow.findMany({
        where: { followerId: viewerId, followingId: { in: followerIds } },
        select: { followingId: true },
      });
      viewerFollowingSet = new Set(viewerFollows.map((f) => f.followingId));
    }

    const users = followRecords.map((r) => {
      const resolved = resolveUser(r.follower);
      return {
        ...resolved,
        isFollowing: viewerFollowingSet.has(resolved.id),
        isOwnProfile: resolved.id === viewerId,
      };
    });

    const nextCursor =
      followRecords.length === limit
        ? encodeFollowCursor(followRecords[followRecords.length - 1])
        : null;

    return Response.json({
      users,
      nextCursor,
      hasMore: followRecords.length === limit,
    });
  }),
});
