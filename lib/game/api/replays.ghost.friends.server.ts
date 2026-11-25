import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { friendGhostsApi } from '@/lib/game/replay.contract';
import { friendGhostsQuery } from '@/lib/game/replay-schema';
import { friendGhostList } from '@/lib/game/friend-ghosts.server';

/**
 * GET /api/replays/ghost/friends?game=neon-driftway&level=1 — the mutual follows who have a ghost on a level, fastest
 * first, with no trace data. Needs a session. Cached for a minute at most, and only privately, so a friend who
 * unfollows or hides drops out of the list quickly and one member's list is never handed to another.
 */
export const route = apiRoute('/api/replays/ghost/friends', {
  GET: implement(friendGhostsApi, { rateLimit: 'read', query: friendGhostsQuery }, async ({ userId, query }) => {
    const friends = await friendGhostList(userId, query.game, query.level);
    return Response.json({ friends }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  }),
});
