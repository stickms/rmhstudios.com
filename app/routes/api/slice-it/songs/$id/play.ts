import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';

export const Route = createFileRoute('/api/slice-it/songs/$id/play')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'none', rateLimit: { limit: 5, windowMs: 60_000, prefix: 'slice-play' } },
        async ({ request, params }) => {
          const { id } = params;

          const session = await auth.api.getSession({ headers: request.headers });
          const userId = session?.user?.id;

          const [song] = await Promise.all([
            prisma.song.update({
              where: { id },
              data: { plays: { increment: 1 } },
            }),
            userId
              ? prisma.songPlay.upsert({
                  where: { songId_userId: { songId: id, userId } },
                  create: { songId: id, userId, count: 1, lastPlayedAt: new Date() },
                  update: { count: { increment: 1 }, lastPlayedAt: new Date() },
                })
              : Promise.resolve(null),
          ]);

          return Response.json({ success: true, plays: song.plays });
        },
      ),
    },
  },
});
