import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { shopQuery } from '@/lib/themes/themes-schema';
import { themeShopApi } from '@/lib/themes/themes.contract';
import { listShop } from '@/lib/themes/themes.server';

/** GET /api/themes/shop?sort=top|new — published community themes. */
export const route = apiRoute('/api/themes/shop', {
  GET: implement(
    themeShopApi,
    {
      auth: 'none',
      query: shopQuery,
      // The shop listing is the same for everyone; `?sort=` varies the URL,
      // which is the cache key, so both orderings cache independently.
      cache: { visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 3600 },
    },
    async ({ query }) => {
      return { themes: await listShop(query.sort) };
    },
  ),
});
