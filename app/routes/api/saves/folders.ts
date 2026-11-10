import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { createSaveFolderApi, listSaveFoldersApi } from '@/lib/saves/saves.contract';
import { folderCreateSchema } from '@/lib/saves/types';
import { listFolders, createFolder } from '@/lib/saves/saves.server';

/**
 * GET  /api/saves/folders — the caller's folders (+ item counts).
 * POST /api/saves/folders { name } — create a folder.
 */
export const Route = createFileRoute('/api/saves/folders')({
  server: {
    handlers: {
      GET: implement(listSaveFoldersApi, {}, async ({ session }) => {
        return Response.json({ folders: await listFolders(session.user.id) });
      }),

      POST: implement(
        createSaveFolderApi,
        {
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'saves-folder' },
          body: folderCreateSchema,
        },
        async ({ session, body }) => {
          try {
            const folder = await createFolder(session.user.id, body.name);
            return Response.json({ folder });
          } catch (e) {
            if (e instanceof Error && e.message === 'folder-limit') {
              return Response.json({ error: 'Folder limit reached' }, { status: 400 });
            }
            throw e;
          }
        },
      ),
    },
  },
});
