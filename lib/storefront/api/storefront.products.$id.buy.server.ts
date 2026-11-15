import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { buyStorefrontProductApi } from '@/lib/storefront/storefront.contract';
import { buyProduct, StorefrontError } from '@/lib/storefront/storefront.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

/** POST /api/storefront/products/$id/buy — purchase a product with coins. */
export const route = apiRoute('/api/storefront/products/$id/buy', {
  POST: implement(
    buyStorefrontProductApi,
    { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'storefront-buy' } },
    async ({ userId, params }) => {
      try {
        const result = await buyProduct(params.id, userId);
        await grantAchievement(result.creatorId, 'creator.first_sale').catch(() => {});
        const { creatorId: _creatorId, ...payload } = result;
        return { success: true as const, ...payload };
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
        throw error;
      }
    },
  ),
});
