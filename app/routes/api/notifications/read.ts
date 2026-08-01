import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { adjustNotifUnread } from '@/lib/notifications.server';
import { z } from 'zod';

/**
 * POST /api/notifications/read — mark notifications read.
 * Body: { all: true } to mark everything, or { ids: string[] } for specific ones.
 */
const readSchema = z.object({
  all: z.boolean().optional(),
  ids: z.array(z.string().max(64)).max(200).optional(),
});

export const Route = createFileRoute('/api/notifications/read')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ request, session }) => {
        const body = await request.json().catch(() => ({}));
        const parsed = readSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: 'Invalid input' }, { status: 400 });
        }

        const userId = session.user.id;
        if (parsed.data.all) {
          const res = await prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true },
          });
          // Keep the Redis unread badge counter in step (it self-heals on the
          // next read via COUNT backfill, but decrementing keeps it instant).
          if (res.count > 0) void adjustNotifUnread(userId, -res.count);
          return Response.json({ success: true, updated: res.count });
        }

        if (parsed.data.ids && parsed.data.ids.length > 0) {
          // Scope to the caller's own notifications — never let one user mark
          // another user's notifications read. Only count rows that were
          // actually unread so the counter isn't over-decremented on re-marks.
          const res = await prisma.notification.updateMany({
            where: { userId, id: { in: parsed.data.ids }, read: false },
            data: { read: true },
          });
          if (res.count > 0) void adjustNotifUnread(userId, -res.count);
          return Response.json({ success: true, updated: res.count });
        }

        return Response.json({ success: true, updated: 0 });
      }),
    },
  },
});
