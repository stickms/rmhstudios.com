import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { forwardMessage, forwardSchema } from '@/lib/chat-plus/forward.server';

/**
 * POST /api/chats/forward — forward a message into up to five chats (M10). The
 * hop counter and the "one chat at a time once it has gone viral" limit are
 * enforced here, not in the dialog.
 */
export const Route = createFileRoute('/api/chats/forward')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 15, windowMs: 60_000, prefix: 'chat-forward' }, body: forwardSchema },
        async ({ userId, body }) => {
          const res = await forwardMessage(userId, body);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({
            sent: res.sent,
            failed: res.failed,
            forwardCount: res.forwardCount,
          });
        },
      ),
    },
  },
});
