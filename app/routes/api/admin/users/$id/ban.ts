import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { logAdminAction } from '@/lib/admin-audit.server';

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

export const Route = createFileRoute('/api/admin/users/$id/ban')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }
          if (params.id === session.user.id) {
            return Response.json({ error: 'You cannot ban yourself' }, { status: 400 });
          }

          const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, isAdmin: true } });
          if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
          if (target.isAdmin) return Response.json({ error: 'Cannot ban an admin' }, { status: 400 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          if (parsed.data.unban) {
            await prisma.user.update({ where: { id: params.id }, data: { bannedUntil: null, banReason: null } });
            await logAdminAction(session.user.id, 'user.unban', { targetType: 'user', targetId: params.id });
            return Response.json({ success: true, banned: false });
          }

          const until =
            parsed.data.durationDays != null
              ? new Date(Date.now() + parsed.data.durationDays * 24 * 60 * 60 * 1000)
              : new Date('9999-12-31T00:00:00Z'); // effectively permanent

          await prisma.user.update({
            where: { id: params.id },
            data: { bannedUntil: until, banReason: parsed.data.reason ?? null },
          });
          // End active sessions so the ban takes effect immediately.
          await prisma.session.deleteMany({ where: { userId: params.id } }).catch(() => {});
          await logAdminAction(session.user.id, 'user.ban', {
            targetType: 'user',
            targetId: params.id,
            detail: `${parsed.data.durationDays ?? 'permanent'} — ${parsed.data.reason ?? ''}`.slice(0, 500),
          });

          return Response.json({ success: true, banned: true, until: until.toISOString() });
        } catch (error) {
          console.error('Ban user error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
