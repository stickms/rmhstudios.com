import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { setUserTier } from '@/lib/doctrine/tiers';
import { logAdminAction } from '@/lib/admin-audit.server';
import type { TierId } from '@/lib/doctrine/types';

const VALID_TIERS: TierId[] = ['PUBLIC', 'INSIDER', 'OPERATOR'];

export const Route = createFileRoute('/api/doctrine/admin/tiers')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'doctrine-admin-tier' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

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
            return Response.json({ error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` }, { status: 400 });
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
    },
  },
});
