import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { adjustNotifUnread } from '@/lib/notifications.server';
import { followUser, setPostLike } from '@/lib/social/engagement.server';
import { pushActionsFor } from '@/lib/push/send.server';

/**
 * POST /api/push/action — a button pressed on a push notification (plan U6).
 *
 * Called by the service worker (`public/sw.js`, `notificationclick`) with the
 * session cookie, so this is an ordinary authenticated write. The worker sends
 * only the notification id and the verb; the TARGET (which post to like, whom
 * to follow) is re-derived from the caller's own notification row, and the
 * verb must be one that row actually offered. A forged request can therefore
 * do nothing the recipient's own notification didn't already offer them.
 *
 * Every verb also marks the notification read — acting on it is reading it.
 */
const schema = z.object({
  nid: z.string().min(1).max(64),
  action: z.enum(['like', 'follow-back', 'mark-read']),
});

export const Route = createFileRoute('/api/push/action')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'write', body: schema }, async ({ session, body }) => {
        const userId = session.user.id;
        const n = await prisma.notification.findFirst({
          where: { id: body.nid, userId },
          select: {
            id: true,
            type: true,
            entityType: true,
            entityId: true,
            actorId: true,
            read: true,
          },
        });
        if (!n) return Response.json({ error: 'Not found' }, { status: 404 });

        const offered = pushActionsFor(n.type, n.entityType).some((a) => a.action === body.action);
        if (!offered) return Response.json({ error: 'Action not available' }, { status: 400 });

        if (body.action === 'like' && n.entityId) {
          await setPostLike(userId, n.entityId, true);
        } else if (body.action === 'follow-back' && n.entityId) {
          await followUser({
            followerId: userId,
            followingId: n.entityId,
            followerHandle: (session.user as { handle?: string | null }).handle ?? null,
          });
        }

        if (!n.read) {
          const res = await prisma.notification.updateMany({
            where: { id: n.id, userId, read: false },
            data: { read: true },
          });
          if (res.count > 0) void adjustNotifUnread(userId, -res.count);
        }
        return Response.json({ ok: true });
      }),
    },
  },
});
