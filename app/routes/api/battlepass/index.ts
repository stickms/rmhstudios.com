import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { CURRENT_SEASON, tierForXp } from '@/lib/battlepass/season';

/** GET /api/battlepass — the current season's tiers + the viewer's progress. */
export const Route = createFileRoute('/api/battlepass/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);

        let seasonXp = 0;
        let premium = false;
        let claimedFree: number[] = [];
        let claimedPaid: number[] = [];
        if (session) {
          const sp = await prisma.userSeasonProgress.findUnique({
            where: { userId_seasonId: { userId: session.user.id, seasonId: CURRENT_SEASON.id } },
            select: { seasonXp: true, premium: true, claimedFree: true, claimedPaid: true },
          });
          seasonXp = sp?.seasonXp ?? 0;
          premium = sp?.premium ?? false;
          claimedFree = (sp?.claimedFree as number[]) ?? [];
          claimedPaid = (sp?.claimedPaid as number[]) ?? [];
        }

        return Response.json({
          season: {
            id: CURRENT_SEASON.id,
            name: CURRENT_SEASON.name,
            endsAt: CURRENT_SEASON.endsAt,
            premiumPrice: CURRENT_SEASON.premiumPrice,
            xpPerTier: CURRENT_SEASON.xpPerTier,
          },
          tiers: CURRENT_SEASON.tiers,
          seasonXp,
          currentTier: tierForXp(seasonXp),
          premium,
          claimedFree,
          claimedPaid,
          signedIn: !!session,
        });
      },
    },
  },
});
