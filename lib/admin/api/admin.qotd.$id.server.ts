import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { adminRemove } from '@/lib/posts-plus/qotd.server';

/** DELETE /api/admin/qotd/$id - remove a prompt that has not run yet (X4). */
export const route = apiRoute('/api/admin/qotd/$id', {
  DELETE: implement(
    C.removeAdminQotdApi,
    { auth: 'admin', rateLimit: 'write' },
    async ({ params }) => {
      const res = await adminRemove(params.id);
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json({ ok: true });
    },
  ),
});
