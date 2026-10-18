import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { censusAnswerSchema } from '@/lib/communities/census';
import { requireMember } from '@/lib/communities/guard.server';
import { CensusError, answerCensus } from '@/lib/communities/census.server';

/** POST /api/communities/$slug/census/$id/answer — a member answers once. */
export const Route = createFileRoute('/api/communities/$slug/census/$id/answer')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: censusAnswerSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMember(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            await answerCensus(guard.value.id, params.id, userId, body.answers);
            return Response.json({ success: true }, { status: 201 });
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
