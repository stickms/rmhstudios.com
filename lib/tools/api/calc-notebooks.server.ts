import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createCalcNotebookApi, listCalcNotebooksApi } from '@/lib/tools/calc-notebooks.contract';
import { calcNotebookSchema } from '@/lib/tools/schemas';
import { createNotebook, listNotebooks } from '@/lib/tools/tools.server';

/** GET/POST /api/calc-notebooks — the caller's own notebooks (P21 tools). */
export const route = apiRoute('/api/calc-notebooks', {
  GET: implement(listCalcNotebooksApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(
      { notebooks: await listNotebooks(userId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  ),
  POST: implement(
    createCalcNotebookApi,
    { rateLimit: 'write', body: calcNotebookSchema },
    async ({ userId, body }) => {
      const r = await createNotebook(userId, body);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      return Response.json({ id: r.id }, { status: 201 });
    },
  ),
});
