import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { invalidateNotificationPrefs } from '@/lib/notifications.server';
import { getNotificationMatrix } from '@/lib/settings/prefs.server';
import { notifPrefsSchema } from '@/lib/notify/categories-schema';
import { getNotificationMatrixApi } from '@/lib/preferences/preferences.contract';
import { setNotificationMatrixApi } from '@/lib/preferences/preferences.contract';

/**
 * GET /api/preferences/notifications — the caller's category×channel matrix +
 *     quiet hours.
 * PUT /api/preferences/notifications — save them (partial upsert).
 */
export const Route = createFileRoute('/api/preferences/notifications')({
  server: {
    handlers: {
      GET: implement(getNotificationMatrixApi, {}, async ({ session }) =>
        Response.json(await getNotificationMatrix(session.user.id)),
      ),
      PUT: implement(
        setNotificationMatrixApi,
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
          invalidateNotificationPrefs(session.user.id);
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
