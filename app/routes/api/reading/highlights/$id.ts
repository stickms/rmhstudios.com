import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { patchHighlightSchema } from '@/lib/reading/schema';
import { deleteHighlight, updateHighlight } from '@/lib/reading/highlights.server';

/**
 * PATCH  /api/reading/highlights/:id — edit the note or flip public/private.
 * DELETE /api/reading/highlights/:id — remove a highlight (and its L8 contribution).
 * Both are owner-only; another member's id is indistinguishable from a missing one.
 */
export const Route = createFileRoute('/api/reading/highlights/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: patchHighlightSchema },
        async ({ userId, params, body }) => {
          const highlight = await updateHighlight(userId, params.id, body);
          if (!highlight) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ highlight });
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const ok = await deleteHighlight(userId, params.id);
        if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ ok: true });
      }),
    },
  },
});
