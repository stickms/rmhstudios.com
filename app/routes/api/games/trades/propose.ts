import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { proposeTrade } from '@/lib/cards/trades.server';
import { tradeResponse } from '@/lib/cards/trade-api.server';

const item = z.object({
  gameId: z.string().min(1).max(64),
  cardIndex: z.number().int().min(0).max(63),
  foil: z.boolean().default(false),
  qty: z.number().int().min(1).max(99),
});

/** POST /api/games/trades/propose — offer cards to someone you follow or who follows you. */
export const Route = createFileRoute('/api/games/trades/propose')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({
            toId: z.string().min(1).max(64),
            give: z.array(item).max(12),
            ask: z.array(item).max(12),
          }),
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
