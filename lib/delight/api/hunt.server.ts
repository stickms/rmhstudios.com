import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getHuntState, huntLeaderboard } from '@/lib/delight/hunt.server';

/** GET /api/hunt — the member's progress in the live hunt (starting their clock on first look) and the leaderboard. */
export const route = apiRoute('/api/hunt', {
  GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
    const state = await getHuntState(userId);
    const board = state ? await huntLeaderboard() : null;
    return Response.json({ state, board }, { headers: { 'Cache-Control': 'private, no-store' } });
  }),
});
