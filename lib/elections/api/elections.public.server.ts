import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { getElectionSnapshot } from '@/lib/elections/source.server';
import { buildFacts } from '@/lib/elections/summary';

const query = z.object({ cycle: z.string().max(10).optional() });

/**
 * GET /api/elections/public — a small, stable, CORS-open JSON summary for anyone who wants to show the
 * board elsewhere: chamber tallies, races called, the latest update. No per-race detail and no user data;
 * the full snapshot stays on /api/elections. Attribution: link back to rmhstudios.com/elections.
 */
export const route = apiRoute('/api/elections/public', {
  GET: defineHandler(
    {
      auth: 'none',
      rateLimit: 'read',
      query,
      cache: { visibility: 'public', maxAge: 20, sMaxAge: 30 },
      etag: false,
      microCache: false,
      label: 'elections.public',
    },
    async ({ query: q }) => {
      const cycle = q.cycle ? parseDay(q.cycle) : currentCycle();
      if (!cycle) return Response.json({ error: 'Unknown election cycle' }, { status: 400 });
      const snap = await getElectionSnapshot(cycle);
      const f = buildFacts(snap);
      return Response.json(
        {
          date: snap.date,
          title: cycle.title,
          live: snap.live,
          updatedAt: snap.sourceUpdatedAt ?? snap.fetchedAt,
          racesTotal: f.racesTotal,
          racesCalled: f.racesCalled,
          chambers: f.chambers.map((c) => ({
            office: c.office,
            name: c.name,
            seats: c.seats,
            toWin: c.toWin,
            controlledBy: c.controlledBy,
            racesCalled: c.racesCalled,
            seatsUp: c.seatsUp,
          })),
          url: `https://rmhstudios.com/elections?cycle=${cycle.year}`,
          attribution:
            'Results via rmhstudios.com/elections (AP data through the NYT results feed)',
        },
        { headers: { 'Access-Control-Allow-Origin': '*' } },
      );
    },
  ),
});
