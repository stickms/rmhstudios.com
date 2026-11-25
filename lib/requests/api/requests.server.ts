import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createRequestApi, listRequestsApi } from '@/lib/requests/requests.contract';
import { requestCreateSchema, requestListQuerySchema } from '@/lib/requests/schema';
import { createRequest, listRequests, RequestBoardError } from '@/lib/requests/board.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';

/**
 * GET  /api/requests — the public board (anyone may read it; that is the point).
 * POST /api/requests — file a request.
 */
export const route = apiRoute('/api/requests', {
  GET: implement(
    listRequestsApi,
    { auth: 'optional', rateLimit: 'read', query: requestListQuerySchema },
    async ({ userId, query }) =>
      Response.json(
        await listRequests({
          status: query.status,
          sort: query.sort,
          q: query.q,
          cursor: query.cursor,
          limit: query.limit,
          viewerId: userId,
        }),
      ),
  ),
  POST: implement(
    createRequestApi,
    {
      // Deliberately tighter than the shared `write` policy: a request board
      // is a public queue humans read, so the failure mode is flooding it,
      // not load.
      rateLimit: { limit: 5, windowMs: 3_600_000, prefix: 'requests', scope: 'user' },
      body: requestCreateSchema,
      idempotent: true,
    },
    async ({ userId, body }) => {
      // s14-17: the board is public text other members read, so a timeout on replying holds for a new request.
      const restricted = await restrictionResponse(userId, 'comment');
      if (restricted) return restricted;
      try {
        return Response.json(await createRequest(userId, body), { status: 201 });
      } catch (error) {
        if (error instanceof RequestBoardError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    },
  ),
});
