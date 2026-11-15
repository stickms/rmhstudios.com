/**
 * Contracts for /api/predictions (list, submit, comments, trade, devil's advocate) —
 * redesign audit C1, batches 3 and 10. Client-safe: request types
 * come from the zod schemas and response types from the server modules, both
 * by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  addComment,
  advocateSchema,
  commentSchema,
  listComments,
} from '@/lib/forecasting/forecasting.server';
import type {
  createPredictionSchema,
  moderateSchema,
  predictionListQuery,
  resolveSchema,
  tradeSchema,
} from '@/lib/predictions/predictions-schema';
import type { SerializedMarket } from '@/lib/predictions/predictions.server';

type CommentList =
  NonNullable<
    Awaited<
      ReturnType<
        typeof listComments
      >
    >
  >;
type NewComment =
  NonNullable<
    Awaited<
      ReturnType<
        typeof addComment
      >
    >
  >;

/** `filter` is `open` (default), `resolved` or `mine`. */
export const listPredictionsApi =
  endpoint<{
    query: z.infer<
      typeof predictionListQuery
    >;
    res: {
      markets: SerializedMarket[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/predictions',
    },
  );

/** 201. Lands PENDING, awaiting admin approval. */
export const createPredictionApi =
  endpoint<{
    body: z.infer<
      typeof createPredictionSchema
    >;
    res: {
      market: SerializedMarket;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/predictions',
    },
  );

export const listPredictionCommentsApi =
  endpoint<{
    res: {
      comments: CommentList;
      aiAvailable: boolean;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/predictions/$id/comments',
    },
  );

/** 201. */
export const addPredictionCommentApi =
  endpoint<{
    body: z.infer<
      typeof commentSchema
    >;
    res: {
      comment: NewComment;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/predictions/$id/comments',
    },
  );

/** Buy YES / NO shares with coins. Refusals carry the market's own message (`{ error }`). */
export const tradePredictionApi =
  endpoint<{
    body: z.infer<
      typeof tradeSchema
    >;
    res: {
      market: SerializedMarket;
      sharesBought: number;
      newBalance: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/predictions/$id/trade',
    },
  );

/** An AI argument for the side the caller does not hold. 400 when they hold it; 503 when unavailable. */
export const devilsAdvocateApi =
  endpoint<{
    body: z.infer<
      typeof advocateSchema
    >;
    res: {
      argument: string;
      side:
        | 'YES'
        | 'NO';
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/predictions/$id/devils-advocate',
    },
  );

/* ---------------------------- admin moderation ---------------------------- */

/** Admin: PENDING submissions plus OPEN markets, for one moderation page. */
export const adminPredictionQueueApi =
  endpoint<{
    res: {
      pending: SerializedMarket[];
      open: SerializedMarket[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/predictions',
    },
  );

/** Admin: approve or deny a pending submission. */
export const adminModeratePredictionApi =
  endpoint<{
    body: z.infer<
      typeof moderateSchema
    >;
    res: {
      ok: true;
      status: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/predictions/$id/moderate',
    },
  );

/** Admin: settle an open market to YES or NO. */
export const adminResolvePredictionApi =
  endpoint<{
    body: z.infer<
      typeof resolveSchema
    >;
    res: {
      ok: true;
      resolved: boolean;
      payouts: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/predictions/$id/resolve',
    },
  );
