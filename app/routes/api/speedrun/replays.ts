/**
 * `/api/speedrun/replays` — your own replays for a game that have not been
 * submitted to a board yet (design K1).
 *
 * A run submission names a replay, so the submit UI needs a list of the ones you
 * could name. Scoped to the caller: this returns nobody else's recordings, which
 * is also why it is not a general "list replays" endpoint.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { listSubmittableReplays } from '@/lib/speedrun/speedrun.server';

const querySchema = z.object({
  game: z.string().min(1).max(32),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const Route = createFileRoute('/api/speedrun/replays')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: querySchema }, async ({ userId, query }) => {
        const replays = await listSubmittableReplays(userId, query.game, query.limit);
        return Response.json({ replays });
      }),
    },
  },
});
