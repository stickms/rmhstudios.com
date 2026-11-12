import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteListApi, getListDetailApi, updateListApi } from '@/lib/lists/lists.contract';
import { listUpdateSchema } from '@/lib/lists/constants';
import { getListDetail, updateList, deleteList, ListError } from '@/lib/lists/lists.server';

/**
 * GET    /api/lists/:id — list detail + members (honors visibility).
 * PATCH  /api/lists/:id — update name/bio/visibility/pinned (owner).
 * DELETE /api/lists/:id — delete (owner).
 */
export const route = apiRoute('/api/lists/$id', {
  GET: implement(getListDetailApi, { auth: 'optional' }, async ({ params, session }) => {
    const detail = await getListDetail(params.id, session?.user.id ?? null);
    if (!detail) return Response.json({ error: 'Not found' }, { status: 404 });
    return detail;
  }),
  PATCH: implement(
    updateListApi,
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
      return { ok: true as const };
    },
  ),
  DELETE: implement(
    deleteListApi,
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:lists/:id' } },
    async ({ params, session }) => {
      try {
        await deleteList(session.user.id, params.id);
      } catch (e) {
        if (e instanceof ListError) return Response.json({ error: e.message }, { status: 404 });
        throw e;
      }
      return { ok: true as const };
    },
  ),
});
