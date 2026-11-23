import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { putMedListOrderApi } from '@features/medschools/medschools.contract';
import { putListOrderBody } from './me-schemas';
import { LISTS_WRITE_LIMIT } from './me-http.server';
import { reorderLists } from './lists.server';

/** PUT the full id list in the new order. A set that differs from the stored one is a 409 and the client refetches. */
export const route = apiRoute('/api/medschools/me/list-order', {
  PUT: implement(
    putMedListOrderApi,
    { rateLimit: LISTS_WRITE_LIMIT, body: putListOrderBody },
    async ({ session, body }) => {
      const r = await reorderLists(session.user.id, body.ids);
      if (r === 'stale') return Response.json({ ...refusalBody('MEDSCHOOLS_STALE_ORDER') }, { status: 409 });
      return { lists: r };
    },
  ),
});
