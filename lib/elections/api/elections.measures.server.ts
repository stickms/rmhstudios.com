import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { getElectionMeasuresApi } from '@/lib/elections/elections.contract';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { getBallotMeasures } from '@/lib/elections/measures.server';

const query = z.object({ cycle: z.string().max(10).optional() });

/**
 * GET /api/elections/measures — every ballot measure on the cycle's ballots (statewide amendments,
 * propositions and initiatives, plus local city and county questions), with live yes/no counts, the share
 * each needs to pass, and whether it is passing at this count. Public, short-cached.
 */
export const route = apiRoute('/api/elections/measures', {
  GET: implement(
    getElectionMeasuresApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query,
      cache: { visibility: 'public', maxAge: 20, sMaxAge: 30 },
      etag: false,
      microCache: false,
      label: 'elections.measures',
    },
    async ({ query: q }) => {
      const cycle = q.cycle ? parseDay(q.cycle) : currentCycle();
      if (!cycle) return Response.json({ error: 'Unknown election cycle' }, { status: 400 });
      const { measures, at } = await getBallotMeasures(cycle);
      return Response.json({ measures, updatedAt: new Date(at).toISOString() });
    },
  ),
});
