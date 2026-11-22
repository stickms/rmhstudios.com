import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireMod } from '@/lib/communities/guard.server';
import { deleteNoteApi, editNoteApi } from '@/lib/communities/member-notes.contract';
import { editNoteBody } from '@/lib/communities/member-notes-schema';
import { deleteNote, editNote } from '@/lib/communities/member-notes.server';

/**
 * PATCH  /api/communities/$slug/notes/$userId/$noteId — the author edits within 15 minutes.
 * DELETE /api/communities/$slug/notes/$userId/$noteId — any moderator soft-deletes; logged `note_deleted`.
 * The note is always looked up with the community id, so another community's note id is a 404.
 */
export const route = apiRoute('/api/communities/$slug/notes/$userId/$noteId', {
  PATCH: implement(editNoteApi, { rateLimit: 'write', body: editNoteBody }, async ({ params, userId, body }) => {
    const guard = await requireMod(params.slug, userId);
    if (!guard.ok) return guard.response;
    const result = await editNote({
      communityId: guard.value.id,
      subjectId: params.userId,
      noteId: params.noteId,
      viewerId: userId,
      body: body.body,
    });
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { note: result.note };
  }),
  DELETE: implement(deleteNoteApi, { rateLimit: 'write' }, async ({ params, userId }) => {
    const guard = await requireMod(params.slug, userId);
    if (!guard.ok) return guard.response;
    const result = await deleteNote({
      communityId: guard.value.id,
      subjectId: params.userId,
      noteId: params.noteId,
      actorId: userId,
    });
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { success: true as const };
  }),
});
