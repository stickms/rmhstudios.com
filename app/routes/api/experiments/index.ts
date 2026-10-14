import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { experimentEventSchema } from '@/lib/ops/schema';
import { assignmentsFor, recordExperimentEvent } from '@/lib/ops/experiments.server';

/**
 * GET  /api/experiments — the caller's variant for every running experiment
 *      (one cached read + a hash; nothing per-user is stored until exposure).
 * POST /api/experiments — record an exposure or a conversion for one experiment.
 */
export const Route = createFileRoute('/api/experiments/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) => {
        const assignments = userId ? await assignmentsFor(userId) : {};
        return Response.json(
          { assignments },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: experimentEventSchema },
        async ({ userId, body }) => {
          await recordExperimentEvent(userId, body.key, body.event);
          return new Response(null, { status: 204 });
        },
      ),
    },
  },
});
