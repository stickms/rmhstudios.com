/**
 * The co-op record and the co-op boards (sprint 14 04), server side. `AltairCoopProfile` is written only from
 * server-verified co-op matches; this is the first thing that reads it. The favourite class is computed from the
 * member's `AltairMatchPlayer` rows now, never from the stored `favoriteClassId` (the first class ever played).
 *
 * The boards leave out the members `leaderboardHiddenUserIds()` names (opted out, banned now). `AltairCoopProfile.userId`
 * is required, so the where-fragment is `userNotHiddenWhere`, not the null-tolerant `notHiddenWhere`. A member's own
 * place is not computed.
 */
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { userNotHiddenWhere } from '@/lib/game/leaderboard-privacy';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import {
  favouriteClassId,
  winRatePercent,
  type ClassCount,
  type CoopBoardEntry,
  type CoopBoardKind,
  type CoopRecord,
} from './coop-record';

/** Rows a co-op board lists. */
export const COOP_BOARD_SIZE = 10;

const ANONYMOUS_NAME = 'Player';

/** The class the member played most in co-op, ties to the most recent. */
async function computedFavouriteClass(userId: string): Promise<string | null> {
  const groups = await prisma.altairMatchPlayer.groupBy({
    by: ['classId'],
    where: { userId },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const counts: ClassCount[] = (Array.isArray(groups) ? groups : []).map((g) => ({
    classId: g.classId,
    count: g._count._all,
    lastPlayedAt: g._max.createdAt ? g._max.createdAt.getTime() : 0,
  }));
  return favouriteClassId(counts);
}

/** The member's co-op record, or null when they have no co-op profile. */
export async function getCoopRecord(userId: string): Promise<CoopRecord | null> {
  const profile = await prisma.altairCoopProfile.findUnique({
    where: { userId },
    select: {
      totalCoopRuns: true,
      totalCoopWins: true,
      totalRevivesGiven: true,
      totalRevivesReceived: true,
      totalCoopKills: true,
    },
  });
  if (!profile) return null;
  return {
    runs: profile.totalCoopRuns,
    wins: profile.totalCoopWins,
    winRate: winRatePercent(profile.totalCoopRuns, profile.totalCoopWins),
    revivesGiven: profile.totalRevivesGiven,
    revivesReceived: profile.totalRevivesReceived,
    kills: profile.totalCoopKills,
    favouriteClass: await computedFavouriteClass(userId),
  };
}

/** The top ten for a co-op board, ordered by the indexed column with the row id as the tie-break. */
export async function coopBoard(kind: CoopBoardKind): Promise<CoopBoardEntry[]> {
  const hidden = await leaderboardHiddenUserIds();
  const rows = await prisma.altairCoopProfile.findMany({
    // A board of zeros is noise: only members with at least one win (or revive given) are listed.
    where: {
      ...userNotHiddenWhere(hidden),
      ...(kind === 'coop-wins' ? { totalCoopWins: { gt: 0 } } : { totalRevivesGiven: { gt: 0 } }),
    },
    orderBy: [kind === 'coop-wins' ? { totalCoopWins: 'desc' } : { totalRevivesGiven: 'desc' }, { id: 'asc' }],
    take: COOP_BOARD_SIZE,
    select: {
      totalCoopWins: true,
      totalRevivesGiven: true,
      totalCoopRuns: true,
      user: { select: userChipSelect },
    },
  });
  return rows.map((r) => ({
    username: r.user.name ?? r.user.handle ?? ANONYMOUS_NAME,
    totalCoopWins: r.totalCoopWins,
    totalRevivesGiven: r.totalRevivesGiven,
    totalCoopRuns: r.totalCoopRuns,
  }));
}

export interface AltairCoopExport extends CoopRecord {
  coins: number;
}

/** The member's co-op totals and computed favourite for the data export (zeros when they have never played co-op). */
export async function exportAltairCoop(userId: string): Promise<AltairCoopExport> {
  const [record, coins] = await Promise.all([
    getCoopRecord(userId),
    prisma.altairCoopProfile.findUnique({ where: { userId }, select: { totalCoopCoins: true } }),
  ]);
  return {
    runs: record?.runs ?? 0,
    wins: record?.wins ?? 0,
    winRate: record?.winRate ?? 0,
    revivesGiven: record?.revivesGiven ?? 0,
    revivesReceived: record?.revivesReceived ?? 0,
    kills: record?.kills ?? 0,
    favouriteClass: record?.favouriteClass ?? null,
    coins: coins?.totalCoopCoins ?? 0,
  };
}
