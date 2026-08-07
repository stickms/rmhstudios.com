import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { regenerateSong } from '@/lib/slice-it/regen.server';

/**
 * C8 — re-chart a song with the current generator.
 *
 * The uploader or an admin, and nobody else. Regeneration replaces the notes
 * under any score already set on the generated chart, so it is the same class
 * of decision as deleting the song — which is exactly the ownership rule the
 * upload route already enforces.
 *
 * Runs inline rather than queueing. It is an explicit action with a spinner
 * attached, and a queued "we'll get to it" gives the uploader no way to know
 * whether their `densityBias` change did what they wanted. The rate limit is
 * what stops it being a CPU tap: one per five minutes per user, because a
 * regeneration is a full decode and analysis.
 */
const BodyZ = z.object({
  /** C10 — re-chart at a different density. */
  densityBias: z.number().min(-2).max(2).optional(),
});

export const Route = createFileRoute('/api/slice-it/songs/$id/regenerate')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 3, windowMs: 15 * 60_000, prefix: 'slice-regen', scope: 'user' },
          body: BodyZ,
        },
        async ({ params, userId, isAdmin, body }) => {
          const song = await prisma.song.findUnique({
            where: { id: params.id },
            select: { id: true, uploadedBy: true },
          });
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });
          if (song.uploadedBy !== userId && !isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const result = await regenerateSong(params.id, { densityBias: body.densityBias });
          return Response.json({ success: true, ...result });
        },
      ),
    },
  },
});
