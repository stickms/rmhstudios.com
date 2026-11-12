import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMyReferralApi } from '@/lib/referrals.contract';
import { prisma } from '@/lib/prisma.server';
import { getOrCreateReferralCode, REFERRAL_REWARD } from '@/lib/referrals.server';

/**
 * GET /api/referrals/me — the caller's invite code (created on first call),
 * share URL, reward amount, and simple stats.
 */
export const route = apiRoute('/api/referrals/me', {
  GET: implement(getMyReferralApi, {}, async ({ request, session }) => {
    const userId = session.user.id;
    const [code, invited, rewarded] = await Promise.all([
      getOrCreateReferralCode(userId),
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.referral.count({ where: { referrerId: userId, rewardedAt: { not: null } } }),
    ]);
    const origin = new URL(request.url).origin;
    return {
      code,
      url: `${origin}/ref/${code}`,
      reward: REFERRAL_REWARD,
      invited,
      rewarded,
    };
  }),
});
