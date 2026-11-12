import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { removeEntry } from '@/lib/history/history.server';
import { removeHistoryEntryApi } from '@/lib/shop/shop.contract';

/** DELETE /api/history/:id — remove a single history entry. */
export const route = apiRoute('/api/history/$id', {
  DELETE: implement(removeHistoryEntryApi, {}, async ({ params, session }) => {
    await removeEntry(session.user.id, params.id);
    return Response.json({ ok: true });
  }),
});
