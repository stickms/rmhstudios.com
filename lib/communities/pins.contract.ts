/** Contracts for pinned community posts (s09-06; client-safe, types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { FeedItem } from '@/lib/feed-types';
import type { pinPostBody, reorderPinsBody } from './pins-schema';

/** What the pinned block and the post menu read: the pinned posts in order, and whether the caller may change them. */
export interface CommunityPinsDTO {
  /** The pinned posts the caller can see, in the moderators' order, through the feed's own serialiser. */
  items: FeedItem[];
  /** Ids of every pin row, in order (a pinned post the caller cannot see is still a place taken). */
  order: string[];
  canModerate: boolean;
  limit: number;
}

/** A private community is a 404 for a non-member, as its feed is. */
export const getCommunityPinsApi = endpoint<{ res: CommunityPinsDTO }>()({
  method: 'GET',
  path: '/api/communities/$slug/pins',
});

/** Moderators only. The fourth pin is a 409 with code `pin_limit`; a post of another community or a comment is a 404. */
export const pinCommunityPostApi = endpoint<{
  body: z.infer<typeof pinPostBody>;
  res: { order: string[] };
}>()({
  method: 'POST',
  path: '/api/communities/$slug/pins',
});

/** Moderators only. Sends the whole new order; it must hold exactly the posts pinned now. */
export const reorderCommunityPinsApi = endpoint<{
  body: z.infer<typeof reorderPinsBody>;
  res: { order: string[] };
}>()({
  method: 'PUT',
  path: '/api/communities/$slug/pins',
});

/** Moderators only. Silent for the author; unpinning something not pinned is a no-op. */
export const unpinCommunityPostApi = endpoint<{ res: { order: string[] } }>()({
  method: 'DELETE',
  path: '/api/communities/$slug/pins/$postId',
});
