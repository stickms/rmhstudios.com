import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { savedSearchUpdateSchema } from '@/lib/search/saved';
import { updateSaved, deleteSaved, SavedSearchError } from '@/lib/search/saved.server';

/**
 * PATCH  /api/search/saved/:id { alerts } — toggle new-result alerts.
 * DELETE /api/search/saved/:id — remove a saved search.
 */
export const Route = createFileRoute('/api/search/saved/$id')({
  server: {
    handlers: {
      PATCH: defineHandler({}, async ({ request, params, session }) => {
        const body = await request.json().catch(() => null);
        const parsed = savedSearchUpdateSchema.safeParse(body);
        if (!parsed.success || parsed.data.alerts === undefined) {
          return Response.json({ error: 'Invalid input' }, { status: 400 });
        }
        try {
          await updateSaved(session.user.id, params.id, parsed.data.alerts);
        } catch (e) {
          if (e instanceof SavedSearchError)
            return Response.json({ error: e.message }, { status: 404 });
          throw e;
        }
        return Response.json({ ok: true });
      }),
      DELETE: defineHandler({}, async ({ params, session }) => {
        await deleteSaved(session.user.id, params.id);
        return Response.json({ ok: true });
      }),
    },
  },
});
