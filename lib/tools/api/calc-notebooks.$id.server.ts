import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteCalcNotebookApi, updateCalcNotebookApi } from '@/lib/tools/calc-notebooks.contract';
import { calcNotebookSchema } from '@/lib/tools/schemas';
import { deleteNotebook, updateNotebook } from '@/lib/tools/tools.server';

/** PUT/DELETE /api/calc-notebooks/:id — edit or remove one of the caller's own rows. */
export const route = apiRoute('/api/calc-notebooks/$id', {
  PUT: implement(
    updateCalcNotebookApi,
    { rateLimit: 'write', body: calcNotebookSchema },
    async ({ userId, params, body }) =>
      (await updateNotebook(userId, params.id, body))
        ? { ok: true as const }
        : Response.json({ error: 'Not found' }, { status: 404 }),
  ),
  DELETE: implement(deleteCalcNotebookApi, { rateLimit: 'write' }, async ({ userId, params }) =>
    (await deleteNotebook(userId, params.id))
      ? { ok: true as const }
      : Response.json({ error: 'Not found' }, { status: 404 }),
  ),
});
