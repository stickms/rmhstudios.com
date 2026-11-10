import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { deleteSavedSearchApi, updateSavedSearchApi } from '@/lib/search/saved.contract';
import { savedSearchUpdateSchema } from '@/lib/search/saved';
import { updateSaved, deleteSaved, SavedSearchError } from '@/lib/search/saved.server';

/**
 * PATCH  /api/search/saved/:id { alerts } — toggle new-result alerts.
 * DELETE /api/search/saved/:id — remove a saved search.
 */
export const Route = createFileRoute('/api/search/saved/$id')({
  server: {
    handlers: {
      PATCH: implement(
        updateSavedSearchApi,
        {
          rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:search/saved.:id' },
          body: savedSearchUpdateSchema,
        },
        async ({ params, session, body }) => {
          if (body.alerts === undefined) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          try {
            await updateSaved(session.user.id, params.id, body.alerts);
          } catch (e) {
            if (e instanceof SavedSearchError)
              return Response.json({ error: e.message }, { status: 404 });
            throw e;
          }
          return { ok: true as const };
        },
      ),
      DELETE: implement(
        deleteSavedSearchApi,
        { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:search/saved.:id' } },
        async ({ params, session }) => {
          await deleteSaved(session.user.id, params.id);
          return { ok: true as const };
        },
      ),
    },
  },
});
