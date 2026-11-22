import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { pinReplyApi, unpinReplyApi } from '@/lib/feed/conversation-controls.contract';
import { pinReplyBody } from '@/lib/feed/conversation-controls-schema';
import { pinReply, unpinReply } from '@/lib/feed/conversation-controls.server';

/**
 * /api/rmharks/$id/pin-reply — the post author's one pinned reply. PUT `{ commentId }` pins a visible direct reply to this
 * post (replacing any earlier pin); DELETE unpins. Author only, checked against the post's owner on the server.
 */
export const route = apiRoute('/api/rmharks/$id/pin-reply', {
  PUT: implement(
    pinReplyApi,
    {
      rateLimit: 'write',
      body: pinReplyBody,
    },
    async ({ userId, params, body }) => {
      const result = await pinReply(params.id, body.commentId, userId);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
          },
          {
            status: result.status,
          },
        );
      return {
        pinnedReplyId: result.pinnedReplyId,
      };
    },
  ),
  DELETE: implement(
    unpinReplyApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const result = await unpinReply(params.id, userId);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
          },
          {
            status: result.status,
          },
        );
      return {
        pinnedReplyId: result.pinnedReplyId,
      };
    },
  ),
});
