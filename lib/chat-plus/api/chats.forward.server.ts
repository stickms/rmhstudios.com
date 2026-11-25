import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { forwardMessage, forwardSchema } from '@/lib/chat-plus/forward.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';

/**
 * POST /api/chats/forward — forward a message into up to five chats (M10). The
 * hop counter and the "one chat at a time once it has gone viral" limit are
 * enforced here, not in the dialog.
 */
export const route = apiRoute('/api/chats/forward', {
  POST: defineHandler(
    { rateLimit: { limit: 15, windowMs: 60_000, prefix: 'chat-forward' }, body: forwardSchema },
    async ({ userId, body }) => {
      // s14-17: forwarding posts a message into each chat, so a timeout on messages and chats holds for it.
      const restricted = await restrictionResponse(userId, 'message');
      if (restricted) return restricted;
      const res = await forwardMessage(userId, body);
      if (!res.ok) return Response.json({ error: res.error, ...refusalCodeOf(res) }, { status: res.status });
      return Response.json({
        sent: res.sent,
        failed: res.failed,
        forwardCount: res.forwardCount,
      });
    },
  ),
});
