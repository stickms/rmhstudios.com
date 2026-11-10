import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { getElectionHistoryApi } from '@/lib/elections/elections.contract';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { getHistory } from '@/lib/elections/history.server';
import { getElectionSnapshot } from '@/lib/elections/source.server';

const query = z.object({ cycle: z.string().max(10).optional(), race: z.string().min(3).max(80) });

/**
 * GET /api/elections/history?race= — the vote-share series for one race (one point per change in its
 * vote total) for the live graph. Recorded as snapshots are built, so it covers the time this server
 * has been watching; a restart mid-night starts the line from then.
 */
export const Route = createFileRoute('/api/elections/history')({
  server: {
    handlers: {
      GET: implement(getElectionHistoryApi, 
        {
          auth: 'none',
          rateLimit: 'read',
          query,
          cache: { visibility: 'public', maxAge: 5, sMaxAge: 10 },
          etag: false,
          microCache: false,
          label: 'elections.history',
        },
        async ({ query: q }) => {
          const cycle = q.cycle ? parseDay(q.cycle) : currentCycle();
          if (!cycle) return Response.json({ error: 'Unknown election' }, { status: 400 });
          // Make sure the day has been observed at least once so the first point exists.
          await getElectionSnapshot(cycle);
          return Response.json({ race: q.race, points: getHistory(cycle.date, q.race) });
        },
      ),
    },
  },
});
