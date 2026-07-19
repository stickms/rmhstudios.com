import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { cancelListing, MarketError } from '@/lib/market/market.server';

/**
 * DELETE /api/market/listings/$id — cancel your own active listing (release escrow).
 */
export const Route = createFileRoute('/api/market/listings/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'market-cancel' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          await cancelListing(params.id, session.user.id);
          return Response.json({ success: true });
        } catch (error) {
          if (error instanceof MarketError) {
            return Response.json({ error: error.message, code: error.code }, { status: error.status });
          }
          console.error('market cancel error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
