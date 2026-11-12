import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import {
  listItem,
  browse,
  priceHistory,
  MarketError,
  type BrowseSort,
} from '@/lib/market/market.server';
import { watchMarketListing } from '@/lib/discovery/watch.server';
import { MIN_PRICE, MAX_PRICE } from '@/lib/market/tradable';

/**
 * POST /api/market/listings — list one of your tradable inventory items for sale.
 * GET  /api/market/listings?item=&sort= — browse active listings (public). A
 *      signed-in seller also gets their own HELD (under review) listings back,
 *      marked `status: 'HELD'`, so they can see and cancel them.
 */
const createSchema = z.object({
  itemId: z.string().min(1).max(64),
  priceCoins: z.number().int().min(MIN_PRICE).max(MAX_PRICE),
});

const SORTS: BrowseSort[] = ['price_asc', 'price_desc', 'recent'];

export const route = apiRoute('/api/market/listings', {
  GET: defineHandler(
    { auth: 'optional', rateLimit: { limit: 60, windowMs: 60_000, prefix: 'market-browse' } },
    async ({ request, userId }) => {
      const url = new URL(request.url);
      const item = url.searchParams.get('item');
      const sortParam = url.searchParams.get('sort');
      const sort = SORTS.includes(sortParam as BrowseSort) ? (sortParam as BrowseSort) : 'recent';
      const itemId = item && item.length <= 64 ? item : null;

      // When filtered to one item, include its SOLD-price history for the sparkline.
      const [listings, history] = await Promise.all([
        browse({ itemId, sort, viewerId: userId }),
        itemId ? priceHistory(itemId) : Promise.resolve(null),
      ]);
      return Response.json({ listings, history });
    },
  ),

  POST: defineHandler(
    {
      rateLimit: { limit: 15, windowMs: 60_000, prefix: 'market-list' },
      body: createSchema,
      allowEmptyBody: true,
      invalid: () => Response.json({ error: 'Invalid input' }, { status: 400 }),
    },
    async ({ session, body }) => {
      try {
        const listing = await listItem({
          sellerId: session.user.id,
          itemId: body.itemId,
          priceCoins: body.priceCoins,
        });
        void watchMarketListing(listing).catch(() => {});
        return Response.json({ success: true, listing });
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
});
