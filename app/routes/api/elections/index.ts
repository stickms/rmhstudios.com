import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { getElectionsApi } from '@/lib/elections/elections.contract';
import { currentCycle, parseDay, phaseOf } from '@/lib/elections/calendar';
import { getElectionSnapshot } from '@/lib/elections/source.server';
import { OFFICES, type Office } from '@/lib/elections/types';

const query = z.object({
  /** A year ("2028") or an election date; defaults to the current cycle. */
  cycle: z.string().max(10).optional(),
  /** Comma-separated subset of offices, e.g. "senate,governor" — the House payload is large. */
  offices: z.string().max(60).optional(),
});

/**
 * GET /api/elections — the live snapshot for a cycle: chamber control, every
 * race with candidates/votes/calls, poll-closing times. Public and cached for
 * a few seconds; the snapshot itself is refreshed upstream every ~20s while
 * votes are coming in (lib/elections/source.server.ts).
 */
export const Route = createFileRoute('/api/elections/')({
  server: {
    handlers: {
      GET: implement(getElectionsApi, 
        {
          auth: 'none',
          rateLimit: 'read',
          query,
          cache: { visibility: 'public', maxAge: 10, sMaxAge: 15 },
          etag: false,
          microCache: false,
          label: 'elections.snapshot',
        },
        async ({ query: q }) => {
          const now = new Date();
          const cycle = q.cycle ? parseDay(q.cycle) : currentCycle(now);
          if (!cycle) return Response.json({ error: 'Unknown election cycle' }, { status: 400 });

          const want = q.offices
            ? new Set(
                q.offices
                  .split(',')
                  .map((s) => s.trim())
                  .filter((s): s is Office => (OFFICES as readonly string[]).includes(s)),
              )
            : null;

          const full = await getElectionSnapshot(cycle, now);
          const snapshot = want
            ? {
                ...full,
                races: full.races.filter((r) => want.has(r.office)),
                chambers: Object.fromEntries(
                  Object.entries(full.chambers).filter(([o]) => want.has(o as Office)),
                ),
              }
            : full;

          return Response.json({
            cycle,
            phase: phaseOf(cycle.date, now),
            serverTime: now.toISOString(),
            snapshot,
          });
        },
      ),
    },
  },
});
