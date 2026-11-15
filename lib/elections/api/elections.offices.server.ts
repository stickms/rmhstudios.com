import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { getElectionOfficesApi } from '@/lib/elections/elections.contract';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { getOtherRaces } from '@/lib/elections/downballot.server';

const query = z.object({ cycle: z.string().max(10).optional() });

/**
 * GET /api/elections/offices — the other offices on the ballot: statewide offices below the headline races
 * (attorney general, secretary of state, treasurer, lieutenant governor, supreme court, comptroller…) and local
 * ones (mayors, county offices), with live counts. Public, short-cached.
 */
export const route = apiRoute('/api/elections/offices', {
  GET: implement(
    getElectionOfficesApi,
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
});
