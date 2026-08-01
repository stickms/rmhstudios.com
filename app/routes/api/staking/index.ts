import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getStake } from '@/lib/staking/staking.server';

/** GET /api/staking — the viewer's vault (principal + live accrued interest). */
export const Route = createFileRoute('/api/staking/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const [stake, profile] = await Promise.all([
          getStake(session.user.id),
          prisma.userProfile.findUnique({
            where: { userId: session.user.id },
            select: { coins: true },
          }),
        ]);
        return Response.json({ ...stake, balance: profile?.coins ?? 0 });
      }),
    },
  },
});
