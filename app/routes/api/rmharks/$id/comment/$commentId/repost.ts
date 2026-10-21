import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { canReadCommentThread } from '@/lib/feed/audience.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export const Route = createFileRoute('/api/rmharks/$id/comment/$commentId/repost')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, userId: viewerId }) => {
        const { commentId } = params;
        // Gate on the post the COMMENT belongs to (not the `:id` in the URL).
        if (!(await canReadCommentThread(commentId, viewerId))) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }
        const reposts = await prisma.rMHarkCommentRepost.findMany({
          where: { commentId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { user: { select: userDisplaySelect } },
        });
        return Response.json(
          reposts.map((r) => ({ ...resolveUser(r.user), repostedAt: r.createdAt })),
        );
      }),
      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'comment-repost' } },
        async ({ params, session }) => {
          const { commentId } = params;
          const userId = session.user.id;

          const existing = await prisma.rMHarkCommentRepost.findUnique({
            where: { commentId_userId: { commentId, userId } },
          });

          if (existing) {
            await prisma.rMHarkCommentRepost.delete({ where: { id: existing.id } });
            return Response.json({ success: true, reposted: false });
          } else {
            await prisma.rMHarkCommentRepost.create({ data: { commentId, userId } });
            return Response.json({ success: true, reposted: true });
          }
        },
      ),
    },
  },
});
