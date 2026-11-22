/** Contracts for the follow manager endpoints (/follows). Client-safe: types only, no zod. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { BulkResult, FollowPage } from '@/lib/social/follow-filters';
import type {
  bulkUnfollowBody,
  listFollowsQuery,
  removeFollowersBody,
  undoUnfollowBody,
} from '@/lib/social/follow-manager-schema';

export const listFollowsApi = endpoint<{
  query: z.infer<typeof listFollowsQuery>;
  res: FollowPage;
}>()({ method: 'GET', path: '/api/follows' });

export const removeFollowersApi = endpoint<{
  body: z.infer<typeof removeFollowersBody>;
  res: BulkResult;
}>()({ method: 'POST', path: '/api/follows/remove' });

export const bulkUnfollowApi = endpoint<{
  body: z.infer<typeof bulkUnfollowBody>;
  res: BulkResult;
}>()({ method: 'POST', path: '/api/follows/bulk-unfollow' });

/** Re-follow someone just unfollowed, without a new follow notification to them. */
export const undoUnfollowApi = endpoint<{
  body: z.infer<typeof undoUnfollowBody>;
  res: { following: boolean };
}>()({ method: 'POST', path: '/api/follows/undo' });
