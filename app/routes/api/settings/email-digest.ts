import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
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
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'email-digest-toggle' },
          body: schema,
          allowEmptyBody: true,
        },
        async ({ session, body }) => {
          const userId = session.user.id;
          await prisma.notificationPreference.upsert({
            where: { userId },
            create: { userId, emailDigest: body.enabled },
            update: { emailDigest: body.enabled },
          });

          return Response.json({ ok: true, enabled: body.enabled });
        },
      ),
    },
  },
});
