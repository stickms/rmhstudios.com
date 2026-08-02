/**
 * POST /api/admin/appeals/$id — decide a strike appeal. Admin only.
 * Body: { action: 'uphold' | 'overturn', note?: string }
 *
 * Overturning is not just a status flip. A strike voided on appeal stops
 * counting toward the three-strike threshold, so if the user was auto-banned
 * *because* of that strike, the ban has to come off in the same operation —
 * otherwise a successful appeal leaves the punishment in place, which is worse
 * than having no appeal process at all. The lift is deliberately narrow: only
 * the auto-ban (`banReason` = 'Reached 3 strikes') is cleared, never a manual
 * ban an admin issued for separate reasons.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import { AUTO_BAN_THRESHOLD, activeStrikeWhere } from '@/lib/moderation/standing.server';

/** Set by the strike endpoint when the third active strike lands. */
const AUTO_BAN_REASON = 'Reached 3 strikes';

const schema = z.object({
  action: z.enum(['uphold', 'overturn']),
  note: z.string().trim().max(1000).optional(),
});

export const Route = createFileRoute('/api/admin/appeals/$id')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'optional', body: schema, allowEmptyBody: true },
        async ({ params, session, body }) => {
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const { action, note } = body;

          const strike = await prisma.userStrike.findUnique({
            where: { id: params.id },
            select: { id: true, userId: true, reason: true, appealStatus: true },
          });
          if (!strike) return Response.json({ error: 'Appeal not found' }, { status: 404 });
          if (strike.appealStatus !== 'PENDING') {
            return Response.json({ error: 'This appeal was already decided.' }, { status: 409 });
          }

          const decision = action === 'overturn' ? 'OVERTURNED' : 'UPHELD';

          // Same conditional-update guard the user-side submit uses: two
          // moderators hitting decide at once, only one write lands.
          const { count } = await prisma.userStrike.updateMany({
            where: { id: params.id, appealStatus: 'PENDING' },
            data: {
              appealStatus: decision,
              appealNote: note || null,
              appealAdminId: session.user.id,
              decidedAt: new Date(),
            },
          });
          if (count === 0) {
            return Response.json({ error: 'This appeal was already decided.' }, { status: 409 });
          }

          // Overturned: recount and lift the auto-ban if it no longer applies.
          let banLifted = false;
          if (decision === 'OVERTURNED') {
            const remaining = await prisma.userStrike.count({
              where: activeStrikeWhere(strike.userId),
            });
            if (remaining < AUTO_BAN_THRESHOLD) {
              const lifted = await prisma.user.updateMany({
                where: {
                  id: strike.userId,
                  banReason: AUTO_BAN_REASON,
                  bannedUntil: { gt: new Date() },
                },
                data: { bannedUntil: null, banReason: null },
              });
              banLifted = lifted.count > 0;
            }
          }

          await logAdminAction(session.user.id, `appeal.${action}`, {
            targetType: 'strike',
            targetId: params.id,
            detail: banLifted ? `${note ?? ''} (auto-ban lifted)`.trim() : (note ?? undefined),
          });

          await createNotification({
            userId: strike.userId,
            type: 'SYSTEM',
            entityType: 'strike',
            entityId: strike.id,
            preview:
              decision === 'OVERTURNED'
                ? 'Your appeal was accepted — the strike has been removed from your account.'
                : 'Your appeal was reviewed and the strike stands.',
          });

          return Response.json({ success: true, appealStatus: decision, banLifted });
        },
      ),
    },
  },
});
