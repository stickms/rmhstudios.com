import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { isAlertEnabled, setAlertEnabled } from '@/lib/sohumtracker/alerts.server';

/**
 * GET/POST /api/sohumtracker/alert — the "tell me when he joins voice" switch.
 *
 * The only authenticated endpoint this feature has, and the only one that
 * writes. It is keyed to a site account rather than to an anonymous push
 * endpoint because the site already has one push path (`lib/push/send.server.ts`
 * — VAPID, dead-endpoint cleanup) and it is keyed by user; a second, anonymous
 * one would be a second place to get the encryption and the 410-handling right.
 *
 * That does mean the page's one interactive control needs a sign-in, which the
 * page says plainly rather than hiding the button.
 *
 * The GET is `private, max-age=0`: this is a per-user answer, and the rest of
 * this feature's routes are `public` cached. One of these must never be handed
 * to the wrong person by a shared cache.
 */
export const Route = createFileRoute('/api/sohumtracker/alert')({
  server: {
    handlers: {
      GET: defineHandler(
        // `maxAge: 0` + private: the browser must re-ask, and no shared cache may
        // ever hold one person's answer. The rest of this feature's routes are
        // `public` cached; this one cannot be.
        { rateLimit: 'read', cache: { visibility: 'private', maxAge: 0 } },
        async ({ userId }) => Response.json({ enabled: await isAlertEnabled(userId) }),
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'sohumtracker-alert' },
          body: z.object({ enabled: z.boolean() }),
        },
        async ({ userId, body }) => {
          await setAlertEnabled(userId, body.enabled);
          return Response.json({ enabled: body.enabled });
        },
      ),
    },
  },
});
