import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getDailyShop } from '@/lib/shop/daily-shop.server';

/**
 * GET /api/shop/daily — today's featured cosmetics (C2) with a rotation
 * countdown. Signed-in callers also get ownership flags and their balance.
 */
export const Route = createFileRoute('/api/shop/daily')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await getDailyShop(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
    },
  },
});
