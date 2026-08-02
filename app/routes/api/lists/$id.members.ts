import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listMemberSchema } from '@/lib/lists/constants';
import { addMember, removeMember, ListError } from '@/lib/lists/lists.server';

/**
 * PUT    /api/lists/:id/members { userId } — add a member (owner).
 * DELETE /api/lists/:id/members { userId } — remove (owner, or self "remove me").
 */
export const Route = createFileRoute('/api/lists/$id/members')({
  server: {
    handlers: {
      PUT: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'lists-member' },
          body: listMemberSchema,
        },
        async ({ params, session, body }) => {
          try {
            await addMember(session.user.id, params.id, body.userId);
          } catch (e) {
            if (e instanceof ListError) {
              return Response.json(
                { error: e.message },
                { status: e.message === 'NOT_FOUND' ? 404 : 400 },
              );
            }
            throw e;
          }
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler({ body: listMemberSchema }, async ({ params, session, body }) => {
        try {
          await removeMember(session.user.id, params.id, body.userId);
        } catch (e) {
          if (e instanceof ListError) {
            return Response.json(
              { error: e.message },
              { status: e.message === 'FORBIDDEN' ? 403 : 404 },
            );
          }
          throw e;
        }
        return Response.json({ ok: true });
      }),
    },
  },
});
