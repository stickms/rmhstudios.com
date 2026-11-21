import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deletePatchNoteApi, editPatchNoteApi } from '@/lib/arcade/updates.contract';
import { patchNoteEditBody } from '@/lib/arcade/updates-schema';
import { deletePatchNote, editPatchNote } from '@/lib/arcade/updates.server';
import { logAdminAction } from '@/lib/admin-audit.server';

const notFound = () =>
  Response.json(
    {
      error: 'Not found',
    },
    {
      status: 404,
    },
  );

/**
 * PATCH  /api/arcade/patch-notes/:id — edit a note's title and body (its version is immutable).
 * DELETE /api/arcade/patch-notes/:id — delete a note.
 * Admin only, and each change is written to the admin audit log.
 */
export const route = apiRoute('/api/arcade/patch-notes/$id', {
  PATCH: implement(
    editPatchNoteApi,
    {
      auth: 'admin',
      rateLimit: 'write',
      body: patchNoteEditBody,
    },
    async ({ userId, params, body }) => {
      const edited = await editPatchNote(params.id, body);
      if (!edited) return notFound();
      await logAdminAction(userId, 'game_patch_note.edit', {
        targetType: 'game_patch_note',
        targetId: params.id,
        detail: edited.gameId,
      });
      return {
        note: edited.note,
      };
    },
  ),
  DELETE: implement(
    deletePatchNoteApi,
    {
      auth: 'admin',
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const gameId = await deletePatchNote(params.id);
      if (!gameId) return notFound();
      await logAdminAction(userId, 'game_patch_note.delete', {
        targetType: 'game_patch_note',
        targetId: params.id,
        detail: gameId,
      });
      return {
        ok: true as const,
      };
    },
  ),
});
