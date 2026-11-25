/**
 * Contracts for the saved-home note and the side-by-side comparison (s12 10). Client-safe: types only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { PriceChange } from '@/lib/homes/prices';
import type { Listing } from '@/lib/homes/types';
import type { compareQuery, favoriteNoteBody } from './compare-schema';

/** Write (or, with an empty note, clear) the caller's private note on a listing they saved. 404 when it is not saved. */
export const setHomeFavoriteNoteApi = endpoint<{
  body: z.infer<typeof favoriteNoteBody>;
  res: { ok: true; note: string | null };
}>()({
  method: 'PUT',
  path: '/api/homes/listings/$id/favorite/note',
});

/**
 * Up to four of the caller's saved listings with their notes. `missing` counts ids that are not in the caller's
 * saved homes (dropped from the view). More than four distinct ids is refused with `HOME_COMPARE_TOO_MANY`.
 */
export const compareHomeFavoritesApi = endpoint<{
  query: z.infer<typeof compareQuery>;
  res: {
    listings: Listing[];
    notes: Record<string, string | null>;
    /** The last recorded price change of each listing, or null when its price never changed. */
    changes: Record<string, PriceChange | null>;
    missing: number;
  };
}>()({
  method: 'GET',
  path: '/api/homes/compare',
});
