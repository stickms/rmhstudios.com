import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { cancelTradeApi } from '@/lib/cards/steam.contract';
import { tradeActionBody } from '@/lib/cards/steam-schema';
import { cancelTrade } from '@/lib/cards/trades.server';
import { tradeResponse } from '@/lib/cards/trade-api.server';

/** POST /api/games/trades/cancel — withdraw an offer you made. */
export const route = apiRoute('/api/games/trades/cancel', {
  POST: implement(
    cancelTradeApi,
    { rateLimit: 'write', body: tradeActionBody },
    ({ userId, body }) =>
      tradeResponse(async () => {
        await cancelTrade({ userId, tradeId: body.tradeId });
        return { ok: true };
      }),
  ),
});
