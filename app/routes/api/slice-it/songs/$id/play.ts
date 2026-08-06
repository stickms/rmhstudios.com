import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

/**
 * Record a play.
 *
 * Two fixes. The handler used `prisma.song.update` on an id straight from the
 * URL, so a request for a song that had been deleted threw `P2025` and became a
 * 500 — routine, since the client fires this without awaiting and a stale
 * library page is normal. And its rate limit was 5/minute keyed by IP alone,
 * which for a shared connection is five plays a minute *between everyone on
 * it*: play counts silently stopped incrementing for anyone behind a NAT.
 */
export const Route = createFileRoute('/api/slice-it/songs/$id/play')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'optional',
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'slice-play', scope: 'user' },
        },
        async ({ params, userId }) => {
          const { id } = params;

          const exists = await prisma.song.findUnique({
            where: { id },
            select: { id: true, isPublic: true, uploadedBy: true },
          });
          if (!exists || (!exists.isPublic && exists.uploadedBy !== userId)) {
            return Response.json({ error: 'Song not found' }, { status: 404 });
          }

          const [song] = await Promise.all([
            // `select` matters here: without it Prisma returns every scalar,
            // and `analysisData` is the chart — up to megabytes of JSON,
            // de-TOASTed and parsed on every play, to read one integer.
            prisma.song.update({
              where: { id },
              data: { plays: { increment: 1 } },
              select: { plays: true },
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
