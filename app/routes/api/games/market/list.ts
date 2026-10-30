import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { listCard } from '@/lib/cards/market.server';
import { marketResponse } from '@/lib/cards/market-api.server';

/** POST /api/games/market/list — put one of your trading cards on the market. */
export const Route = createFileRoute('/api/games/market/list')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({
            gameId: z.string().min(1).max(64),
            cardIndex: z.number().int().min(0).max(63),
            foil: z.boolean().default(false),
            priceCoins: z.number().int(),
          }),
        },
        ({ userId, body }) =>
          marketResponse(async () => {
            const l = await listCard({ sellerId: userId, ...body });
            return { id: l.id, priceCoins: l.priceCoins };
          }),
      ),
    },
  },
});
