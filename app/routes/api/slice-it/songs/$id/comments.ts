import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';

import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';

const MAX_COMMENT_LENGTH = 2000;

export const Route = createFileRoute('/api/slice-it/songs/$id/comments')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const { id } = params;
        // Bounded: a public list with no pagination UI, so without a cap a popular
        // song's thread grows into the response forever. 200 is far above any real
        // thread and keeps the newest-first order the client already renders, so
        // nothing observable changes today.
        const comments = await prisma.songComment.findMany({
          where: { songId: id },
          orderBy: { createdAt: 'desc' },
          take: 200,
          include: {
            user: {
              select: {
                name: true,
                username: true,
                image: true,
                profile: { select: { displayName: true, customImage: true } },
              },
            },
          },
        });

        const formatted = comments.map((c: any) => {
          const resolved = resolveUserDisplay(c.user);
          return {
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
            user: {
              name: resolved.name || c.user.username || 'Unknown',
              image: resolved.image,
            },
          };
        });

        return Response.json(formatted);
      }),
      POST: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'slice-comments' } },
        async ({ request, params, session }) => {
          const { id } = params;
          const body = await request.json();
          const { content } = body;

          if (!content || typeof content !== 'string') {
            return Response.json({ error: 'Comment cannot be empty' }, { status: 400 });
          }
          const trimmed = content.trim();
          if (!trimmed) {
            return Response.json({ error: 'Comment cannot be empty' }, { status: 400 });
          }
          if (trimmed.length > MAX_COMMENT_LENGTH) {
            return Response.json(
              { error: `Comment must be at most ${MAX_COMMENT_LENGTH} characters` },
              { status: 400 },
            );
          }

          const comment = await prisma.songComment.create({
            data: {
              content: trimmed,
              songId: id,
              userId: session.user.id,
            },
            include: {
              user: {
                select: {
                  name: true,
                  username: true,
                  image: true,
                  profile: { select: { displayName: true, customImage: true } },
                },
              },
            },
          });

          const resolved = resolveUserDisplay(comment.user);
          return Response.json({
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt,
            user: {
              name: resolved.name || comment.user.username || 'Unknown',
              image: resolved.image,
            },
          });
        },
      ),
    },
  },
});
