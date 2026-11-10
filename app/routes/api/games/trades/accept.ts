import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { acceptTradeApi } from '@/lib/cards/steam.contract';
import { tradeActionBody } from '@/lib/cards/steam-schema';
import { acceptTrade } from '@/lib/cards/trades.server';
import { tradeResponse } from '@/lib/cards/trade-api.server';

/** POST /api/games/trades/accept — accept an offer made to you; the cards swap in one step. */
export const Route = createFileRoute('/api/games/trades/accept')({
  server: {
    handlers: {
      POST: implement(
        acceptTradeApi,
        { rateLimit: 'write', body: tradeActionBody },
        ({ userId, body }) =>
          tradeResponse(async () => {
            await acceptTrade({ userId, tradeId: body.tradeId });
            return { ok: true };
          }),
      ),
    },
  },
});
