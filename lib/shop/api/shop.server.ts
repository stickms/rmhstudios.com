import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getShopData } from '@/lib/shop/list.server';
import { getShopApi } from '@/lib/shop/shop.contract';

/**
 * GET /api/shop — the catalog plus, for a signed-in user, their coin balance
 * and which items they own/have equipped.
 */
export const route = apiRoute('/api/shop', {
  GET: implement(getShopApi, { auth: 'optional' }, async ({ session }) => {
    return Response.json(await getShopData(session?.user.id ?? null));
  }),
});
