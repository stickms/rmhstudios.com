/**
 * Contracts for the bodyless /api/homes/** calls (redesign audit C1, batch 6):
 * the watch list, listing read / delete and the favorite toggle. The writes that
 * hand-parse their bodies (listing create / edit, watch create / patch), the
 * filtered search and the geocoder stay raw fetches. Client-safe. Batch 8 adds the
listing status change and the AI listing-image calls.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { GeocodeResult } from '@/lib/homes/geo.server';
import type { Listing, ListingStatus, Watch } from '@/lib/homes/types';
import type { createWatchBody, deleteWatchQuery, patchWatchBody } from './watch-schema';

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

/** Create an alert from the browse filters (409 with the reason when the watch cannot be created). */
export const createHomeWatchApi = endpoint<{
  body: z.infer<typeof createWatchBody>;
  res: { ok: true; watch: Watch };
}>()({ method: 'POST', path: '/api/homes/watches' });

/** Pause or resume an alert. */
export const setHomeWatchActiveApi = endpoint<{
  body: z.infer<typeof patchWatchBody>;
  res: { ok: true };
}>()({ method: 'PATCH', path: '/api/homes/watches' });

export const deleteHomeWatchApi = endpoint<{
  query: z.infer<typeof deleteWatchQuery>;
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/homes/watches' });

/** The caller's own (`mine`) or favorited (`favorites`) listings. */
export const listMyHomeListingsApi = endpoint<{
  query: { scope: 'mine' | 'favorites' };
  res: { listings: Listing[] };
}>()({ method: 'GET', path: '/api/homes/listings' });

/** Location autocomplete (signed in). Fewer than 3 characters answers an empty list. */
export const homesGeocodeApi = endpoint<{
  query: { q: string };
  res: { results: GeocodeResult[] };
}>()({ method: 'GET', path: '/api/homes/geocode' });

/** Owner only: mark a listing active, rented, sold or removed. 404 when it is not theirs. */
export const setHomeListingStatusApi = endpoint<{
  body: { status: ListingStatus };
  res: { ok: true };
}>()({ method: 'PATCH', path: '/api/homes/listings/$id' });

/** Whether AI listing-image generation is configured. */
export const getHomeAiImageAvailabilityApi = endpoint<{ res: { available: boolean } }>()({
  method: 'GET',
  path: '/api/homes/ai-image',
});

/** Generate a listing photo from a prompt (paid, rate-limited). */
export const generateHomeAiImageApi = endpoint<{
  body: { prompt: string };
  res: { url: string };
}>()({ method: 'POST', path: '/api/homes/ai-image' });
