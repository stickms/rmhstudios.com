import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
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
      GET: defineHandler({}, async ({ request, session }) => {
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
      }),

      POST: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'saves' }, body: saveEntitySchema },
        async ({ session, body }) => {
          try {
            await addSave(session.user.id, body);
          } catch (e) {
            if (e instanceof Error && e.message === 'folder-not-found') {
              return Response.json({ error: 'Folder not found' }, { status: 404 });
            }
            throw e;
          }
          return Response.json({ saved: true });
        },
      ),

      DELETE: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'saves' }, body: saveEntitySchema },
        async ({ session, body }) => {
          await removeSave(session.user.id, body.entityType, body.entityId);
          return Response.json({ saved: false });
        },
      ),
    },
  },
});
