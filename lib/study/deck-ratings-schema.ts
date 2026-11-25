import { z } from 'zod';
import { DECK_SORTS, MAX_STARS, MIN_STARS } from '@/lib/study/deck-ratings';

/** PUT /api/study/decks/$id/rating: one to five whole stars. */
export const rateDeckBody = z.object({
  stars: z.number().int().min(MIN_STARS).max(MAX_STARS),
});

/** GET /api/study/marketplace?q=&sort=: a title/description search and the order (the default is "cards"). */
export const marketplaceQuery = z.object({
  q: z.string().max(100).optional(),
  sort: z.enum(DECK_SORTS).optional(),
});
