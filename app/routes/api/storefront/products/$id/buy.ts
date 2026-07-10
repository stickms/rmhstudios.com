import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { buyProduct, StorefrontError } from '@/lib/storefront/storefront.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

/** POST /api/storefront/products/$id/buy — purchase a product with coins. */
export const Route = createFileRoute('/api/storefront/products/$id/buy')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'storefront-buy' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const result = await buyProduct(params.id, session.user.id);
          await grantAchievement(result.creatorId, 'creator.first_sale').catch(() => {});
          const { creatorId: _creatorId, ...payload } = result;
          return Response.json({ success: true, ...payload });
        } catch (error) {
          if (error instanceof StorefrontError) {
            const map: Record<string, [string, number]> = {
              UNAVAILABLE: ['Product unavailable', 404],
              OWN_PRODUCT: ["You can't buy your own product", 400],
              ALREADY_OWNED: ['You already own this', 409],
              INSUFFICIENT_COINS: ['Not enough coins', 400],
            };
            const [msg, status] = map[error.message] ?? ['Purchase failed', 400];
            return Response.json({ error: msg }, { status });
          }
          console.error('Storefront buy error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
