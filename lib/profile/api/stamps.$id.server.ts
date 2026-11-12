import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteStampApi } from '@/lib/profile/stamps.contract';
import { deleteOwnStamp } from '@/lib/profile/stamps.server';

/** DELETE /api/stamps/$id — the creator deletes their own stamp; it leaves every wall (P5). */
export const route = apiRoute('/api/stamps/$id', {
  DELETE: implement(deleteStampApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const ok = await deleteOwnStamp(userId, params.id);
    return ok
      ? Response.json({ success: true })
      : Response.json({ error: 'Not found' }, { status: 404 });
  }),
});
