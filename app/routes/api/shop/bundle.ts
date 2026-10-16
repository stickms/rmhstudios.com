import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { BundleError, purchaseBundle } from '@/lib/shop/daily-shop.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

const schema = z.object({ itemIds: z.array(z.string().min(1).max(64)).length(3) });

const STATUS = {
  INVALID_BUNDLE: 400,
  INSUFFICIENT_COINS: 400,
  ALREADY_OWNED: 409,
  ALREADY_PURCHASED: 409,
} as const;

/**
 * POST /api/shop/bundle { itemIds: [3 ids] } — buy three of today's featured
 * items at the bundle price (C3). The price is computed here from the catalog;
 * the client never sends one. All three items are granted, or none.
 */
export const Route = createFileRoute('/api/shop/bundle')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'shop-bundle', scope: 'user' },
          body: schema,
          idempotent: true,
        },
        async ({ userId, body }) => {
          try {
            const out = await purchaseBundle(userId, body.itemIds);
            await grantAchievement(userId, 'economy.first_purchase');
            return Response.json({ success: true, ...out });
          } catch (e) {
            if (e instanceof BundleError)
              return Response.json({ error: e.code }, { status: STATUS[e.code] });
            throw e;
          }
        },
      ),
    },
  },
});
