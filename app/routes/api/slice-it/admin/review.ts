import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { defineHandler } from '@/lib/api/handler.server';
import { chartTimingPopulation, reviewQueue } from '@/lib/slice-it/review.server';

/**
 * R7 — the moderator's view of what integrity flagged.
 *
 * Read-only, and that is not an oversight. `integrity.ts` flags and never
 * rejects, and this endpoint inherits that: it exists so a human can look at
 * the evidence, and there is deliberately no action here to take against a run.
 * Whatever a moderator decides goes through the platform's existing moderation
 * path with an audit trail, not through a "reject" button on a statistic.
 */
const QueryZ = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Optional: the population distribution for one chart, for context. */
  songId: z.string().max(64).optional(),
  difficulty: z.string().max(16).optional(),
});

export const Route = createFileRoute('/api/slice-it/admin/review')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read', query: QueryZ }, async ({ query }) => {
        if (query.songId) {
          return Response.json(
            await chartTimingPopulation(query.songId, query.difficulty ?? 'normal'),
          );
        }
        return Response.json({ runs: await reviewQueue(query.limit) });
      }),
    },
  },
});
