/**
 * RMHHomes — "Tell me if the price drops" on a saved listing.
 *
 *   PUT /api/homes/listings/$id/favorite/alerts   → { enabled } on the caller's own favourite (404 when not saved)
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { setPriceAlerts } from '@/lib/homes/prices.server';
import { setHomePriceAlertsApi } from '@/lib/homes/prices.contract';
import { setPriceAlertsBody } from '@/lib/homes/prices-schema';

export const route = apiRoute('/api/homes/listings/$id/favorite/alerts', {
  PUT: implement(
    setHomePriceAlertsApi,
    { rateLimit: 'write', body: setPriceAlertsBody },
    async ({ params, session, body }) => {
      const ok = await setPriceAlerts(session.user.id, params.id, body.enabled);
      if (!ok) return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
      return Response.json({ ok: true as const, priceAlerts: body.enabled });
    },
  ),
});
