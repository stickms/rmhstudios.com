import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listCardApi } from '@/lib/cards/steam.contract';
import { listCardBody } from '@/lib/cards/steam-schema';
import { listCard } from '@/lib/cards/market.server';
import { marketResponse } from '@/lib/cards/market-api.server';

/** POST /api/games/market/list — put one of your trading cards on the market. */
export const route = apiRoute('/api/games/market/list', {
  POST: implement(
    listCardApi,
    {
      rateLimit: 'write',
      body: listCardBody,
    },
    ({ userId, body }) =>
      marketResponse(async () => {
        const l = await listCard({ sellerId: userId, ...body });
        return { id: l.id, priceCoins: l.priceCoins };
      }),
  ),
});
