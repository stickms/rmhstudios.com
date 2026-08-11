/**
 * `/api/speedrun/leaderboard` — one category's runs (design K1).
 *
 * `version` defaults to `all`, which returns every version's runs each carrying
 * its own version label. The client buckets and ranks them with
 * `buildBoard` from `lib/speedrun/versions.ts` — the same pure function the
 * server would use — so the two can never disagree about who holds the record.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getBoard, SpeedrunError } from '@/lib/speedrun/speedrun.server';
import { ALL_VERSIONS } from '@/lib/speedrun/types';

const querySchema = z.object({
  game: z.string().min(1).max(32),
  slug: z.string().min(1).max(32),
  /** A version tag, or `all` for the labelled cross-version view. */
  version: z.string().min(1).max(16).default(ALL_VERSIONS),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const Route = createFileRoute('/api/speedrun/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          query: querySchema,
          // Anonymous-invariant global top-N — the same bytes for every caller,
          // which is what `public` claims. Matches `void-breaker/leaderboard`.
          cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
        },
        async ({ query }) => {
          try {
            const board = await getBoard(query);
            return Response.json(board);
          } catch (error) {
            if (error instanceof SpeedrunError && error.code === 'CATEGORY_NOT_FOUND') {
              return Response.json({ error: 'No such category.' }, { status: 404 });
            }
            throw error;
          }
        },
      ),
    },
  },
});
