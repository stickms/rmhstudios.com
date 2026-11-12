import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { addListMemberApi, removeListMemberApi } from '@/lib/lists/lists.contract';
import { listMemberSchema } from '@/lib/lists/constants';
import { addMember, removeMember, ListError } from '@/lib/lists/lists.server';

/**
 * PUT    /api/lists/:id/members { userId } — add a member (owner).
 * DELETE /api/lists/:id/members { userId } — remove (owner, or self "remove me").
 */
export const route = apiRoute('/api/lists/$id/members', {
  PUT: implement(
    addListMemberApi,
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
      return { ok: true as const };
    },
  ),
  DELETE: implement(
    removeListMemberApi,
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:lists/:id.members' },
      body: listMemberSchema,
    },
    async ({ params, session, body }) => {
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
      return { ok: true as const };
    },
  ),
});
