import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
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
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json({ saved: await listSaved(session.user.id) });
        } catch (error) {
          console.error('Saved search list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const limited = withRateLimit(request, 'write', { prefix: 'saved-search' });
          if (limited) return limited;
          const body = await request.json().catch(() => null);
          const parsed = savedSearchCreateSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            const saved = await createSaved(
              session.user.id,
              parsed.data.query,
              parsed.data.types,
              parsed.data.alerts,
            );
            return Response.json({ saved });
          } catch (e) {
            if (e instanceof SavedSearchError)
              return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
        } catch (error) {
          console.error('Saved search create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
