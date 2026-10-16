import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { computeCohortRetention, getCohortRetention } from '@/lib/ops/cohorts.server';

/**
 * GET  /api/admin/insights/cohorts — weekly signup cohorts x weeks-later activity.
 * POST /api/admin/insights/cohorts — recompute now (the daily job does this too).
 */
export const Route = createFileRoute('/api/admin/insights/cohorts')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json(await getCohortRetention()),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: { limit: 3, windowMs: 60_000, prefix: 'ops-cohorts' } },
        async () => {
          await computeCohortRetention();
          return Response.json(await getCohortRetention());
        },
      ),
    },
  },
});
