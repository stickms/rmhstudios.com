import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getStake } from '@/lib/staking/staking.server';

/** GET /api/staking — the viewer's vault (principal + live accrued interest). */
export const route = apiRoute('/api/staking', {
  GET: defineHandler({}, async ({ session }) => {
    const [stake, profile] = await Promise.all([
      getStake(session.user.id),
      prisma.userProfile.findUnique({
        where: { userId: session.user.id },
        select: { coins: true },
      }),
    ]);
    return Response.json({ ...stake, balance: Number(profile?.coins ?? 0) });
  }),
});
