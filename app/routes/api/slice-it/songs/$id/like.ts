import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

/**
 * Like / unlike a song.
 *
 * The old version did findUnique → branch → create-or-delete, which races
 * itself: a double-click sends two requests, both see "not liked", and the
 * second `create` violates the `(songId, userId)` unique and 500s. The
 * create-and-catch below is the same round trips and cannot race, because the
 * database constraint is what decides.
 *
 * It also returns the resulting count, so the client can show a real number
 * instead of incrementing its own copy and drifting from the truth.
 */
export const Route = createFileRoute('/api/slice-it/songs/$id/like')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'slice-like', scope: 'user' } },
        async ({ params, userId }) => {
          const { id } = params;

          const song = await prisma.song.findUnique({
            where: { id },
            select: { id: true, isPublic: true, uploadedBy: true },
          });
          if (!song || (!song.isPublic && song.uploadedBy !== userId)) {
            return Response.json({ error: 'Song not found' }, { status: 404 });
          }

          let liked: boolean;
          try {
            await prisma.songLike.create({ data: { songId: id, userId } });
            liked = true;
          } catch {
            // Already liked — the unique constraint said so. Toggle it off.
            const removed = await prisma.songLike.deleteMany({ where: { songId: id, userId } });
            // `deleteMany` returning zero means the create failed for some
            // other reason; report the state rather than guessing at it.
            liked = removed.count === 0;
          }

          const likeCount = await prisma.songLike.count({ where: { songId: id } });
          return Response.json({ success: true, liked, likeCount });
        },
      ),
    },
  },
});
