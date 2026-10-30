import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { acceptTrade } from '@/lib/cards/trades.server';
import { tradeResponse } from '@/lib/cards/trade-api.server';

/** POST /api/games/trades/accept — accept an offer made to you; the cards swap in one step. */
export const Route = createFileRoute('/api/games/trades/accept')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ tradeId: z.string().min(1).max(64) }) },
        ({ userId, body }) =>
          tradeResponse(async () => {
            await acceptTrade({ userId, tradeId: body.tradeId });
            return { ok: true };
          }),
      ),
    },
  },
});
