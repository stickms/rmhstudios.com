import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { savedSearchUpdateSchema } from '@/lib/search/saved';
import { updateSaved, deleteSaved, SavedSearchError } from '@/lib/search/saved.server';

/**
 * PATCH  /api/search/saved/:id { alerts } — toggle new-result alerts.
 * DELETE /api/search/saved/:id — remove a saved search.
 */
export const Route = createFileRoute('/api/search/saved/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const body = await request.json().catch(() => null);
          const parsed = savedSearchUpdateSchema.safeParse(body);
          if (!parsed.success || parsed.data.alerts === undefined) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          try {
            await updateSaved(session.user.id, params.id, parsed.data.alerts);
          } catch (e) {
            if (e instanceof SavedSearchError) return Response.json({ error: e.message }, { status: 404 });
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Saved search update error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          await deleteSaved(session.user.id, params.id);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Saved search delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
