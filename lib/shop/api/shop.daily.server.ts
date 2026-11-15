import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getDailyShop } from '@/lib/shop/daily-shop.server';

/**
 * GET /api/shop/daily — today's featured cosmetics (C2) with a rotation
 * countdown. Signed-in callers also get ownership flags and their balance.
 */
export const route = apiRoute('/api/shop/daily', {
  GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) =>
    Response.json(await getDailyShop(userId), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  ),
});
