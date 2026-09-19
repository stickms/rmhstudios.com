import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getGrid, MAX_DAYS } from '@/lib/schedule/grid.server';

/**
 * `GET /api/schedule` — what is on (L1).
 *
 * Public and identical for everyone, so it takes a shared cache. The window is
 * floored to midnight UTC inside `getGrid`, which is what makes that safe: a
 * response cached at 09:00 is still correct at 09:05 because the buckets do
 * not move with the clock.
 */

const query = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DAYS).optional(),
  /** ISO date to start from. Defaults to today. */
  from: z.string().datetime().optional(),
});

export const Route = createFileRoute('/api/schedule/')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          query,
          cache: { visibility: 'public', maxAge: 60, sMaxAge: 300 },
        },
        async ({ query: q }) =>
          Response.json(await getGrid(q.from ? new Date(q.from) : new Date(), q.days ?? 7)),
      ),
    },
  },
});
