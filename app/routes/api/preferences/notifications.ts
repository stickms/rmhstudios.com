import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notifPrefsSchema } from '@/lib/notify/categories';

/**
 * GET /api/preferences/notifications — the caller's category×channel matrix +
 *     quiet hours.
 * PUT /api/preferences/notifications — save them (partial upsert).
 */
export const Route = createFileRoute('/api/preferences/notifications')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const row = await prisma.notificationPreference.findUnique({
          where: { userId: session.user.id },
          select: { matrix: true, quietStart: true, quietEnd: true, tz: true, emailDigest: true },
        });
        return Response.json({
          matrix: row?.matrix ?? {},
          quietStart: row?.quietStart ?? null,
          quietEnd: row?.quietEnd ?? null,
          tz: row?.tz ?? null,
          emailDigest: row?.emailDigest ?? false,
        });
      }),
      PUT: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'notif-prefs' },
          body: notifPrefsSchema,
        },
        async ({ session, body }) => {
          const data = {
            ...(body.matrix !== undefined ? { matrix: body.matrix } : {}),
            ...(body.quietStart !== undefined ? { quietStart: body.quietStart } : {}),
            ...(body.quietEnd !== undefined ? { quietEnd: body.quietEnd } : {}),
            ...(body.tz !== undefined ? { tz: body.tz } : {}),
            ...(body.emailDigest !== undefined ? { emailDigest: body.emailDigest } : {}),
          };
          const row = await prisma.notificationPreference.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, ...data },
            update: data,
          });
          return Response.json({
            matrix: row.matrix ?? {},
            quietStart: row.quietStart ?? null,
            quietEnd: row.quietEnd ?? null,
            tz: row.tz ?? null,
            emailDigest: row.emailDigest,
          });
        },
      ),
    },
  },
});
