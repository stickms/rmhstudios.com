import { createFileRoute } from '@tanstack/react-router';

import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { chartsForSong } from '@/lib/slice-it/charts.server';

/**
 * C2 — the charts on a song.
 *
 * Separate from the song read on purpose: the picker is opened by a fraction of
 * the people who open a song, and folding this into `songs/$id` would add a
 * second query and an author join to the request that is already on the
 * critical path to starting a run.
 */
export const Route = createFileRoute('/api/slice-it/songs/$id/charts')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        // Visibility is checked on the SONG, not just the charts: a private
        // song's public chart is still a private song, and listing its charts
        // would confirm it exists to anyone who guessed the id.
        const song = await prisma.song.findUnique({
          where: { id: params.id },
          select: { id: true, isPublic: true, uploadedBy: true },
        });
        if (!song || (!song.isPublic && userId !== song.uploadedBy)) {
          return Response.json({ error: 'Song not found' }, { status: 404 });
        }
        return Response.json({ charts: await chartsForSong(params.id, userId) });
      }),
    },
  },
});
