import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getOrCreateReferralCode, REFERRAL_REWARD } from '@/lib/referrals.server';

/**
 * GET /api/referrals/me — the caller's invite code (created on first call),
 * share URL, reward amount, and simple stats.
 */
export const Route = createFileRoute('/api/referrals/me')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ request, session }) => {
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
      }),
    },
  },
});
