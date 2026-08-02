import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';

/**
 * POST /api/admin/users/$id/set-coins — admin sets a user's RMH coin balance
 * to an exact amount. Audited and notifies the user. Returns the new balance.
 *   { coins: 0..1_000_000_000 }
 */
const schema = z.object({ coins: z.number().int().min(0).max(1_000_000_000) });

export const Route = createFileRoute('/api/admin/users/$id/set-coins')({
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

          const { coins } = body;

          const profile = await prisma.userProfile.upsert({
            where: { userId: params.id },
            create: { userId: params.id, coins },
            update: { coins },
            select: { coins: true },
          });

          await logAdminAction(session.user.id, 'coins.set', {
            targetType: 'user',
            targetId: params.id,
            detail: `set to ${coins}`,
          });
          await createNotification({
            userId: params.id,
            type: 'SYSTEM',
            entityType: 'coins',
            entityId: params.id,
            preview: `An admin set your RMH coin balance to ${coins.toLocaleString()}.`,
            link: '/predictions',
          }).catch(() => {});

          return Response.json({ success: true, coins: profile.coins });
        },
      ),
    },
  },
});
