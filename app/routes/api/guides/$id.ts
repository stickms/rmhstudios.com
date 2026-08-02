import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { guideUpdateSchema } from '@/lib/games/reviews';
import { getGuide, updateGuide, deleteGuide, GameMetaError } from '@/lib/games/meta.server';

/**
 * GET    /api/guides/:id — a guide (published, or the author's draft).
 * PUT    /api/guides/:id — edit (author); a changed body appends a revision.
 * DELETE /api/guides/:id — delete (author).
 */
export const Route = createFileRoute('/api/guides/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const guide = await getGuide(params.id, session?.user.id ?? null);
        if (!guide) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(guide);
      }),
      PUT: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'guides' }, body: guideUpdateSchema },
        async ({ params, session, body }) => {
          try {
            await updateGuide(session.user.id, params.id, body);
          } catch (e) {
            if (e instanceof GameMetaError) {
              return Response.json(
                { error: e.message },
                { status: e.message === 'FORBIDDEN' ? 403 : 404 },
              );
            }
            throw e;
          }
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler({}, async ({ params, session }) => {
        try {
          await deleteGuide(session.user.id, params.id);
        } catch (e) {
          if (e instanceof GameMetaError)
            return Response.json({ error: e.message }, { status: 404 });
          throw e;
        }
        return Response.json({ ok: true });
      }),
    },
  },
});
