import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { listSavesApi, saveItemApi, unsaveItemApi } from '@/lib/saves/saves.contract';
import {
  saveEntitySchema,
  saveListQuery,
  SAVE_ENTITY_TYPES,
  type SaveEntityType,
} from '@/lib/saves/types';
import { addSave, removeSave, listSaves, listFolders } from '@/lib/saves/saves.server';

/**
 * GET    /api/saves?folder=&type=&cursor= — the caller's saves + folders.
 * POST   /api/saves  { entityType, entityId, folderId? } — save (idempotent).
 * DELETE /api/saves  { entityType, entityId } — unsave (idempotent).
 */
export const Route = createFileRoute('/api/saves/')({
  server: {
    handlers: {
      GET: implement(listSavesApi, { query: saveListQuery }, async ({ query, session }) => {
        const folderParam = query.folder ?? null; // id | 'default' | null (all)
        const typeParam = query.type ?? null;
        const cursor = query.cursor;
        const q = query.q; // X9: search the owner's notes
        const type =
          typeParam && (SAVE_ENTITY_TYPES as readonly string[]).includes(typeParam)
            ? (typeParam as SaveEntityType)
            : undefined;

        const [result, folders] = await Promise.all([
          listSaves(session.user.id, {
            folderId: folderParam === 'default' ? 'default' : folderParam || undefined,
            type,
            cursor,
            q,
          }),
          listFolders(session.user.id),
        ]);
        return Response.json({ ...result, folders });
      }),

      POST: implement(
        saveItemApi,
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'saves' }, body: saveEntitySchema },
        async ({ session, body }) => {
          try {
            await addSave(session.user.id, body);
          } catch (e) {
            if (e instanceof Error && e.message === 'not-found') {
              return Response.json({ error: 'Not found' }, { status: 404 });
            }
            if (e instanceof Error && e.message === 'folder-not-found') {
              return Response.json({ error: 'Folder not found' }, { status: 404 });
            }
            throw e;
          }
          return Response.json({ saved: true });
        },
      ),

      DELETE: implement(
        unsaveItemApi,
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'saves' }, body: saveEntitySchema },
        async ({ session, body }) => {
          await removeSave(session.user.id, body.entityType, body.entityId);
          return Response.json({ saved: false });
        },
      ),
    },
  },
});
