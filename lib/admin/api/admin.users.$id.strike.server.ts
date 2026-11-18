import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { issueStrike } from '@/lib/moderation/strikes.server';
import { isDeletedAccount } from '@/lib/account-lifecycle';

/**
 * POST /api/admin/users/$id/strike — issue a warning strike. Admin only.
 * Three active strikes auto-applies a 7-day ban (`issueStrike`).
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

      const { activeStrikes, autoBanned } = await issueStrike({
        userId: params.id,
        adminId: session.user.id,
        reason: body.reason,
        expiresDays: body.expiresDays,
        entityType: body.entityType,
        entityId: body.entityId,
      });

      return Response.json({ success: true, activeStrikes, autoBanned });
    },
  ),
});
