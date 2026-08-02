import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { withRateLimit } from '@/lib/rate-limit';
import { savedSearchCreateSchema } from '@/lib/search/saved';
import { listSaved, createSaved, SavedSearchError } from '@/lib/search/saved.server';

/**
 * GET  /api/search/saved — the caller's saved searches.
 * POST /api/search/saved { query, types?, alerts? } — save a search.
 */
export const Route = createFileRoute('/api/search/saved')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        return Response.json({ saved: await listSaved(session.user.id) });
      }),
      POST: defineHandler({ body: savedSearchCreateSchema }, async ({ request, session, body }) => {
        const limited = withRateLimit(request, 'write', { prefix: 'saved-search' });
        if (limited) return limited;
        try {
          const saved = await createSaved(session.user.id, body.query, body.types, body.alerts);
          return Response.json({ saved });
        } catch (e) {
          if (e instanceof SavedSearchError)
            return Response.json({ error: e.message }, { status: 400 });
          throw e;
        }
      }),
    },
  },
});
