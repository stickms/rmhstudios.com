import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { cancelCard } from '@/lib/cards/market.server';
import { marketResponse } from '@/lib/cards/market-api.server';

/** POST /api/games/market/cancel — take your listing down and get the card back. */
export const Route = createFileRoute('/api/games/market/cancel')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ listingId: z.string().min(1).max(64) }) },
        ({ userId, body }) =>
          marketResponse(async () => {
            await cancelCard({ sellerId: userId, listingId: body.listingId });
            return { ok: true };
          }),
      ),
    },
  },
});
