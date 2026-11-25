/**
 * Contracts for the listing price endpoints (s11 13). Client-safe: types only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { PriceChange } from '@/lib/homes/prices';
import type { setPriceAlertsBody } from './prices-schema';

/** Price history of an active listing, newest first, up to 20. 404 for a listing the public read would not show. */
export const getHomeListingPricesApi = endpoint<{
  res: { changes: PriceChange[] };
}>()({
  method: 'GET',
  path: '/api/homes/listings/$id/prices',
});

/** Turn "Tell me if the price drops" on or off on the caller's own favourite. 404 when the caller has not saved it. */
export const setHomePriceAlertsApi = endpoint<{
  body: z.infer<typeof setPriceAlertsBody>;
  res: { ok: true; priceAlerts: boolean };
}>()({
  method: 'PUT',
  path: '/api/homes/listings/$id/favorite/alerts',
});
