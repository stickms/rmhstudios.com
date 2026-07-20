import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { folderUpdateSchema } from '@/lib/saves/types';
import { updateFolder, deleteFolder } from '@/lib/saves/saves.server';

/**
 * PATCH  /api/saves/folders/:id { name?, sortOrder? } — rename / reorder.
 * DELETE /api/saves/folders/:id — delete (items re-homed to the default).
 */
export const Route = createFileRoute('/api/saves/folders/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
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
          const parsed = folderUpdateSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          try {
            await updateFolder(session.user.id, params.id, parsed.data);
          } catch (e) {
            if (e instanceof Error && e.message === 'folder-not-found') {
              return Response.json({ error: 'Folder not found' }, { status: 404 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Folder update error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          try {
            await deleteFolder(session.user.id, params.id);
          } catch (e) {
            if (e instanceof Error && e.message === 'folder-not-found') {
              return Response.json({ error: 'Folder not found' }, { status: 404 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Folder delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
