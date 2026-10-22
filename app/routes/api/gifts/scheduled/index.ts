import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { scheduleGiftSchema } from '@/lib/gifting/scheduled-gift';
import {
  listScheduledGifts,
  scheduleGift,
  ScheduledGiftError,
} from '@/lib/gifting/scheduled-gift.server';

/**
 * GET  /api/gifts/scheduled — gifts waiting for the caller to unwrap + gifts they sent.
 * POST /api/gifts/scheduled — pay for a store gift now, to arrive on a date (C7).
 */
export const Route = createFileRoute('/api/gifts/scheduled/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await listScheduledGifts(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'sgift-send', scope: 'user' },
          body: scheduleGiftSchema,
          idempotent: true,
        },
        async ({ userId, body }) => {
          try {
            return Response.json(await scheduleGift(userId, body), { status: 201 });
          } catch (e) {
            if (e instanceof ScheduledGiftError) {
              return Response.json(
                { error: e.code },
                { status: e.code === 'NO_SUCH_MEMBER' ? 404 : 400 },
              );
            }
            throw e;
          }
        },
      ),
    },
  },
});
