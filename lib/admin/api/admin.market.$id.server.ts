import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { resolveHeldListing, MarketError } from '@/lib/market/market.server';

const resolveHeldSchema = z.object({ action: z.enum(['release', 'cancel']) });

/**
 * POST /api/admin/market/$id { action } — resolve a HELD listing.
 * `release` puts it back on sale (the frozen buy is not executed); `cancel`
 * closes it and returns the item to the seller. Both 409 if the listing is no
 * longer HELD (the seller cancelled it, or another admin got there first).
 */
export const route = apiRoute('/api/admin/market/$id', {
  POST: implement(
    C.resolveAdminHeldListingApi,
    { auth: 'admin', rateLimit: 'write', body: resolveHeldSchema },
    async ({ params, body, userId }) => {
      try {
        const result = await resolveHeldListing({
          listingId: params.id,
          adminId: userId,
          action: body.action,
        });
        return Response.json({ ok: true, ...result });
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
