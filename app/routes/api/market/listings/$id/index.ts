import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { cancelListingApi } from '@/lib/market/market.contract';
import { cancelListing, MarketError } from '@/lib/market/market.server';

/**
 * DELETE /api/market/listings/$id — cancel your own active listing (release escrow).
 */
export const Route = createFileRoute('/api/market/listings/$id/')({
  server: {
    handlers: {
      DELETE: implement(
        cancelListingApi,
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'market-cancel' } },
        async ({ userId, params }) => {
          try {
            await cancelListing(params.id, userId);
            return { success: true as const };
          } catch (error) {
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
