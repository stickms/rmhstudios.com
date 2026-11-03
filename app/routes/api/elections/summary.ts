import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { getAiSummary } from '@/lib/elections/ai.server';
import { getElectionSnapshot } from '@/lib/elections/source.server';

const query = z.object({ cycle: z.string().max(10).optional() });

/**
 * GET /api/elections/summary — the AI-written "what is happening" paragraph for a
 * cycle. Shared by every viewer and regenerated only when a race is called
 * (see lib/elections/ai.server.ts), so anonymous access cannot run up a bill.
 * `summary` is null when AI is not configured or nothing has happened yet.
 */
export const Route = createFileRoute('/api/elections/summary')({
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
          label: 'elections.summary',
        },
        async ({ query: q }) => {
          const cycle = q.cycle ? parseDay(q.cycle) : currentCycle();
          if (!cycle) return Response.json({ error: 'Unknown election cycle' }, { status: 400 });
          const snapshot = await getElectionSnapshot(cycle);
          return Response.json(await getAiSummary(snapshot));
        },
      ),
    },
  },
});
