import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { decideMessageRequestApi } from '@/lib/messages/requests.contract';
import { decideRequestBody } from '@/lib/messages/requests-schema';
import { decideRequest } from '@/lib/messages/requests.server';

/**
 * POST /api/messages/requests/$id — accept or decline a message request.
 * Only the request's recipient can; anyone else, and a request already answered,
 * is "not found". The id never grants access to the chat by itself.
 */

export const route = apiRoute('/api/messages/requests/$id', {
  POST: implement(
    decideMessageRequestApi,
    { rateLimit: 'write', body: decideRequestBody },
    async ({ params, userId, body }) => {
      const result = await decideRequest({
        recipientId: userId,
        requestId: params.id,
        action: body.action,
      });
      if (!result.ok) return Response.json({ error: 'Request not found' }, { status: 404 });
      return { success: true as const, conversationId: result.conversationId };
    },
  ),
});
