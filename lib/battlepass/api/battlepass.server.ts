import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { tierForXp } from '@/lib/battlepass/season';
import { getActiveSeason } from '@/lib/battlepass/active.server';

/** GET /api/battlepass — the current season's tiers + the viewer's progress. */
export const route = apiRoute('/api/battlepass', {
  GET: defineHandler({ auth: 'optional' }, async ({ session }) => {
    const season = await getActiveSeason();
    let seasonXp = 0;
    let premium = false;
    let claimedFree: number[] = [];
    let claimedPaid: number[] = [];
    if (session) {
      const sp = await prisma.userSeasonProgress.findUnique({
        where: { userId_seasonId: { userId: session.user.id, seasonId: season.id } },
        select: { seasonXp: true, premium: true, claimedFree: true, claimedPaid: true },
      });
      seasonXp = sp?.seasonXp ?? 0;
      premium = sp?.premium ?? false;
      claimedFree = (sp?.claimedFree as number[]) ?? [];
      claimedPaid = (sp?.claimedPaid as number[]) ?? [];
    }

    return Response.json({
      season: {
        id: season.id,
        name: season.name,
        endsAt: season.endsAt,
        premiumPrice: season.premiumPrice,
        xpPerTier: season.xpPerTier,
      },
      tiers: season.tiers,
      seasonXp,
      currentTier: tierForXp(season, seasonXp),
      premium,
      claimedFree,
      claimedPaid,
      signedIn: !!session,
    });
  }),
});
