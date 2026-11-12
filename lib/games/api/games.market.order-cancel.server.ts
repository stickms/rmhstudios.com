import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { cancelBuyOrder } from '@/lib/cards/market.server';
import { marketResponse } from '@/lib/cards/market-api.server';

/** POST /api/games/market/order-cancel — withdraw one of your open buy orders. */
export const route = apiRoute('/api/games/market/order-cancel', {
  POST: defineHandler(
    { rateLimit: 'write', body: z.object({ orderId: z.string().min(1).max(64) }) },
    ({ userId, body }) =>
      marketResponse(async () => {
        await cancelBuyOrder({ buyerId: userId, orderId: body.orderId });
        return { ok: true };
      }),
  ),
});
