/**
 * Contracts for the bodyless /api/homes/** calls (redesign audit C1, batch 6):
 * the watch list, listing read / delete and the favorite toggle. The writes that
 * hand-parse their bodies (listing create / edit, watch create / patch), the
 * filtered search and the geocoder stay raw fetches. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { Listing, Watch } from '@/lib/homes/types';

export const listHomeWatchesApi = endpoint<{ res: { watches: Watch[] } }>()({
  method: 'GET',
  path: '/api/homes/watches',
});

/** One listing for the viewer (the owner also sees `isOwner`). 404 when missing. */
export const getHomeListingApi = endpoint<{ res: { listing: Listing } }>()({
  method: 'GET',
  path: '/api/homes/listings/$id',
});

/** Owner only. 404 when not found. */
export const deleteHomeListingApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/homes/listings/$id',
});

export const favoriteHomeListingApi = endpoint<{ res: { ok: true } }>()({
  method: 'POST',
  path: '/api/homes/listings/$id/favorite',
});

export const unfavoriteHomeListingApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/homes/listings/$id/favorite',
});
