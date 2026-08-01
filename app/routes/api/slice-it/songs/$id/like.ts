import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/slice-it/songs/$id/like')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'slice-like' } },
        async ({ params, session }) => {
          const { id } = params;
          const userId = session.user.id;

          // Check if already liked
          const existingLike = await prisma.songLike.findUnique({
            where: {
              songId_userId: {
                songId: id,
                userId: userId,
              },
            },
          });

          if (existingLike) {
            // Unlike
            await prisma.songLike.delete({
              where: {
                id: existingLike.id,
              },
            });
            return Response.json({ success: true, liked: false });
          } else {
            // Like
            await prisma.songLike.create({
              data: {
                songId: id,
                userId: userId,
              },
            });
            return Response.json({ success: true, liked: true });
          }
        },
      ),
    },
  },
});
