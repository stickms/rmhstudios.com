import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { folderCreateSchema } from '@/lib/saves/types';
import { listFolders, createFolder } from '@/lib/saves/saves.server';

/**
 * GET  /api/saves/folders — the caller's folders (+ item counts).
 * POST /api/saves/folders { name } — create a folder.
 */
export const Route = createFileRoute('/api/saves/folders')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        return Response.json({ folders: await listFolders(session.user.id) });
      }),

      POST: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'saves-folder' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = folderCreateSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          try {
            const folder = await createFolder(session.user.id, parsed.data.name);
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
