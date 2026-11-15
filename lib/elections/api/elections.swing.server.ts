import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { getElectionSwingApi } from '@/lib/elections/elections.contract';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { getBaseline } from '@/lib/elections/swing.server';

const query = z.object({ cycle: z.string().max(10).optional() });

/**
 * GET /api/elections/swing — for each current race, the margin in the matching 2024 contest (the state's
 * presidential vote for Senate and governor, the same district's House vote), so the page can show where
 * the electorate stood and how far a race has moved. Public, cached; `{}` when the archive is unavailable.
 */
export const route = apiRoute('/api/elections/swing', {
  GET: implement(
    getElectionSwingApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query,
      cache: { visibility: 'public', maxAge: 300, sMaxAge: 3600 },
      etag: false,
      microCache: false,
      label: 'elections.swing',
    },
    async ({ query: q }) => {
      const cycle = q.cycle ? parseDay(q.cycle) : currentCycle();
      if (!cycle) return Response.json({ error: 'Unknown election cycle' }, { status: 400 });
      return Response.json({ baseline: await getBaseline(cycle) });
    },
  ),
});
