import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { placeBuyOrder } from '@/lib/cards/market.server';
import { marketResponse } from '@/lib/cards/market-api.server';

/** POST /api/games/market/order — a standing offer to buy a card for up to a price (no coins are held). */
export const Route = createFileRoute('/api/games/market/order')({
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
        ({ userId, body }) => marketResponse(() => placeBuyOrder({ buyerId: userId, ...body })),
      ),
    },
  },
});
