/**
 * Contract for POST /api/profile/:id/follow (redesign audit C1). Client-safe.
 * `:id` is a user id or handle; the response is the new follow state.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface FollowToggleResult {
  success: true;
  following: boolean;
}

export const toggleFollowApi =
  endpoint<{
    res: FollowToggleResult;
  }>()(
    {
      method:
        'POST',
      path: '/api/profile/$id/follow',
    },
  );
