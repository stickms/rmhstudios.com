/** Contract for the library home's Friends section. Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';
import type { FriendActivity } from '@/lib/games/activity-types';

/** Who the signed-in member follows is in a game now, and what they did lately (their own follows only). */
export const getFriendActivityApi = endpoint<{ res: FriendActivity }>()({
  method: 'GET',
  path: '/api/games/friends/activity',
});
