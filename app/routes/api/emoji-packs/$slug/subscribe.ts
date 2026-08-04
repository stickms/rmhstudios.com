/**
 * /api/emoji-packs/$slug/subscribe — install or remove a pack.
 *
 * Deliberately NOT gated. Creating packs is a membership feature; installing
 * and using them is free for everyone, which is what makes a member's pack
 * worth making.
 */
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { subscribe, unsubscribe, PackError } from '@/lib/emoji/packs.server';

export const Route = createFileRoute('/api/emoji-packs/$slug/subscribe')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        try {
          await subscribe(userId, params.slug);
          return Response.json({ ok: true });
        } catch (err) {
          if (err instanceof PackError) return apiError(err.message, err.status);
          throw err;
        }
      }),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        await unsubscribe(userId, params.slug);
        return Response.json({ ok: true });
      }),
    },
  },
});
