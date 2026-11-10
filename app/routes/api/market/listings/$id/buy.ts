import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { buyListingApi } from '@/lib/market/market.contract';
import { buyListing, MarketError, EscrowError } from '@/lib/market/market.server';

/**
 * POST /api/market/listings/$id/buy — buy a listing with coins.
 *
 * On success returns { status: 'SOLD', ... }. A price flagged as anomalous
 * returns 202 { status: 'HELD' } — no coins moved, admins notified for review.
 */
export const Route = createFileRoute('/api/market/listings/$id/buy')({
  server: {
    handlers: {
      POST: implement(
        buyListingApi,
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'market-buy' } },
        async ({ userId, params }) => {
          try {
            const result = await buyListing({ buyerId: userId, listingId: params.id });

            if (result.status === 'HELD') {
              return Response.json(
                {
                  status: 'HELD',
                  message:
                    'This listing was flagged for review and is temporarily on hold. No coins were charged.',
                },
                { status: 202 },
              );
            }
            return {
              success: true as const,
              status: 'SOLD' as const,
              itemId: result.itemId,
              price: result.price,
            };
          } catch (error) {
            if (error instanceof EscrowError && error.code === 'INSUFFICIENT_COINS') {
              return Response.json(
                { error: 'Not enough coins', code: 'INSUFFICIENT_COINS' },
                { status: 400 },
              );
            }
            if (error instanceof MarketError) {
              return Response.json(
                { error: error.message, code: error.code },
                { status: error.status },
              );
            }
            throw error;
          }
        },
      ),
    },
  },
});
