import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { myReplaysApi } from '@/lib/game/replay-library.contract';
import { myReplaysQuery } from '@/lib/game/replay-library-schema';
import { listMyReplays } from '@/lib/replays.server';

/** GET /api/replays/mine — the caller's own replays, newest first, with the games they have replays for. */
export const route = apiRoute('/api/replays/mine', {
  GET: implement(
    myReplaysApi,
    { rateLimit: 'read', query: myReplaysQuery },
    async ({ userId, query }) =>
      Response.json(await listMyReplays({ userId, game: query.game, cursor: query.cursor }), {
        headers: { 'Cache-Control': 'private, no-store' },
      }),
  ),
});
