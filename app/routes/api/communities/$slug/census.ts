import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { censusCreateSchema } from '@/lib/communities/census';
import { requireMod, requireReadable } from '@/lib/communities/guard.server';
import { CensusError, createCensus, getLatestCensus } from '@/lib/communities/census.server';

/**
 * GET  /api/communities/$slug/census — the latest census, shaped for the viewer.
 *      Results are aggregate-only and only appear once it is closed with ≥ 5 responses.
 * POST /api/communities/$slug/census — a mod opens a census (≤ 10 questions).
 */
export const Route = createFileRoute('/api/communities/$slug/census')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        const guard = await requireReadable(params.slug, userId);
        if (!guard.ok) return guard.response;
        return Response.json({ census: await getLatestCensus(guard.value.id, userId) });
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: censusCreateSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            const created = await createCensus(guard.value.id, userId, body);
            return Response.json(created, { status: 201 });
          } catch (e) {
            if (e instanceof CensusError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
    },
  },
});
