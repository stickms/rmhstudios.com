import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { friendsApi } from '@/lib/rmhmusic/social/friends.contract';
import type { FriendsLimit } from '@/lib/rmhmusic/learn/social/friends';
import { friendsQuery, friendsRes } from '@/lib/rmhmusic/learn/social/friends-schema';
import { loadFriendsProgress } from '@/lib/rmhmusic/learn/social/friends.server';

/**
 * `GET /api/rmhmusic/friends?limit=3|100` — friends' progress (Phase 6): mutual follows who share
 * theirs, each with a name, an avatar, the Daily challenge streak, finished units and song bests.
 * Empty unless the viewer's own friends switch is on. Per viewer, so no HTTP cache; the server
 * caches only the mutuals list (`friends.server.ts`).
 *
 * The result goes out through `friendsRes.parse`, which drops every key the schema does not name:
 * that, not `implement()`'s `response` check (dev and test only), is the leak filter.
 */
export const route = apiRoute('/api/rmhmusic/friends', {
  GET: implement(
    friendsApi,
    { rateLimit: 'read', query: friendsQuery, response: friendsRes },
    async ({ userId, query }) =>
      friendsRes.parse(
        await loadFriendsProgress(userId, query.limit as FriendsLimit, Date.now()),
      ),
  ),
});
