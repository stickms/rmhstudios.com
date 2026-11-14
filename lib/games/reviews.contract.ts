/** Contracts for game reviews and review votes (redesign audit C1, batch 3). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  RatingAgg,
  ReviewView,
  reviewUpsertSchema,
  reviewVoteSchema,
} from '@/lib/games/reviews';

/** Reviews + the rating aggregate. `sort` defaults to `helpful`. 404 for an unknown game. */
export const listGameReviewsApi =
  endpoint<{
    query: {
      sort?:
        | 'helpful'
        | 'recent';
    };
    res: {
      reviews: ReviewView[];
      agg: RatingAgg;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/games/$id/reviews',
    },
  );

/** Upsert the caller's review. */
export const upsertGameReviewApi =
  endpoint<{
    body: z.infer<
      typeof reviewUpsertSchema
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/games/$id/review',
    },
  );

/** Mark a review helpful or not. */
export const voteReviewApi =
  endpoint<{
    body: z.infer<
      typeof reviewVoteSchema
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/reviews/$id/vote',
    },
  );

/** Clear the caller's vote. */
export const unvoteReviewApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/reviews/$id/vote',
    },
  );
