import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { MAX_COHOSTS, refusalMessage, refusalStatus, type CohostRefusal } from '@/lib/events/cohosts';
import { inviteCohostBody, removeCohostQuery } from '@/lib/events/cohosts-schema';
import { inviteCohostApi, listCohostsApi, removeCohostApi } from '@/lib/events/cohosts.contract';
import { inviteCohost, listCohosts, removeCohost } from '@/lib/events/cohosts.server';

function refused(code: CohostRefusal): Response {
  return Response.json({ error: refusalMessage(code), code }, { status: refusalStatus(code) });
}

/**
 * GET    /api/events/$id/cohosts            — the co-hosts (host: all; accepted co-host: the accepted ones).
 * POST   /api/events/$id/cohosts            — the host invites a member `{ userId }`.
 * DELETE /api/events/$id/cohosts?userId=…   — the host removes one; a co-host removes themself (steps down).
 */
export const route = apiRoute('/api/events/$id/cohosts', {
  GET: implement(listCohostsApi, { rateLimit: 'read' }, async ({ params, userId }) => {
    const result = await listCohosts(params.id, userId);
    return result.ok ? { cohosts: result.value, max: MAX_COHOSTS } : refused(result.code);
  }),

  POST: implement(
    inviteCohostApi,
    { rateLimit: 'write', body: inviteCohostBody },
    async ({ params, userId, body }) => {
      const result = await inviteCohost({ eventId: params.id, actorId: userId, userId: body.userId });
      return result.ok ? { cohost: result.value } : refused(result.code);
    },
  ),

  DELETE: implement(
    removeCohostApi,
    { rateLimit: 'write', query: removeCohostQuery },
    async ({ params, userId, query }) => {
      const result = await removeCohost({ eventId: params.id, actorId: userId, userId: query.userId });
      return result.ok ? { success: true as const } : refused(result.code);
    },
  ),
});
