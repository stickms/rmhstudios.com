import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getWatchState } from '@/lib/sohumtracker/activity.server';
import { DEFAULT_HISTORY_DAYS, MAX_HISTORY_DAYS } from '@/lib/sohumtracker/config';

/**
 * GET /api/sohumtracker/activity — the whole dossier, and what the page polls.
 *
 * `auth: 'none'` because the page is public and there is nothing here a viewer
 * could be more or less entitled to see: one response for everybody, which is
 * also what makes the `public` cache declaration legal.
 *
 * The cache is deliberately tiny. This endpoint's entire job is to answer "is he
 * in voice right now, and for how long" — a minute of shared freshness would put
 * a stale counter in front of every visitor at once. Five seconds absorbs a
 * burst of tab-switching and a room full of people refreshing at the same joke.
 *
 * Writes: none anywhere. The Go tracker owns every row these queries read.
 */
export const Route = createFileRoute('/api/sohumtracker/activity')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          cache: { visibility: 'public', maxAge: 5, staleWhileRevalidate: 30 },
          query: z.object({
            // Clamped again inside `getWatchState`; declaring the bound here is
            // what turns an out-of-range request into a 400 instead of a
            // silently different answer.
            days: z.coerce.number().int().min(1).max(MAX_HISTORY_DAYS).optional(),
          }),
        },
        async ({ query }) =>
          Response.json(await getWatchState({ days: query?.days ?? DEFAULT_HISTORY_DAYS })),
      ),
    },
  },
});
