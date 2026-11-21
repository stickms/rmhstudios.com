import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listSaveSnapshotsApi } from '@/lib/game-saves/saves.contract';
import { isSharedSaveGame } from '@/lib/game-saves/registry';
import { listSnapshots } from '@/lib/game-saves/snapshots.server';

/** GET /api/game-saves/$gameId/snapshots — the member's version history for one game, newest first, no blobs. */
export const route = apiRoute('/api/game-saves/$gameId/snapshots', {
  GET: implement(
    listSaveSnapshotsApi,
    {
      rateLimit: 'read',
    },
    async ({ params, userId }) => {
      if (!isSharedSaveGame(params.gameId))
        return Response.json(
          {
            error: 'Unknown game',
          },
          {
            status: 404,
          },
        );
      return {
        snapshots: await listSnapshots(userId, params.gameId),
      };
    },
  ),
});
