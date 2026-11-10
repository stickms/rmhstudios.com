/** Contracts for buying and cancelling market listings (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

/** 200 SOLD, or 202 HELD (flagged for review, no coins moved). */
export const buyListingApi = endpoint<{
  res:
    | { success: true; status: 'SOLD'; itemId: string; price: number }
    | { status: 'HELD'; message: string };
}>()({ method: 'POST', path: '/api/market/listings/$id/buy' });

export const cancelListingApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/market/listings/$id',
});
