import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { searchShopItems } from '@/lib/shop/search.server';

const query = z.object({
  q: z.string().max(60).default(''),
  mode: z.enum(['any', 'tradable', 'giftable']).default('any'),
});

/** GET /api/shop/search?q=&mode= — type-ahead over the cosmetics catalog (max 12 rows). */
export const Route = createFileRoute('/api/shop/search')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query }, async ({ query: q }) =>
        Response.json(
          { items: searchShopItems(q.q, q.mode) },
          { headers: { 'Cache-Control': 'private, max-age=60' } },
        ),
      ),
    },
  },
});
