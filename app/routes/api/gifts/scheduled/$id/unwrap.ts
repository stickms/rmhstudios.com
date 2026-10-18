import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { ScheduledGiftError, unwrapGift } from '@/lib/gifting/scheduled-gift.server';

/** POST /api/gifts/scheduled/:id/unwrap — open a delivered gift (idempotent). */
export const Route = createFileRoute('/api/gifts/scheduled/$id/unwrap')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        try {
          return Response.json({ ok: true, ...(await unwrapGift(userId, params.id)) });
        } catch (e) {
          if (e instanceof ScheduledGiftError)
            return Response.json({ error: e.code }, { status: 404 });
          throw e;
        }
      }),
    },
  },
});
