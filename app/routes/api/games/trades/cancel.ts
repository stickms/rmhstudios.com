import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { cancelTradeApi } from '@/lib/cards/steam.contract';
import { tradeActionBody } from '@/lib/cards/steam-schema';
import { cancelTrade } from '@/lib/cards/trades.server';
import { tradeResponse } from '@/lib/cards/trade-api.server';

/** POST /api/games/trades/cancel — withdraw an offer you made. */
export const Route = createFileRoute('/api/games/trades/cancel')({
  server: {
    handlers: {
      POST: implement(
        cancelTradeApi,
        { rateLimit: 'write', body: tradeActionBody },
        ({ userId, body }) =>
          tradeResponse(async () => {
            await cancelTrade({ userId, tradeId: body.tradeId });
            return { ok: true };
          }),
      ),
    },
  },
});
