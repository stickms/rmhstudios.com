/** Request bodies for the pin endpoints (s09-06). Shared by the routes and `pins.contract.ts` (types only). */
import { z } from 'zod';
import { PIN_LIMIT } from '@/lib/communities/pins';

const postId = z.string().min(1).max(64);

export const pinPostBody = z.object({ postId });

/** The whole new order: exactly the posts pinned now, once each. */
export const reorderPinsBody = z.object({
  postIds: z.array(postId).min(1).max(PIN_LIMIT),
});
