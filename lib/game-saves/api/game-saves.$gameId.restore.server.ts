import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import type { BackupError } from '@/lib/game-saves/backup';
import { isSharedSaveGame } from '@/lib/game-saves/registry';
import { restoreGameSaveApi } from '@/lib/game-saves/saves.contract';
import { restoreBody } from '@/lib/game-saves/saves-schema';
import { restore } from '@/lib/game-saves/snapshots.server';

const BACKUP_MESSAGES: Record<BackupError, string> = {
  'not-json': 'The backup is not valid JSON',
  'wrong-format': 'This is not a cloud save backup',
  'wrong-version': 'This backup version is not supported',
  'wrong-game': 'This backup is for a different game',
  'bad-date': 'The backup has no valid save date',
  'bad-save': 'The backup does not contain a save',
  'too-large': 'The backup is too large',
};

/**
 * POST /api/game-saves/$gameId/restore — replace the live save with one of the caller's snapshots (`snapshotId`) or
 * the contents of a backup file (`backup`). The save being replaced is kept first, as `before-restore`.
 */
export const route = apiRoute('/api/game-saves/$gameId/restore', {
  POST: implement(
    restoreGameSaveApi,
    {
      rateLimit: 'write',
      body: restoreBody,
    },
    async ({ params, userId, body }) => {
      const gameId = params.gameId;
      if (!isSharedSaveGame(gameId))
        return Response.json(
          {
            error: 'Unknown game',
          },
          {
            status: 404,
          },
        );

      const result = await restore(
        userId,
        gameId,
        body.snapshotId !== undefined
          ? {
              snapshotId: body.snapshotId,
            }
          : {
              backup: body.backup,
            },
      );
      if (result.ok)
        return {
          success: true as const,
          updatedAt: result.updatedAt.toISOString(),
        };
      if (result.error === 'not-found')
        return Response.json(
          {
            error: 'Snapshot not found',
          },
          {
            status: 404,
          },
        );
      return Response.json(
        {
          error: BACKUP_MESSAGES[result.error],
        },
        {
          status: result.error === 'too-large' ? 413 : 400,
        },
      );
    },
  ),
});
