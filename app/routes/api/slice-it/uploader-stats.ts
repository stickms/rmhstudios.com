import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { defineHandler } from '@/lib/api/handler.server';
import { uploaderStats } from '@/lib/slice-it/library.server';

/**
 * L6 — the uploader dashboard's read.
 *
 * `SliceSong` exposes plays, likes, scores and comments per song and nothing
 * aggregates them, so an uploader with thirty charts has thirty numbers and no
 * view. The part that is genuinely new is the clear rate and accuracy over
 * time: it is the only thing that can tell an uploader their chart has a bad
 * bar in it.
 *
 * Own stats only. An uploader's telemetry is theirs — a public version of this
 * would tell anyone which of a stranger's charts nobody plays, which is a fact
 * about a person, not about a chart.
 */
const QueryZ = z.object({
  days: z.coerce.number().int().min(7).max(365).default(90),
});

export const Route = createFileRoute('/api/slice-it/uploader-stats')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: QueryZ }, async ({ userId, query }) => {
        return Response.json(await uploaderStats(userId, query.days));
      }),
    },
  },
});
