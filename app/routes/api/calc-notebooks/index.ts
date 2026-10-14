import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { calcNotebookSchema } from '@/lib/tools/schemas';
import { createNotebook, listNotebooks } from '@/lib/tools/tools.server';

/** GET/POST /api/calc-notebooks — the caller's own notebooks (P21 tools). */
export const Route = createFileRoute('/api/calc-notebooks/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { notebooks: await listNotebooks(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: calcNotebookSchema },
        async ({ userId, body }) => {
          const r = await createNotebook(userId, body);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ id: r.id }, { status: 201 });
        },
      ),
    },
  },
});
