import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { toggleFollow } from '@/lib/social/engagement.server';

export const Route = createFileRoute('/api/profile/$id/follow')({
  server: {
    handlers: {
      POST: defineHandler(
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
          return Response.json({ success: true, following: result.following });
        },
      ),
    },
  },
});
