import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { cancelScheduledGift, ScheduledGiftError } from '@/lib/gifting/scheduled-gift.server';

/** DELETE /api/gifts/scheduled/:id — cancel a gift that has not been delivered yet; refunds the sender. */
export const Route = createFileRoute('/api/gifts/scheduled/$id/')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        try {
          await cancelScheduledGift(userId, params.id);
          return Response.json({ ok: true });
        } catch (e) {
          if (e instanceof ScheduledGiftError) {
            return Response.json({ error: e.code }, { status: e.code === 'NOT_FOUND' ? 404 : 409 });
          }
          throw e;
        }
      }),
    },
  },
});
