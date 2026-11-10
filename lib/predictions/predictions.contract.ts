/**
 * Contracts for /api/predictions (list, submit, comments) — redesign audit C1,
 * batch 3. The trade route keeps its own wrapper. Client-safe: request types
 * come from the zod schemas and response types from the server modules, both
 * by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { addComment, commentSchema, listComments } from '@/lib/forecasting/forecasting.server';
import type {
  createPredictionSchema,
  moderateSchema,
  predictionListQuery,
  resolveSchema,
} from '@/lib/predictions/predictions-schema';
import type { SerializedMarket } from '@/lib/predictions/predictions.server';

type CommentList = NonNullable<Awaited<ReturnType<typeof listComments>>>;
type NewComment = NonNullable<Awaited<ReturnType<typeof addComment>>>;

/** `filter` is `open` (default), `resolved` or `mine`. */
export const listPredictionsApi = endpoint<{
  query: z.infer<typeof predictionListQuery>;
  res: { markets: SerializedMarket[] };
}>()({ method: 'GET', path: '/api/predictions' });

/** 201. Lands PENDING, awaiting admin approval. */
export const createPredictionApi = endpoint<{
  body: z.infer<typeof createPredictionSchema>;
  res: { market: SerializedMarket };
}>()({ method: 'POST', path: '/api/predictions' });

export const listPredictionCommentsApi = endpoint<{
  res: { comments: CommentList; aiAvailable: boolean };
}>()({ method: 'GET', path: '/api/predictions/$id/comments' });

/** 201. */
export const addPredictionCommentApi = endpoint<{
  body: z.infer<typeof commentSchema>;
  res: { comment: NewComment };
}>()({ method: 'POST', path: '/api/predictions/$id/comments' });

/* ---------------------------- admin moderation ---------------------------- */

/** Admin: PENDING submissions plus OPEN markets, for one moderation page. */
export const adminPredictionQueueApi = endpoint<{
  res: { pending: SerializedMarket[]; open: SerializedMarket[] };
}>()({ method: 'GET', path: '/api/admin/predictions' });

/** Admin: approve or deny a pending submission. */
export const adminModeratePredictionApi = endpoint<{
  body: z.infer<typeof moderateSchema>;
  res: { ok: true; status: string };
}>()({ method: 'POST', path: '/api/admin/predictions/$id/moderate' });

/** Admin: settle an open market to YES or NO. */
export const adminResolvePredictionApi = endpoint<{
  body: z.infer<typeof resolveSchema>;
  res: { ok: true; resolved: boolean; payouts: number };
}>()({ method: 'POST', path: '/api/admin/predictions/$id/resolve' });
