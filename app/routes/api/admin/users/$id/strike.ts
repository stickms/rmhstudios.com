import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import { AUTO_BAN_THRESHOLD, activeStrikeWhere } from '@/lib/moderation/standing.server';

/**
 * POST /api/admin/users/$id/strike — issue a warning strike. Admin only.
 * Three active strikes auto-applies a 7-day ban.
 *
 * "Active" is `activeStrikeWhere` — unexpired AND not overturned on appeal — so
 * a strike the user successfully appealed can never push them to the threshold.
 */
const schema = z.object({
  reason: z.string().min(1).max(500),
  expiresDays: z.number().int().min(1).max(365).optional(),
  /** Optional pointer to the content that earned the strike, for the user's status page. */
  entityType: z.string().max(32).optional(),
  entityId: z.string().max(64).optional(),
});

export const Route = createFileRoute('/api/admin/users/$id/strike')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'optional', body: schema, allowEmptyBody: true },
        async ({ params, session, body }) => {
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }
          const target = await prisma.user.findUnique({
            where: { id: params.id },
            select: { id: true },
          });
          if (!target) return Response.json({ error: 'User not found' }, { status: 404 });

          const strike = await prisma.userStrike.create({
            data: {
              userId: params.id,
              adminId: session.user.id,
              reason: body.reason,
              expiresAt: body.expiresDays
                ? new Date(Date.now() + body.expiresDays * 24 * 60 * 60 * 1000)
                : null,
              entityType: body.entityType ?? null,
              entityId: body.entityId ?? null,
            },
            select: { id: true },
          });
          await logAdminAction(session.user.id, 'user.strike', {
            targetType: 'user',
            targetId: params.id,
            detail: body.reason,
          });

          // Auto-ban on the 3rd active strike.
          const activeStrikes = await prisma.userStrike.count({
            where: activeStrikeWhere(params.id),
          });
          let autoBanned = false;
          if (activeStrikes >= AUTO_BAN_THRESHOLD) {
            await prisma.user.update({
              where: { id: params.id },
              data: {
                bannedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                banReason: 'Reached 3 strikes',
              },
            });
            await prisma.session.deleteMany({ where: { userId: params.id } }).catch(() => {});
            await logAdminAction(session.user.id, 'user.autoban', {
              targetType: 'user',
              targetId: params.id,
              detail: '3 strikes',
            });
            autoBanned = true;
          }

          // Point the notification at the strike so the user lands on their
          // account-status page, where they can read the record and appeal it.
          await createNotification({
            userId: params.id,
            type: 'SYSTEM',
            entityType: 'strike',
            entityId: strike.id,
            preview: `You received a moderation warning: ${body.reason}. You can review or appeal it in Settings → Account status.`,
          });

          return Response.json({ success: true, activeStrikes, autoBanned });
        },
      ),
    },
  },
});
