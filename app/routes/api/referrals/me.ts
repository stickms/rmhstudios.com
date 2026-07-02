import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getOrCreateReferralCode, REFERRAL_REWARD } from '@/lib/referrals.server';

/**
 * GET /api/referrals/me — the caller's invite code (created on first call),
 * share URL, reward amount, and simple stats.
 */
export const Route = createFileRoute('/api/referrals/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const userId = session.user.id;
          const [code, invited, rewarded] = await Promise.all([
            getOrCreateReferralCode(userId),
            prisma.referral.count({ where: { referrerId: userId } }),
            prisma.referral.count({ where: { referrerId: userId, rewardedAt: { not: null } } }),
          ]);
          const origin = new URL(request.url).origin;
          return Response.json({
            code,
            url: `${origin}/ref/${code}`,
            reward: REFERRAL_REWARD,
            invited,
            rewarded,
          });
        } catch (error) {
          console.error('Referral me error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
