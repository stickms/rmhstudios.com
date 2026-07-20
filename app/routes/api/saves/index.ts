import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { saveEntitySchema, SAVE_ENTITY_TYPES, type SaveEntityType } from '@/lib/saves/types';
import { addSave, removeSave, listSaves, listFolders } from '@/lib/saves/saves.server';

/**
 * GET    /api/saves?folder=&type=&cursor= — the caller's saves + folders.
 * POST   /api/saves  { entityType, entityId, folderId? } — save (idempotent).
 * DELETE /api/saves  { entityType, entityId } — unsave (idempotent).
 */
export const Route = createFileRoute('/api/saves/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const url = new URL(request.url);
          const folderParam = url.searchParams.get('folder'); // id | 'default' | null (all)
          const typeParam = url.searchParams.get('type');
          const cursor = url.searchParams.get('cursor') ?? undefined;
          const type =
            typeParam && (SAVE_ENTITY_TYPES as readonly string[]).includes(typeParam)
              ? (typeParam as SaveEntityType)
              : undefined;

          const [result, folders] = await Promise.all([
            listSaves(session.user.id, {
              folderId: folderParam === 'default' ? 'default' : folderParam || undefined,
              type,
              cursor,
            }),
            listFolders(session.user.id),
          ]);
          return Response.json({ ...result, folders });
        } catch (error) {
          console.error('Saves list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 60,
            windowMs: 60_000,
            prefix: 'saves',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => null);
          const parsed = saveEntitySchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          try {
            await addSave(session.user.id, parsed.data);
          } catch (e) {
            if (e instanceof Error && e.message === 'folder-not-found') {
              return Response.json({ error: 'Folder not found' }, { status: 404 });
            }
            throw e;
          }
          return Response.json({ saved: true });
        } catch (error) {
          console.error('Save create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 60,
            windowMs: 60_000,
            prefix: 'saves',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => null);
          const parsed = saveEntitySchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          await removeSave(session.user.id, parsed.data.entityType, parsed.data.entityId);
          return Response.json({ saved: false });
        } catch (error) {
          console.error('Save delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
