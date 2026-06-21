import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getStake } from '@/lib/staking/staking.server';

/** GET /api/staking — the viewer's vault (principal + live accrued interest). */
export const Route = createFileRoute('/api/staking/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const [stake, profile] = await Promise.all([
            getStake(session.user.id),
            prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { coins: true } }),
          ]);
          return Response.json({ ...stake, balance: profile?.coins ?? 0 });
        } catch (error) {
          console.error('Staking status error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
