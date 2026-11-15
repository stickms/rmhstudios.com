import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import {
  AUTO_BAN_DURATION_MS,
  AUTO_BAN_REASON,
  AUTO_BAN_THRESHOLD,
  activeStrikeWhere,
} from '@/lib/moderation/standing.server';
import { DELETED_ACCOUNT_BAN_REASON, isDeletedAccount } from '@/lib/account-lifecycle';

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

export const route = apiRoute('/api/admin/users/$id/strike', {
  POST: implement(
    C.strikeAdminUserApi,
    {
      auth: 'admin',
      rateLimit: { policy: 'write', scope: 'user' },
      body: schema,
      allowEmptyBody: true,
    },
    async ({ params, session, body }) => {
      const target = await prisma.user.findUnique({
        where: { id: params.id },
        select: { id: true, banReason: true },
      });
      if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
      if (isDeletedAccount(target)) {
        return Response.json({ error: 'This account has been deleted' }, { status: 409 });
      }

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
        const until = new Date(Date.now() + AUTO_BAN_DURATION_MS);
        // Conditional: the auto-ban only ever extends. A longer (manual or
        // permanent) ban is never shortened to 7 days, and a deletion
        // tombstone is never overwritten.
        const banned = await prisma.user.updateMany({
          where: {
            id: params.id,
            AND: [
              { OR: [{ bannedUntil: null }, { bannedUntil: { lt: until } }] },
              { OR: [{ banReason: null }, { banReason: { not: DELETED_ACCOUNT_BAN_REASON } }] },
            ],
          },
          data: { bannedUntil: until, banReason: AUTO_BAN_REASON },
        });
        if (banned.count > 0) {
          await prisma.session.deleteMany({ where: { userId: params.id } }).catch(() => {});
          await logAdminAction(session.user.id, 'user.autoban', {
            targetType: 'user',
            targetId: params.id,
            detail: `${AUTO_BAN_THRESHOLD} strikes`,
          });
          autoBanned = true;
        }
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
});
