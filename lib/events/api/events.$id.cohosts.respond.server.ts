import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalMessage, refusalStatus } from '@/lib/events/cohosts';
import { respondCohostBody } from '@/lib/events/cohosts-schema';
import { respondCohostApi } from '@/lib/events/cohosts.contract';
import { respondToCohostInvite } from '@/lib/events/cohosts.server';

/**
 * POST /api/events/$id/cohosts/respond — the invited member accepts (they become a co-host and the host is
 * told) or declines (the invitation is deleted). Only the member the invitation is addressed to can answer.
 */
export const route = apiRoute('/api/events/$id/cohosts/respond', {
  POST: implement(
    respondCohostApi,
    { rateLimit: 'write', body: respondCohostBody },
    async ({ params, userId, body }) => {
      const result = await respondToCohostInvite({ eventId: params.id, userId, accept: body.accept });
      if (!result.ok) {
        return Response.json(
          { error: refusalMessage(result.code), code: result.code },
          { status: refusalStatus(result.code) },
        );
      }
      return { success: true as const, accept: body.accept };
    },
  ),
});
