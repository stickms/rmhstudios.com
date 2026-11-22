/**
 * Contracts for /api/saved-replies/** (sprint 05 #13). Client-safe: request types
 * come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { SavedReplyRow } from '@/lib/messages/saved-replies';
import type {
  createSavedReplyBody,
  patchSavedReplyBody,
  reorderSavedRepliesBody,
} from '@/lib/messages/saved-replies-schema';

/** The caller's saved replies, in their own order. */
export const listSavedRepliesApi = endpoint<{
  res: { replies: SavedReplyRow[] };
}>()({ method: 'GET', path: '/api/saved-replies' });

/** 201: the saved row. 409 `{ code: 'limit' }` once the member holds 50. */
export const createSavedReplyApi = endpoint<{
  body: z.infer<typeof createSavedReplyBody>;
  res: { reply: SavedReplyRow };
}>()({ method: 'POST', path: '/api/saved-replies' });

export const updateSavedReplyApi = endpoint<{
  body: z.infer<typeof patchSavedReplyBody>;
  res: { reply: SavedReplyRow };
}>()({ method: 'PATCH', path: '/api/saved-replies/$id' });

export const deleteSavedReplyApi = endpoint<{
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/saved-replies/$id' });

/** The new order: `ids` is one comma-separated list. */
export const reorderSavedRepliesApi = endpoint<{
  body: z.infer<typeof reorderSavedRepliesBody>;
  res: { replies: SavedReplyRow[] };
}>()({ method: 'PUT', path: '/api/saved-replies/order' });

/** A reply was inserted into a composer: bumps its use count and recency. */
export const recordSavedReplyUseApi = endpoint<{
  res: { success: true };
}>()({ method: 'POST', path: '/api/saved-replies/$id/use' });
