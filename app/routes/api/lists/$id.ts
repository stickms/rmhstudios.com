import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listUpdateSchema } from '@/lib/lists/constants';
import { getListDetail, updateList, deleteList, ListError } from '@/lib/lists/lists.server';

/**
 * GET    /api/lists/:id — list detail + members (honors visibility).
 * PATCH  /api/lists/:id — update name/bio/visibility/pinned (owner).
 * DELETE /api/lists/:id — delete (owner).
 */
export const Route = createFileRoute('/api/lists/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const detail = await getListDetail(params.id, session?.user.id ?? null);
        if (!detail) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(detail);
      }),
      PATCH: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'lists' }, body: listUpdateSchema },
        async ({ params, session, body }) => {
          try {
            await updateList(session.user.id, params.id, body);
          } catch (e) {
            if (e instanceof ListError) {
              return Response.json(
                { error: e.message },
                { status: e.message === 'NOT_FOUND' ? 404 : 400 },
              );
            }
            throw e;
          }
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler({}, async ({ params, session }) => {
        try {
          await deleteList(session.user.id, params.id);
        } catch (e) {
          if (e instanceof ListError) return Response.json({ error: e.message }, { status: 404 });
          throw e;
        }
        return Response.json({ ok: true });
      }),
    },
  },
});
