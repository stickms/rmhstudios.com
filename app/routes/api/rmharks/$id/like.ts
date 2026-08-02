import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { togglePostLike } from '@/lib/social/engagement.server';

export const Route = createFileRoute('/api/rmharks/$id/like')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const { id } = params;
        const likes = await prisma.rMHarkLike.findMany({
          where: { rmheetId: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { user: { select: userDisplaySelect } },
        });
        return Response.json(likes.map((l) => ({ ...resolveUser(l.user), likedAt: l.createdAt })));
      }),
      POST: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'rmhark-like' } },
        async ({ params, session }) => {
          const { id } = params;
          const userId = session.user.id;

          // Toggle via the shared engagement service (counters, SSE, notifications,
          // XP, quests, achievements, and webhooks all live there).
          const result = await togglePostLike(userId, id);
          if (!result.found) {
            return Response.json({ error: 'Post not found' }, { status: 404 });
          }
          return Response.json({ success: true, liked: result.liked });
        },
      ),
    },
  },
});
