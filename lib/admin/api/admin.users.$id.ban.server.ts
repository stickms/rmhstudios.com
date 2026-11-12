import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { logAdminAction } from '@/lib/admin-audit.server';
import { DELETED_ACCOUNT_BAN_REASON, isDeletedAccount } from '@/lib/account-lifecycle';

/**
 * Never touch a deletion tombstone: its sentinel ban IS the "this row is not a
 * person" marker (`lib/account-lifecycle.ts`). `not` alone would skip NULLs.
 */
const NOT_TOMBSTONE = {
  OR: [{ banReason: null }, { banReason: { not: DELETED_ACCOUNT_BAN_REASON } }],
};

/**
 * POST /api/admin/users/$id/ban — ban or unban a user. Admin only.
 * Body: { unban?: true } | { reason: string, durationDays?: number | null }
 * durationDays null/omitted = permanent.
 */
const schema = z.object({
  unban: z.boolean().optional(),
  reason: z.string().max(500).optional(),
  durationDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export const route = apiRoute('/api/admin/users/$id/ban', {
  POST: implement(
    C.banAdminUserApi,
    {
      auth: 'admin',
      rateLimit: { policy: 'write', scope: 'user' },
      body: schema,
      allowEmptyBody: true,
    },
    async ({ params, session, body }) => {
      if (params.id === session.user.id) {
        return Response.json({ error: 'You cannot ban yourself' }, { status: 400 });
      }

      const target = await prisma.user.findUnique({
        where: { id: params.id },
        select: { id: true, isAdmin: true, banReason: true },
      });
      if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
      if (isDeletedAccount(target)) {
        return Response.json({ error: 'This account has been deleted' }, { status: 409 });
      }
      if (target.isAdmin) return Response.json({ error: 'Cannot ban an admin' }, { status: 400 });

      if (body.unban) {
        const { count } = await prisma.user.updateMany({
          where: { id: params.id, ...NOT_TOMBSTONE },
          data: { bannedUntil: null, banReason: null },
        });
        if (count === 0) {
          return Response.json({ error: 'This account has been deleted' }, { status: 409 });
        }
        await logAdminAction(session.user.id, 'user.unban', {
          targetType: 'user',
          targetId: params.id,
        });
        return Response.json({ success: true, banned: false });
      }

      const until =
        body.durationDays != null
          ? new Date(Date.now() + body.durationDays * 24 * 60 * 60 * 1000)
          : new Date('9999-12-31T00:00:00Z'); // effectively permanent

      const { count } = await prisma.user.updateMany({
        where: { id: params.id, ...NOT_TOMBSTONE },
        data: { bannedUntil: until, banReason: body.reason ?? null },
      });
      if (count === 0) {
        return Response.json({ error: 'This account has been deleted' }, { status: 409 });
      }
      // End active sessions so the ban takes effect immediately.
      await prisma.session.deleteMany({ where: { userId: params.id } }).catch(() => {});
      await logAdminAction(session.user.id, 'user.ban', {
        targetType: 'user',
        targetId: params.id,
        detail: `${body.durationDays ?? 'permanent'} — ${body.reason ?? ''}`.slice(0, 500),
      });

      return Response.json({ success: true, banned: true, until: until.toISOString() });
    },
  ),
});
