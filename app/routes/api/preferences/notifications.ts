import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { notifPrefsSchema } from '@/lib/notify/categories';

/**
 * GET /api/preferences/notifications — the caller's category×channel matrix +
 *     quiet hours.
 * PUT /api/preferences/notifications — save them (partial upsert).
 */
export const Route = createFileRoute('/api/preferences/notifications')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
        } catch (error) {
          console.error('Notification prefs fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 20, windowMs: 60_000, prefix: 'notif-prefs' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = notifPrefsSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const data = {
            ...(parsed.data.matrix !== undefined ? { matrix: parsed.data.matrix } : {}),
            ...(parsed.data.quietStart !== undefined ? { quietStart: parsed.data.quietStart } : {}),
            ...(parsed.data.quietEnd !== undefined ? { quietEnd: parsed.data.quietEnd } : {}),
            ...(parsed.data.tz !== undefined ? { tz: parsed.data.tz } : {}),
            ...(parsed.data.emailDigest !== undefined ? { emailDigest: parsed.data.emailDigest } : {}),
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
        } catch (error) {
          console.error('Notification prefs save error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
