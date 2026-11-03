import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { currentCycle, cycleForYear, isValidCycleYear } from '@/lib/elections/calendar';
import { derivePrimaryDays, mergeDays } from '@/lib/elections/calendar-days';
import { fecKeyConfigured, getFecDays } from '@/lib/elections/fec.server';
import { getElectionSnapshot } from '@/lib/elections/source.server';

const query = z.object({ year: z.coerce.number().int().optional() });

/**
 * GET /api/elections/calendar?year= — the non-general election days (primaries, runoffs, specials)
 * of a cycle, for the "browse an election day" picker. The baseline is DERIVED from the results
 * feed's candidates (keyless); the FEC's election-dates API (a government source) is merged on top
 * when it answers. `fec` says how that went so the page can be honest about it.
 */
export const Route = createFileRoute('/api/elections/calendar')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          query,
          cache: { visibility: 'public', maxAge: 300, sMaxAge: 900 },
          etag: false,
          microCache: false,
          label: 'elections.calendar',
        },
        async ({ query: q }) => {
          const year = q.year ?? currentCycle().year;
          if (!isValidCycleYear(year)) return Response.json({ error: 'Unknown election year' }, { status: 400 });
          const [snap, fec] = await Promise.all([getElectionSnapshot(cycleForYear(year)), getFecDays(year)]);
          const derived = derivePrimaryDays(snap.races, year);
          return Response.json({
            year,
            days: mergeDays(derived, fec.days),
            fec: fec.status,
            fecKey: fecKeyConfigured(),
          });
        },
      ),
    },
  },
});
