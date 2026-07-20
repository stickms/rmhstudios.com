import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'market-buy' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const result = await buyListing({ buyerId: session.user.id, listingId: params.id });

          if (result.status === 'HELD') {
            return Response.json(
              {
                status: 'HELD',
                message: 'This listing was flagged for review and is temporarily on hold. No coins were charged.',
              },
              { status: 202 },
            );
          }
          return Response.json({ success: true, status: 'SOLD', itemId: result.itemId, price: result.price });
        } catch (error) {
          if (error instanceof EscrowError && error.code === 'INSUFFICIENT_COINS') {
            return Response.json({ error: 'Not enough coins', code: 'INSUFFICIENT_COINS' }, { status: 400 });
          }
          if (error instanceof MarketError) {
            return Response.json({ error: error.message, code: error.code }, { status: error.status });
          }
          console.error('market buy error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
