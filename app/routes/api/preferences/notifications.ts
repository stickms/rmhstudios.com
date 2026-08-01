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
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'notif-prefs' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = notifPrefsSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const data = {
            ...(parsed.data.matrix !== undefined ? { matrix: parsed.data.matrix } : {}),
            ...(parsed.data.quietStart !== undefined ? { quietStart: parsed.data.quietStart } : {}),
            ...(parsed.data.quietEnd !== undefined ? { quietEnd: parsed.data.quietEnd } : {}),
            ...(parsed.data.tz !== undefined ? { tz: parsed.data.tz } : {}),
            ...(parsed.data.emailDigest !== undefined
              ? { emailDigest: parsed.data.emailDigest }
              : {}),
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
