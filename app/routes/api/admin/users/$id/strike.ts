import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';

/**
 * POST /api/admin/users/$id/strike — issue a warning strike. Admin only.
 * Three active strikes auto-applies a 7-day ban.
 */
const schema = z.object({
  reason: z.string().min(1).max(500),
  expiresDays: z.number().int().min(1).max(365).optional(),
});

export const Route = createFileRoute('/api/admin/users/$id/strike')({
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

          await prisma.userStrike.create({
            data: {
              userId: params.id,
              adminId: session.user.id,
              reason: parsed.data.reason,
              expiresAt: parsed.data.expiresDays
                ? new Date(Date.now() + parsed.data.expiresDays * 24 * 60 * 60 * 1000)
                : null,
            },
          });
          await logAdminAction(session.user.id, 'user.strike', { targetType: 'user', targetId: params.id, detail: parsed.data.reason });

          // Auto-ban on the 3rd active strike.
          const activeStrikes = await prisma.userStrike.count({
            where: { userId: params.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          });
          let autoBanned = false;
          if (activeStrikes >= 3) {
            await prisma.user.update({
              where: { id: params.id },
              data: { bannedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), banReason: 'Reached 3 strikes' },
            });
            await prisma.session.deleteMany({ where: { userId: params.id } }).catch(() => {});
            await logAdminAction(session.user.id, 'user.autoban', { targetType: 'user', targetId: params.id, detail: '3 strikes' });
            autoBanned = true;
          }

          await createNotification({
            userId: params.id,
            type: 'SYSTEM',
            entityType: 'strike',
            preview: `You received a moderation warning: ${parsed.data.reason}`,
          });

          return Response.json({ success: true, activeStrikes, autoBanned });
        } catch (error) {
          console.error('Strike user error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
