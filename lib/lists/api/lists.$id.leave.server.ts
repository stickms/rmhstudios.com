import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { leaveListApi } from '@/lib/lists/lists-on.contract';
import { leaveList } from '@/lib/lists/lists-on.server';
import { ListError } from '@/lib/lists/lists.server';

/** POST /api/lists/:id/leave — leave a list and stay off it. The owner is not told. */
export const route = apiRoute('/api/lists/$id/leave', {
  POST: implement(leaveListApi, { rateLimit: 'write' }, async ({ params, userId }) => {
    try {
      await leaveList(userId, params.id);
    } catch (e) {
      if (e instanceof ListError) return Response.json({ ...refusalBody('NOT_FOUND') }, { status: 404 });
      throw e;
    }
    return { ok: true as const };
  }),
});
