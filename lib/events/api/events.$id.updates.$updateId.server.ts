import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteUpdateApi } from '@/lib/events/updates.contract';
import { deleteUpdate, refused } from '@/lib/events/updates.server';

/** DELETE /api/events/$id/updates/$updateId — the author (or an admin) removes an update within ten minutes. */
export const route = apiRoute('/api/events/$id/updates/$updateId', {
  DELETE: implement(deleteUpdateApi, { rateLimit: 'write' }, async ({ params, userId, isAdmin }) => {
    try {
      await deleteUpdate(params.id, params.updateId, userId, isAdmin);
      return { success: true as const };
    } catch (error) {
      return refused(error);
    }
  }),
});
