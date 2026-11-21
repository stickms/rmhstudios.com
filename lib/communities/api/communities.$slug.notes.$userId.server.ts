import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireMod } from '@/lib/communities/guard.server';
import { addNoteApi, listNotesApi } from '@/lib/communities/member-notes.contract';
import { createNoteBody } from '@/lib/communities/member-notes-schema';
import { addNote, listNotes } from '@/lib/communities/member-notes.server';

/**
 * GET  /api/communities/$slug/notes/$userId — live notes about one member, newest first (moderators only).
 * POST /api/communities/$slug/notes/$userId — add a note; the 51st live note is refused (409).
 */
export const route = apiRoute('/api/communities/$slug/notes/$userId', {
  GET: implement(listNotesApi, { rateLimit: 'read' }, async ({ params, userId }) => {
    const guard = await requireMod(params.slug, userId);
    if (!guard.ok) return guard.response;
    return { notes: await listNotes(guard.value.id, params.userId, userId) };
  }),
  POST: implement(addNoteApi, { rateLimit: 'write', body: createNoteBody }, async ({ params, userId, body }) => {
    const guard = await requireMod(params.slug, userId);
    if (!guard.ok) return guard.response;
    const result = await addNote({
      communityId: guard.value.id,
      subjectId: params.userId,
      authorId: userId,
      body: body.body,
      banId: body.banId,
      modItemId: body.modItemId,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ note: result.note }, { status: 201 });
  }),
});
