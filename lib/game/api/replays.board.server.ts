import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { replayBoardApi } from '@/lib/game/replay-library.contract';
import { BOARD_SIZE, replayBoardQuery } from '@/lib/game/replay-library-schema';
import { listReplaysForGame } from '@/lib/replays.server';

/**
 * GET /api/replays/board?game= — the top public replays of a game's current version. Public, so it is cached for
 * anonymous callers only: a signed-in response is filtered by the viewer's blocks and must never be stored for
 * anyone else (`Vary: Cookie` keeps a shared cache from handing one to the other).
 */
export const route = apiRoute('/api/replays/board', {
  GET: implement(
    replayBoardApi,
    { auth: 'optional', rateLimit: 'read', query: replayBoardQuery },
    async ({ userId, query }) => {
      const items = await listReplaysForGame(query.game, BOARD_SIZE, userId);
      return Response.json(
        { items },
        {
          headers: {
            'Cache-Control': userId ? 'private, no-store' : 'public, max-age=30, s-maxage=60',
            Vary: 'Cookie',
          },
        },
      );
    },
  ),
});
