/** The member's progress summary and the season pass as route-seeded queries (redesign audit B4). */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import {
  getBattlePassApi,
  getProgressApi,
  type BattlePassPayload,
  type ProgressPayload,
} from '@/lib/battlepass/battlepass.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getProgressSummary } from '@/lib/progress-summary.server';
import { prisma } from '@/lib/prisma.server';
import { CURRENT_SEASON, tierForXp } from '@/lib/battlepass/season';

// Same body as GET /api/progress (signed in only).
const getProgressOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getProgressSummary(session.user.id);
});

// Same body as GET /api/battlepass (the viewer's progress is optional).
const getBattlepassOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
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
  return {
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
  };
});

export const progressSummaryQuery = () =>
  queryOptions({
    queryKey: ['progress', 'summary'],
    queryFn: routeQueryFn<ProgressPayload>(
      () => getProgressOnServer(),
      () => api(getProgressApi),
    ),
    staleTime: 15_000,
  });

export const battlepassQuery = () =>
  queryOptions({
    queryKey: ['progress', 'battlepass'],
    queryFn: routeQueryFn<BattlePassPayload>(
      () => getBattlepassOnServer(),
      () => api(getBattlePassApi),
    ),
    staleTime: 15_000,
  });
