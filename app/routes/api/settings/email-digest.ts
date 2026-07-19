import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma.server';

/**
 * POST /api/settings/email-digest — toggle the weekly digest opt-in.
 *
 * Body: `{ enabled: boolean }`. Upserts the caller's
 * `NotificationPreference.emailDigest`. The settings-page toggle calls this;
 * the row may not exist yet (upsert handles first-time opt-in).
 */

const schema = z.object({ enabled: z.boolean() });

export const Route = createFileRoute('/api/settings/email-digest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'email-digest-toggle',
          });
          if (!allowed) {
            return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
          }

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const userId = session.user.id;
          await prisma.notificationPreference.upsert({
            where: { userId },
            create: { userId, emailDigest: parsed.data.enabled },
            update: { emailDigest: parsed.data.enabled },
          });

          return Response.json({ ok: true, enabled: parsed.data.enabled });
        } catch (error) {
          console.error('email-digest toggle error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
