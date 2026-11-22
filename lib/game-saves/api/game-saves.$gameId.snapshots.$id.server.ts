import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { backupFileName, toBackupFile } from '@/lib/game-saves/backup';
import { isSharedSaveGame } from '@/lib/game-saves/registry';
import { downloadSaveSnapshotApi } from '@/lib/game-saves/saves.contract';
import { snapshotIdString } from '@/lib/game-saves/saves-schema';
import { getSnapshot } from '@/lib/game-saves/snapshots.server';

/**
 * GET /api/game-saves/$gameId/snapshots/$id — one snapshot as a backup file download. Scoped to the caller and the
 * game, so another member's id is a 404. JSON served as an attachment with `nosniff`: it is never rendered.
 */
export const route = apiRoute('/api/game-saves/$gameId/snapshots/$id', {
  GET: implement(
    downloadSaveSnapshotApi,
    {
      rateLimit: 'read',
    },
    async ({ params, userId }) => {
      const notFound = () =>
        Response.json(
          {
            error: 'Not found',
          },
          {
            status: 404,
          },
        );
      if (!isSharedSaveGame(params.gameId) || !snapshotIdString.safeParse(params.id).success) return notFound();
      const snapshot = await getSnapshot(userId, params.gameId, params.id);
      if (!snapshot) return notFound();

      const backup = toBackupFile(params.gameId, snapshot.createdAt, snapshot.saveData as Record<string, unknown>);
      return new Response(JSON.stringify(backup), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${backupFileName(params.gameId, snapshot.createdAt)}"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        },
      });
    },
  ),
});
