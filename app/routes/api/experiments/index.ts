import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { recordExperimentEventApi } from '@/lib/experiments.contract';
import { experimentEventSchema } from '@/lib/ops/schema';
import { assignmentsFor, recordExperimentEvent } from '@/lib/ops/experiments.server';

/**
 * GET  /api/experiments — the caller's variant for every running experiment
 *      (one cached read + a hash; nothing per-user is stored until exposure).
 * POST /api/experiments — record an exposure or a conversion for one experiment
 *      (answers `{ ok: true }`: the client reads JSON, and a 204 has no body).
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
      POST: implement(
        recordExperimentEventApi,
        { rateLimit: 'write', body: experimentEventSchema },
        async ({ userId, body }) => {
          await recordExperimentEvent(userId, body.key, body.event);
          return { ok: true as const };
        },
      ),
    },
  },
});
