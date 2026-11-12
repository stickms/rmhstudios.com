import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { setUserTier } from '@features/doctrine/engine/tiers';
import { logAdminAction } from '@/lib/admin-audit.server';
import type { TierId } from '@features/doctrine/engine/types';

const VALID_TIERS: TierId[] = ['PUBLIC', 'INSIDER', 'OPERATOR'];

export const route = apiRoute('/api/doctrine/admin/tiers', {
  POST: defineHandler(
    { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'doctrine-admin-tier' } },
    async ({ request, session }) => {
      try {
        // Check admin
        const admin = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { isAdmin: true },
        });

        if (!admin?.isAdmin) {
          return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const body = await request.json();
        const { userId, tier } = body;

        if (!userId || typeof userId !== 'string') {
          return Response.json({ error: 'userId is required' }, { status: 400 });
        }

        if (!VALID_TIERS.includes(tier)) {
          return Response.json(
            { error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` },
            { status: 400 },
          );
        }

        const result = await setUserTier(userId, tier);
        await logAdminAction(session.user.id, 'doctrine.tier.set', {
          targetType: 'User',
          targetId: userId,
          detail: tier,
        });
        return Response.json({ success: true, ...result });
      } catch (e) {
        console.error('Doctrine admin tier change failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
