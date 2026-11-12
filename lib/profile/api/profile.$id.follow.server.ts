import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { toggleFollowApi } from '@/lib/profile/follow.contract';
import { prisma } from '@/lib/prisma.server';
import { toggleFollow } from '@/lib/social/engagement.server';

export const route = apiRoute('/api/profile/$id/follow', {
  POST: implement(
    toggleFollowApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'follow-toggle' } },
    async ({ params, session }) => {
      const { id: idOrHandle } = params;
      const resolvedUser = await prisma.user.findUnique({
        where: { handle: idOrHandle },
        select: { id: true },
      });
      const followingId = resolvedUser?.id ?? idOrHandle;
      const followerId = session.user.id;
      const followerHandle = (session.user as { handle?: string }).handle ?? null;

      const result = await toggleFollow({ followerId, followingId, followerHandle });
      if (result.selfFollow)
        return Response.json({ error: 'Cannot follow yourself' }, { status: 400 });
      if (!result.found) return Response.json({ error: 'User not found' }, { status: 404 });
      return { success: true as const, following: result.following };
    },
  ),
});
