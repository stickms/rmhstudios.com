import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listGameSavesApi } from '@/lib/game-saves/saves.contract';
import { listSaves } from '@/lib/game-saves/snapshots.server';

/** GET /api/game-saves — the member's cloud saves, one row per game: time, size and snapshot count, never a blob. */
export const route =
  apiRoute(
    '/api/game-saves',
    {
      GET: implement(
        listGameSavesApi,
        {
          rateLimit:
            'read',
        },
        async ({
          userId,
        }) => ({
          saves:
            await listSaves(
              userId,
            ),
        }),
      ),
    },
  );
