/** Contracts for rating a public deck (s12-08). Client-safe: request types by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { RateEligibility, RatingDisplay } from '@/lib/study/deck-ratings';
import type { rateDeckBody } from '@/lib/study/deck-ratings-schema';

/** The viewer's side of a public deck's ratings. */
export interface DeckRatingView {
  /** The aggregate: the count and, from three ratings, the average to one decimal. */
  summary: RatingDisplay;
  /** Copies of the deck that exist now. */
  copies: number;
  /** The viewer's own stars; null when they have not rated it. */
  stars: number | null;
  /** `ok` lets a rating through; `not-studied` has a copy with too few reviews; the rest cannot rate. */
  eligibility: RateEligibility;
  /** Reviews the viewer has logged on their copy. */
  reviews: number;
  /** Reviews a rating needs. */
  needed: number;
}

/** 404 for a deck that is private, taken down or not theirs to meet. */
export const getDeckRatingApi = endpoint<{ res: DeckRatingView }>()({
  method: 'GET',
  path: '/api/study/decks/$id/rating',
});

/** One to five stars; the same member rating again changes their stars. 403 without a studied copy. */
export const rateDeckApi = endpoint<{
  body: z.infer<typeof rateDeckBody>;
  res: { success: true; stars: number | null; summary: RatingDisplay };
}>()({ method: 'PUT', path: '/api/study/decks/$id/rating' });

/** Take the viewer's rating back. */
export const removeDeckRatingApi = endpoint<{
  res: { success: true; stars: number | null; summary: RatingDisplay };
}>()({ method: 'DELETE', path: '/api/study/decks/$id/rating' });
