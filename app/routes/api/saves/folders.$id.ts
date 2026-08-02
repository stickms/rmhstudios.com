import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { folderUpdateSchema } from '@/lib/saves/types';
import { updateFolder, deleteFolder } from '@/lib/saves/saves.server';

/**
 * PATCH  /api/saves/folders/:id { name?, sortOrder? } — rename / reorder.
 * DELETE /api/saves/folders/:id — delete (items re-homed to the default).
 */
export const Route = createFileRoute('/api/saves/folders/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        {
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'saves-folder' },
          body: folderUpdateSchema,
        },
        async ({ params, session, body }) => {
          try {
            await updateFolder(session.user.id, params.id, body);
          } catch (e) {
            if (e instanceof Error && e.message === 'folder-not-found') {
              return Response.json({ error: 'Folder not found' }, { status: 404 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        },
      ),

      DELETE: defineHandler({}, async ({ params, session }) => {
        try {
          await deleteFolder(session.user.id, params.id);
        } catch (e) {
          if (e instanceof Error && e.message === 'folder-not-found') {
            return Response.json({ error: 'Folder not found' }, { status: 404 });
          }
          throw e;
        }
        return Response.json({ ok: true });
      }),
    },
  },
});
