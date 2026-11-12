import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { buyCard } from '@/lib/cards/market.server';
import { marketResponse } from '@/lib/cards/market-api.server';

/** POST /api/games/market/buy — buy one listing; the card and the coins move together. */
export const route = apiRoute('/api/games/market/buy', {
  POST: defineHandler(
    { rateLimit: 'write', body: z.object({ listingId: z.string().min(1).max(64) }) },
    ({ userId, body }) =>
      marketResponse(() => buyCard({ buyerId: userId, listingId: body.listingId })),
  ),
});
