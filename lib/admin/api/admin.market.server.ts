import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { listHeldListings } from '@/lib/market/market.server';

/**
 * GET /api/admin/market — marketplace listings HELD for anomaly review (a buy
 * at ≥10× the item's 30-day median froze them), oldest first. Admin only.
 */
export const route = apiRoute('/api/admin/market', {
  GET: implement(C.listAdminHeldListingsApi, { auth: 'admin' }, async () =>
    Response.json({ listings: await listHeldListings() }),
  ),
});
