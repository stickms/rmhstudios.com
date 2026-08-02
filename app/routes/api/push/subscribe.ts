import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';

/**
 * POST   /api/push/subscribe — store this browser's push subscription.
 * DELETE /api/push/subscribe — remove it (user turned push off on the device).
 *
 * The endpoint URL is the identity of a subscription; upsert keeps re-subscribes
 * (e.g. after a permission reset) idempotent and re-homes an endpoint if it
 * somehow appears under a different account.
 */
const subscribeSchema = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(1024),
});

export const Route = createFileRoute('/api/push/subscribe')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'push-subscribe' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = subscribeSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Invalid subscription' }, { status: 400 });
          }

          const { endpoint, keys } = parsed.data;
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

      DELETE: defineHandler({ body: unsubscribeSchema }, async ({ session, body }) => {
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: body.endpoint, userId: session.user.id },
        });

        return Response.json({ success: true });
      }),
    },
  },
});
