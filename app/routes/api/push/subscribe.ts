import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { subscribePushApi, unsubscribePushApi } from '@/lib/push/push.contract';
import { subscribePushBody, unsubscribePushBody } from '@/lib/push/push-schema';
import { prisma } from '@/lib/prisma.server';

/**
 * POST   /api/push/subscribe — store this browser's push subscription.
 * DELETE /api/push/subscribe — remove it (user turned push off on the device).
 *
 * The endpoint URL is the identity of a subscription; upsert keeps re-subscribes
 * (e.g. after a permission reset) idempotent and re-homes an endpoint if it
 * somehow appears under a different account.
 */
export const Route = createFileRoute('/api/push/subscribe')({
  server: {
    handlers: {
      POST: implement(
        subscribePushApi,
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'push-subscribe' },
          body: subscribePushBody,
          invalid: () => Response.json({ error: 'Invalid subscription' }, { status: 400 }),
        },
        async ({ request, session, body }) => {
          const { endpoint, keys } = body;
          await prisma.pushSubscription.upsert({
            where: { endpoint },
            create: {
              userId: session.user.id,
              endpoint,
              p256dh: keys.p256dh,
              auth: keys.auth,
              userAgent: request.headers.get('user-agent')?.slice(0, 255) ?? null,
            },
            update: {
              userId: session.user.id,
              p256dh: keys.p256dh,
              auth: keys.auth,
            },
          });

          return Response.json({ success: true });
        },
      ),

      DELETE: implement(
        unsubscribePushApi,
        { body: unsubscribePushBody },
        async ({ session, body }) => {
          await prisma.pushSubscription.deleteMany({
            where: { endpoint: body.endpoint, userId: session.user.id },
          });

          return Response.json({ success: true });
        },
      ),
    },
  },
});
