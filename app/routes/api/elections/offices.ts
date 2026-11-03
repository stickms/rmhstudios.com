import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { getOtherRaces } from '@/lib/elections/downballot.server';

const query = z.object({ cycle: z.string().max(10).optional() });

/**
 * GET /api/elections/offices — the other offices on the ballot: statewide offices below the headline races
 * (attorney general, secretary of state, treasurer, lieutenant governor, supreme court, comptroller…) and local
 * ones (mayors, county offices), with live counts. Public, short-cached.
 */
export const Route = createFileRoute('/api/elections/offices')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          query,
          cache: { visibility: 'public', maxAge: 20, sMaxAge: 30 },
          etag: false,
          microCache: false,
          label: 'elections.offices',
        },
        async ({ query: q }) => {
          const cycle = q.cycle ? parseDay(q.cycle) : currentCycle();
          if (!cycle) return Response.json({ error: 'Unknown election cycle' }, { status: 400 });
          const { races, at } = await getOtherRaces(cycle);
          return Response.json({ races, updatedAt: new Date(at).toISOString() });
        },
      ),
    },
  },
});
