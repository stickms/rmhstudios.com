import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { listItem, browse, priceHistory, MarketError, type BrowseSort } from '@/lib/market/market.server';
import { MIN_PRICE, MAX_PRICE } from '@/lib/market/tradable';

/**
 * POST /api/market/listings — list one of your tradable inventory items for sale.
 * GET  /api/market/listings?item=&sort= — browse active listings (public).
 */
const createSchema = z.object({
  itemId: z.string().min(1).max(64),
  priceCoins: z.number().int().min(MIN_PRICE).max(MAX_PRICE),
});

const SORTS: BrowseSort[] = ['price_asc', 'price_desc', 'recent'];

export const Route = createFileRoute('/api/market/listings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'market-browse' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const url = new URL(request.url);
          const item = url.searchParams.get('item');
          const sortParam = url.searchParams.get('sort');
          const sort = SORTS.includes(sortParam as BrowseSort) ? (sortParam as BrowseSort) : 'recent';
          const itemId = item && item.length <= 64 ? item : null;

          // When filtered to one item, include its SOLD-price history for the sparkline.
          const [listings, history] = await Promise.all([
            browse({ itemId, sort }),
            itemId ? priceHistory(itemId) : Promise.resolve(null),
          ]);
          return Response.json({ listings, history });
        } catch (error) {
          console.error('market browse error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 15, windowMs: 60_000, prefix: 'market-list' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const listing = await listItem({
            sellerId: session.user.id,
            itemId: parsed.data.itemId,
            priceCoins: parsed.data.priceCoins,
          });
          return Response.json({ success: true, listing });
        } catch (error) {
          if (error instanceof MarketError) {
            return Response.json({ error: error.message, code: error.code }, { status: error.status });
          }
          console.error('market list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
