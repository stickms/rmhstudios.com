import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getFriendActivityApi } from '@/lib/games/friends.contract';
import { getFriendActivity } from '@/lib/games/activity.server';

/**
 * GET /api/games/friends/activity — the library home's Friends section. Signed in only; it reads the caller's own
 * follows and nobody else's, and leaves out blocked, banned, deleted and board-hidden members (activity.server.ts).
 */
export const route = apiRoute('/api/games/friends/activity', {
  GET: implement(getFriendActivityApi, { rateLimit: 'read' }, async ({ userId }) => {
    return Response.json(await getFriendActivity(userId), { headers: { 'Cache-Control': 'private, no-store' } });
  }),
});
