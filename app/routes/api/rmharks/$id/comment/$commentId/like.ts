import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { canReadCommentThread } from '@/lib/feed/audience.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export const Route = createFileRoute('/api/rmharks/$id/comment/$commentId/like')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, userId: viewerId }) => {
        const { commentId } = params;
        // Gate on the post the COMMENT belongs to (not the `:id` in the URL).
        if (!(await canReadCommentThread(commentId, viewerId))) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }
        const likes = await prisma.rMHarkCommentLike.findMany({
          where: { commentId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { user: { select: userDisplaySelect } },
        });
        return Response.json(likes.map((l) => ({ ...resolveUser(l.user), likedAt: l.createdAt })));
      }),
      POST: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'comment-like' } },
        async ({ params, session }) => {
          const { commentId } = params;
          const userId = session.user.id;

          const existing = await prisma.rMHarkCommentLike.findUnique({
            where: { commentId_userId: { commentId, userId } },
          });

          if (existing) {
            // Remove the like and drop the comment's denormalized tally in the same
            // transaction (guarded so it never goes below zero).
            await prisma.$transaction([
              prisma.rMHarkCommentLike.delete({ where: { id: existing.id } }),
              prisma.rMHarkComment.updateMany({
                where: { id: commentId, likeCount: { gt: 0 } },
                data: { likeCount: { decrement: 1 } },
              }),
            ]);
            return Response.json({ success: true, liked: false });
          } else {
            // Adding needs a readable thread; undoing (above) stays allowed so an old
            // like can always be removed even after the post became private.
            if (!(await canReadCommentThread(commentId, userId))) {
              return Response.json({ error: 'Not found' }, { status: 404 });
            }
            // Add the like and bump the comment's denormalized tally atomically.
            await prisma.$transaction([
              prisma.rMHarkCommentLike.create({ data: { commentId, userId } }),
              prisma.rMHarkComment.update({
                where: { id: commentId },
                data: { likeCount: { increment: 1 } },
              }),
            ]);
            return Response.json({ success: true, liked: true });
          }
        },
      ),
    },
  },
});
