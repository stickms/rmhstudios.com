import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { getBallotMeasures } from '@/lib/elections/measures.server';

const query = z.object({ cycle: z.string().max(10).optional() });

/**
 * GET /api/elections/measures — every ballot measure on the cycle's ballots (statewide amendments,
 * propositions and initiatives, plus local city and county questions), with live yes/no counts, the share
 * each needs to pass, and whether it is passing at this count. Public, short-cached.
 */
export const Route = createFileRoute('/api/elections/measures')({
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
          label: 'elections.measures',
        },
        async ({ query: q }) => {
          const cycle = q.cycle ? parseDay(q.cycle) : currentCycle();
          if (!cycle) return Response.json({ error: 'Unknown election cycle' }, { status: 400 });
          const { measures, at } = await getBallotMeasures(cycle);
          return Response.json({ measures, updatedAt: new Date(at).toISOString() });
        },
      ),
    },
  },
});
