import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createModeratorNoteApi, listModeratorNotesApi } from '@/lib/moderation/notes.contract';
import { createNoteBody, listNotesQuery } from '@/lib/moderation/notes-schema';
import { createNote, listNotes } from '@/lib/moderation/notes.server';

/**
 * GET  /api/admin/users/$id/notes — a member's moderator notes, pinned first then newest first, 50 a page,
 *                                   `?q=` searches the text. Admin only; never cached.
 * POST /api/admin/users/$id/notes — add a note, optionally linked to one of the member's own reports or strikes.
 *
 * Notes are internal: no member-facing endpoint or export reads this table.
 */
export const route = apiRoute('/api/admin/users/$id/notes', {
  GET: implement(
    listModeratorNotesApi,
    {
      auth: 'admin',
      microCache: false,
      query: listNotesQuery,
    },
    async ({ params, query }) => {
      const page = await listNotes(params.id, {
        q: query.q,
        cursor: query.cursor,
      });
      if (!page)
        return Response.json(
          {
            error: 'User not found',
          },
          {
            status: 404,
          },
        );
      return page;
    },
  ),
  POST: implement(
    createModeratorNoteApi,
    {
      auth: 'admin',
      rateLimit: {
        policy: 'write',
        scope: 'user',
      },
      body: createNoteBody,
    },
    async ({ params, session, body }) => {
      const result = await createNote({
        subjectId: params.id,
        authorId: session.user.id,
        body: body.body,
        reportId: body.reportId,
        strikeId: body.strikeId,
      });
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
          },
          {
            status: result.status,
          },
        );
      return Response.json(
        {
          note: result.note,
        },
        {
          status: 201,
        },
      );
    },
  ),
});
