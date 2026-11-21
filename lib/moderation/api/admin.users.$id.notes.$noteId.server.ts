import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  deleteModeratorNoteApi,
  updateModeratorNoteApi,
} from '@/lib/moderation/notes.contract';
import { patchNoteBody } from '@/lib/moderation/notes-schema';
import {
  deleteNote,
  updateNote,
} from '@/lib/moderation/notes.server';

/**
 * PATCH  /api/admin/users/$id/notes/$noteId — edit the text (the author, within 24 hours; the previous text is
 *                                             kept) and/or pin or unpin (any admin, at most three pinned).
 * DELETE /api/admin/users/$id/notes/$noteId — soft delete (any admin).
 * Admin only; each change is audit-logged.
 */
export const route =
  apiRoute(
    '/api/admin/users/$id/notes/$noteId',
    {
      PATCH:
        implement(
          updateModeratorNoteApi,
          {
            auth: 'admin',
            rateLimit:
              {
                policy:
                  'write',
                scope:
                  'user',
              },
            body: patchNoteBody,
          },
          async ({
            params,
            session,
            body,
          }) => {
            const result =
              await updateNote(
                {
                  subjectId:
                    params.id,
                  noteId:
                    params.noteId,
                  adminId:
                    session
                      .user
                      .id,
                  body: body.body,
                  pinned:
                    body.pinned,
                },
              );
            if (
              !result.ok
            )
              return Response.json(
                {
                  error:
                    result.error,
                },
                {
                  status:
                    result.status,
                },
              );
            return {
              note: result.note,
            };
          },
        ),
      DELETE:
        implement(
          deleteModeratorNoteApi,
          {
            auth: 'admin',
            rateLimit:
              {
                policy:
                  'write',
                scope:
                  'user',
              },
          },
          async ({
            params,
            session,
          }) => {
            const result =
              await deleteNote(
                {
                  subjectId:
                    params.id,
                  noteId:
                    params.noteId,
                  adminId:
                    session
                      .user
                      .id,
                },
              );
            if (
              !result.ok
            )
              return Response.json(
                {
                  error:
                    result.error,
                },
                {
                  status:
                    result.status,
                },
              );
            return {
              success:
                true as const,
            };
          },
        ),
    },
  );
