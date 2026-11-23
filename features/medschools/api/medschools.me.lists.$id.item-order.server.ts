import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { putMedListItemOrderApi } from '@features/medschools/medschools.contract';
import { putItemOrderBody } from './me-schemas';
import { LISTS_WRITE_LIMIT, notFound } from './me-http.server';
import { reorderItems } from './lists.server';

/** PUT the full item id list in the new order; a differing set is a 409 and the client refetches. */
export const route = apiRoute('/api/medschools/me/lists/$id/item-order', {
  PUT: implement(
    putMedListItemOrderApi,
    { rateLimit: LISTS_WRITE_LIMIT, body: putItemOrderBody },
    async ({ session, body, params }) => {
      const r = await reorderItems(session.user.id, params.id ?? '', body.ids);
      if (r === 'stale') return Response.json({ ...refusalBody('MEDSCHOOLS_STALE_ORDER') }, { status: 409 });
      return r ?? notFound();
    },
  ),
});
