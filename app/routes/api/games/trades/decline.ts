import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { declineTradeApi } from '@/lib/cards/steam.contract';
import { tradeActionBody } from '@/lib/cards/steam-schema';
import { declineTrade } from '@/lib/cards/trades.server';
import { tradeResponse } from '@/lib/cards/trade-api.server';

/** POST /api/games/trades/decline — decline an offer made to you. */
export const Route = createFileRoute('/api/games/trades/decline')({
  server: {
    handlers: {
      POST: implement(
        declineTradeApi,
        { rateLimit: 'write', body: tradeActionBody },
        ({ userId, body }) =>
          tradeResponse(async () => {
            await declineTrade({ userId, tradeId: body.tradeId });
            return { ok: true };
          }),
      ),
    },
  },
});
