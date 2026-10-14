import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { calcNotebookSchema } from '@/lib/tools/schemas';
import { deleteNotebook, updateNotebook } from '@/lib/tools/tools.server';

/** PUT/DELETE /api/calc-notebooks/:id — edit or remove one of the caller's own rows. */
export const Route = createFileRoute('/api/calc-notebooks/$id')({
  server: {
    handlers: {
      PUT: defineHandler(
        { rateLimit: 'write', body: calcNotebookSchema },
        async ({ userId, params, body }) =>
          (await updateNotebook(userId, params.id, body))
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) =>
        (await deleteNotebook(userId, params.id))
          ? Response.json({ ok: true })
          : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
    },
  },
});
