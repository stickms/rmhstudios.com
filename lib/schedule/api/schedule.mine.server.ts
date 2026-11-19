import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { getMyScheduleApi } from '@/lib/schedule/schedule.contract';
import { getMyGrid, MAX_DAYS } from '@/lib/schedule/grid.server';

/**
 * `GET /api/schedule/mine` — the "Yours" half of /calendar: the events the
 * member is coming to, booked, hosts or added, in the same day buckets as the
 * public grid. Private to the member, so no shared cache.
 */

const query = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DAYS).optional(),
  /** ISO date to start from. Defaults to today. */
  from: z.string().datetime().optional(),
});

export const route = apiRoute('/api/schedule/mine', {
  GET: implement(
    getMyScheduleApi,
    { rateLimit: 'read', query, microCache: false },
    async ({ userId, query: q }) =>
      Response.json(await getMyGrid(userId, q.from ? new Date(q.from) : new Date(), q.days ?? 7), {
        headers: { 'Cache-Control': 'private, no-store' },
      }),
  ),
});
