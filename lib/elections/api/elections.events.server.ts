import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { eventHistory } from '@/lib/elections/events.server';
import { getElectionSnapshot } from '@/lib/elections/source.server';

const query = z.object({
  cycle: z.string().max(10).optional(),
  since: z.coerce.number().int().optional(),
});

/** GET /api/elections/events — recent events (calls, flips, lead changes, polls closing, news), oldest first. */
export const route = apiRoute('/api/elections/events', {
  GET: defineHandler(
    {
      auth: 'none',
      rateLimit: 'read',
      query,
      cache: { visibility: 'public', maxAge: 5, sMaxAge: 10 },
      etag: false,
      microCache: false,
      label: 'elections.events',
    },
    async ({ query: q }) => {
      const cycle = q.cycle ? parseDay(q.cycle) : currentCycle();
      if (!cycle) return Response.json({ error: 'Unknown election' }, { status: 400 });
      // Touch the snapshot so the diff engine has run for this day before we read its ring.
      await getElectionSnapshot(cycle);
      const since = q.since ?? 0;
      return Response.json({ events: eventHistory(cycle.date).filter((e) => e.at > since) });
    },
  ),
});
