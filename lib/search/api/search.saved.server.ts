import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createSavedSearchApi, listSavedSearchesApi } from '@/lib/search/saved.contract';
import { withRateLimit } from '@/lib/rate-limit';
import { savedSearchCreateSchema } from '@/lib/search/saved';
import { listSaved, createSaved, SavedSearchError } from '@/lib/search/saved.server';

/**
 * GET  /api/search/saved — the caller's saved searches.
 * POST /api/search/saved { query, types?, alerts? } — save a search.
 */
export const route = apiRoute('/api/search/saved', {
  GET: implement(listSavedSearchesApi, {}, async ({ session }) => {
    return { saved: await listSaved(session.user.id) };
  }),
  POST: implement(
    createSavedSearchApi,
    { body: savedSearchCreateSchema },
    async ({ request, session, body }) => {
      const limited = withRateLimit(request, 'write', { prefix: 'saved-search' });
      if (limited) return limited;
      try {
        const saved = await createSaved(session.user.id, body.query, body.types, body.alerts);
        return { saved };
      } catch (e) {
        if (e instanceof SavedSearchError)
          return Response.json({ error: e.message }, { status: 400 });
        throw e;
      }
    },
  ),
});
