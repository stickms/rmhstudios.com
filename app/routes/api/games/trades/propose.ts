import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { proposeTradeApi } from '@/lib/cards/steam.contract';
import { proposeTradeBody } from '@/lib/cards/steam-schema';
import { proposeTrade } from '@/lib/cards/trades.server';
import { tradeResponse } from '@/lib/cards/trade-api.server';

/** POST /api/games/trades/propose — offer cards to someone you follow or who follows you. */
export const Route = createFileRoute('/api/games/trades/propose')({
  server: {
    handlers: {
      POST: implement(
        proposeTradeApi,
        {
          rateLimit: 'write',
          body: proposeTradeBody,
        },
        ({ userId, body }) =>
          tradeResponse(async () => {
            const t = await proposeTrade({ fromId: userId, ...body });
            return { id: t.id };
          }),
      ),
    },
  },
});
