import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { requireMod } from '@/lib/communities/guard.server';
import { CensusError, closeCensus } from '@/lib/communities/census.server';

/** POST /api/communities/$slug/census/$id/close — a mod closes the census, publishing results. */
export const Route = createFileRoute('/api/communities/$slug/census/$id/close')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'write' }, async ({ params, userId }) => {
        const guard = await requireMod(params.slug, userId);
        if (!guard.ok) return guard.response;
        try {
          await closeCensus(guard.value.id, params.id);
          return Response.json({ success: true });
        } catch (e) {
          if (e instanceof CensusError) {
            return Response.json({ error: e.message }, { status: e.status });
          }
          throw e;
        }
      }),
    },
  },
});
