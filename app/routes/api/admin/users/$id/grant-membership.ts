import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import { invalidateUserTier } from '@/lib/entitlements';

/**
 * POST /api/admin/users/$id/grant-membership — admin grants (or revokes) a
 * coin-free, time-limited membership tier. Audited.
 *   { tier: 'starter'|'pro', months: 1..24 }   grant/extend
 *   { revoke: true }                            clear active gift grants
 */
const schema = z.union([
  z.object({ tier: z.enum(['starter', 'pro']), months: z.number().int().min(1).max(24) }),
  z.object({ revoke: z.literal(true) }),
]);

export const Route = createFileRoute('/api/admin/users/$id/grant-membership')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
          if (!target) return Response.json({ error: 'User not found' }, { status: 404 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          if ('revoke' in parsed.data) {
            const { count } = await prisma.giftMembership.deleteMany({
              where: { userId: params.id, expiresAt: { gt: new Date() } },
            });
            invalidateUserTier(params.id);
            await logAdminAction(session.user.id, 'membership.revoke', { targetType: 'user', targetId: params.id, detail: `removed ${count} active grant(s)` });
            return Response.json({ success: true, revoked: count });
          }

          const { tier, months } = parsed.data;
          // Extend an existing active grant of the same tier, else start now.
          const existing = await prisma.giftMembership.findFirst({
            where: { userId: params.id, tier, expiresAt: { gt: new Date() } },
            orderBy: { expiresAt: 'desc' },
          });
          const base = existing ? existing.expiresAt : new Date();
          const expiresAt = new Date(base.getTime() + months * 30 * 24 * 60 * 60 * 1000);

          if (existing) {
            await prisma.giftMembership.update({ where: { id: existing.id }, data: { expiresAt, gifterId: session.user.id } });
          } else {
            await prisma.giftMembership.create({ data: { userId: params.id, gifterId: session.user.id, tier, expiresAt } });
          }

          invalidateUserTier(params.id);
          await logAdminAction(session.user.id, 'membership.grant', { targetType: 'user', targetId: params.id, detail: `${tier} for ${months}mo` });
          await createNotification({
            userId: params.id,
            type: 'SYSTEM',
            entityType: 'membership',
            entityId: tier,
            preview: `An admin granted you ${months} month(s) of ${tier === 'pro' ? 'Pro' : 'Starter'}!`,
            link: '/pricing',
          }).catch(() => {});

          return Response.json({ success: true, tier, expiresAt: expiresAt.toISOString() });
        } catch (error) {
          console.error('Grant membership error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
