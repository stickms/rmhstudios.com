import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { racesToCsv } from '@/lib/elections/csv';
import { getElectionSnapshot } from '@/lib/elections/source.server';

const query = z.object({ cycle: z.string().max(10).optional() });

/** GET /api/elections/races.csv — every race in the current snapshot as CSV (formula-safe). */
export const Route = createFileRoute('/api/elections/races.csv')({
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
          label: 'elections.csv',
        },
        async ({ query: q }) => {
          const cycle = q.cycle ? parseDay(q.cycle) : currentCycle();
          if (!cycle) return Response.json({ error: 'Unknown election cycle' }, { status: 400 });
          const snap = await getElectionSnapshot(cycle);
          return new Response(racesToCsv(snap.races), {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="elections-${snap.date}.csv"`,
              'Access-Control-Allow-Origin': '*',
            },
          });
        },
      ),
    },
  },
});
