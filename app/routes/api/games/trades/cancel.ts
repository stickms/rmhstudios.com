import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { cancelTrade } from '@/lib/cards/trades.server';
import { tradeResponse } from '@/lib/cards/trade-api.server';

/** POST /api/games/trades/cancel — withdraw an offer you made. */
export const Route = createFileRoute('/api/games/trades/cancel')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ tradeId: z.string().min(1).max(64) }) },
        ({ userId, body }) =>
          tradeResponse(async () => {
            await cancelTrade({ userId, tradeId: body.tradeId });
            return { ok: true };
          }),
      ),
    },
  },
});
