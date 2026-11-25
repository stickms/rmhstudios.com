/**
 * RMHHomes — a listing's price history.
 *
 *   GET /api/homes/listings/$id/prices   → { changes } newest first, up to 20 (404 when the listing is not shown)
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { listPriceHistory } from '@/lib/homes/prices.server';
import { getHomeListingPricesApi } from '@/lib/homes/prices.contract';

export const route = apiRoute('/api/homes/listings/$id/prices', {
  GET: implement(getHomeListingPricesApi, { auth: 'optional', rateLimit: 'read' }, async ({ params, session }) => {
    const changes = await listPriceHistory(params.id, session?.user.id ?? null);
    if (!changes) return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
    return Response.json({ changes });
  }),
});
