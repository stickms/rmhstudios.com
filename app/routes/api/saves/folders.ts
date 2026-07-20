import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { folderCreateSchema } from '@/lib/saves/types';
import { listFolders, createFolder } from '@/lib/saves/saves.server';

/**
 * GET  /api/saves/folders — the caller's folders (+ item counts).
 * POST /api/saves/folders { name } — create a folder.
 */
export const Route = createFileRoute('/api/saves/folders')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json({ folders: await listFolders(session.user.id) });
        } catch (error) {
          console.error('Folders list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'saves-folder',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

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
        } catch (error) {
          console.error('Folder create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
