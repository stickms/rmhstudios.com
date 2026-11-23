import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { deleteMedListItemApi, patchMedListItemApi } from '@features/medschools/medschools.contract';
import { patchListItemBody } from './me-schemas';
import { LISTS_WRITE_LIMIT, notFound } from './me-http.server';
import { deleteItem, patchItem } from './lists.server';

/** PATCH changes an item's note or program; DELETE removes it. The list and the item must both be the caller's. */
export const route = apiRoute('/api/medschools/me/lists/$id/items/$itemId', {
  PATCH: implement(
    patchMedListItemApi,
    { rateLimit: LISTS_WRITE_LIMIT, body: patchListItemBody },
    async ({ session, body, params }) => {
      const r = await patchItem(session.user.id, params.id ?? '', params.itemId ?? '', body);
      if (r === 'duplicate') return Response.json({ ...refusalBody('MEDSCHOOLS_LIST_DUPLICATE') }, { status: 409 });
      return r ?? notFound();
    },
  ),
  DELETE: implement(
    deleteMedListItemApi,
    { rateLimit: LISTS_WRITE_LIMIT },
    async ({ session, params }) =>
      (await deleteItem(session.user.id, params.id ?? '', params.itemId ?? '')) ?? notFound(),
  ),
});
