/**
 * Playtime: crediting heartbeats and reading the result back out.
 *
 * Every read path funnels through `canViewPlaytime` — the database `where` only
 * narrows the candidates (so a popular title does not load every player), the
 * JS check is the authority. A private user can therefore never appear here
 * even if a query is later loosened.
 *
 * Crediting is an optimistic lock: the credit is computed from the
 * `lastHeartbeatAt` we read and written with `updateMany(... lastHeartbeatAt =
 * read)`, so two tabs beating at the same instant are credited once.
 */

import { prisma } from '@/lib/prisma.server';
import { isTrackableTitle } from '@/lib/games/route-match';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import { creditSeconds } from '@/lib/playtime/credit';
import type { PlayerView, PlaytimeActivity } from '@/lib/playtime/types';
import { canViewPlaytime, isPlaytimePrivacy, type PlaytimePrivacy } from '@/lib/playtime/privacy';

export type { PlayerView, PlaytimeActivity };

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 14;

/** UTC calendar day of `d`, as the `@db.Date` column stores it. */
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002';
}

/** Credit one heartbeat. `credited` is 0 when the beat was too soon or lost a race. */
export async function recordHeartbeat(
  userId: string,
  gameId: string,
  now: Date = new Date(),
): Promise<{ credited: number }> {
  if (!isTrackableTitle(gameId)) throw new Error('unknown title');
  const day = utcDay(now);
  const dayKey = { userId_gameId_day: { userId, gameId, day } };

  try {
    return await prisma.$transaction(async (tx) => {
      // One clock per user, not per title: this user's beats run one at a time
      // (`pg_advisory_xact_lock` is held to the end of the transaction), and the
      // gap is measured from their latest accepted beat on ANY title. Otherwise two
      // windows, or a script posting for several titles, would earn several clocks
      // and inflate the hours shown in "Most played by".
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const [row, latest] = await Promise.all([
        tx.gamePlaytime.findUnique({
          where: { userId_gameId: { userId, gameId } },
          select: { lastHeartbeatAt: true },
        }),
        tx.gamePlaytime.findFirst({
          where: { userId },
          orderBy: { lastHeartbeatAt: 'desc' },
          select: { lastHeartbeatAt: true },
        }),
      ]);
      const credit = creditSeconds(latest?.lastHeartbeatAt ?? null, now);
      if (credit === 0) return { credited: 0 };

      if (!row) {
        await tx.gamePlaytime.create({
          data: {
            userId,
            gameId,
            totalSeconds: credit,
            lastHeartbeatAt: now,
            lastPlayedAt: now,
          },
        });
      } else {
        const won = await tx.gamePlaytime.updateMany({
          where: { userId, gameId, lastHeartbeatAt: row.lastHeartbeatAt },
          data: {
            totalSeconds: { increment: credit },
            lastHeartbeatAt: now,
            lastPlayedAt: now,
          },
        });
        if (won.count === 0) return { credited: 0 };
      }
      await tx.gamePlaytimeDay.upsert({
        where: dayKey,
        create: { userId, gameId, day, seconds: credit },
        update: { seconds: { increment: credit } },
      });
      return { credited: credit };
    });
  } catch (e) {
    // Belt and braces: the advisory lock serialises a user's beats, but a lost
    // create race would still be a beat that must not be credited.
    if (isUniqueViolation(e)) return { credited: 0 };
    throw e;
  }
}

/** Seconds played per user over the last 14 days, for the given users. */
async function recentSeconds(
  userIds: string[],
  gameId: string,
  now: Date,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const rows = await prisma.gamePlaytimeDay.findMany({
    where: {
      userId: userIds.length === 1 ? userIds[0] : { in: userIds },
      gameId,
      day: { gte: utcDay(new Date(now.getTime() - WINDOW_DAYS * DAY_MS)) },
    },
    select: { userId: true, seconds: true },
  });
  for (const r of rows as { userId?: string; seconds: number }[]) {
    const id = r.userId ?? userIds[0];
    out.set(id, (out.get(id) ?? 0) + r.seconds);
  }
  return out;
}

/** The viewer's own totals for one title (no privacy question: it is theirs). */
export async function getActivity(
  userId: string,
  gameId: string,
  now: Date = new Date(),
): Promise<PlaytimeActivity> {
  const [row, recent] = await Promise.all([
    prisma.gamePlaytime.findUnique({
      where: { userId_gameId: { userId, gameId } },
      select: { totalSeconds: true, lastPlayedAt: true },
    }),
    recentSeconds([userId], gameId, now),
  ]);
  return {
    totalSeconds: row?.totalSeconds ?? 0,
    last2WeeksSeconds: recent.get(userId) ?? 0,
    lastPlayedAt: row?.lastPlayedAt.toISOString() ?? null,
  };
}

type Candidate = {
  userId: string;
  totalSeconds: number;
  user: {
    id: string;
    handle: string | null;
    name: string | null;
    image: string | null;
    profile?: { displayName?: string | null; customImage?: string | null } | null;
    playtimePrivacy: string;
  };
};

const CANDIDATE_SELECT = {
  userId: true,
  totalSeconds: true,
  user: { select: { ...userDisplaySelect, playtimePrivacy: true } },
} as const;

/** Apply the privacy rule to candidates and attach their recent totals. */
async function visiblePlayers(
  viewerId: string,
  gameId: string,
  candidates: Candidate[],
  now: Date,
): Promise<PlayerView[]> {
  const ids = candidates.map((c) => c.userId);
  const [followRows, recent] = await Promise.all([
    ids.length
      ? prisma.follow.findMany({
          where: { followerId: viewerId, followingId: { in: ids } },
          select: { followingId: true },
        })
      : Promise.resolve([] as { followingId: string }[]),
    recentSeconds(ids, gameId, now),
  ]);
  const followed = new Set(followRows.map((f) => f.followingId));
  return candidates
    .filter((c) =>
      canViewPlaytime(
        isPlaytimePrivacy(c.user.playtimePrivacy) ? c.user.playtimePrivacy : 'private',
        { viewerId, ownerId: c.userId, viewerFollowsOwner: followed.has(c.userId) },
      ),
    )
    .map((c) => ({
      userId: c.userId,
      handle: c.user.handle,
      ...resolveUserDisplay(c.user),
      totalSeconds: c.totalSeconds,
      last2WeeksSeconds: recent.get(c.userId) ?? 0,
    }));
}

/** People the viewer follows who have played the title and let the viewer see it. */
export async function listFriendsWhoPlay(
  viewerId: string | null,
  gameId: string,
  limit = 12,
  now: Date = new Date(),
): Promise<PlayerView[]> {
  if (!viewerId) return [];
  const candidates = await prisma.gamePlaytime.findMany({
    where: {
      gameId,
      user: {
        followers: { some: { followerId: viewerId } },
        playtimePrivacy: { in: ['public', 'followers'] },
      },
    },
    orderBy: { totalSeconds: 'desc' },
    take: limit,
    select: CANDIDATE_SELECT,
  });
  return visiblePlayers(viewerId, gameId, candidates as Candidate[], now);
}

/** Most-played-first, among players whose setting lets the viewer see them. */
export async function listTopPlayers(
  viewerId: string | null,
  gameId: string,
  limit = 10,
  now: Date = new Date(),
): Promise<PlayerView[]> {
  if (!viewerId) return [];
  const candidates = await prisma.gamePlaytime.findMany({
    where: {
      gameId,
      OR: [
        { userId: viewerId },
        { user: { playtimePrivacy: 'public' } },
        {
          user: {
            playtimePrivacy: 'followers',
            followers: { some: { followerId: viewerId } },
          },
        },
      ],
    },
    orderBy: { totalSeconds: 'desc' },
    take: limit,
    select: CANDIDATE_SELECT,
  });
  return visiblePlayers(viewerId, gameId, candidates as Candidate[], now);
}

/** Catalog ids the user played most recently, newest first. */
export async function listRecentGameIds(userId: string, limit = 10): Promise<string[]> {
  const rows = await prisma.gamePlaytime.findMany({
    where: { userId },
    orderBy: { lastPlayedAt: 'desc' },
    take: limit,
    select: { gameId: true },
  });
  return rows.map((r) => r.gameId);
}

export async function getPlaytimeSettings(
  userId: string,
): Promise<{ playtimePrivacy: PlaytimePrivacy; noticeDismissed: boolean }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { playtimePrivacy: true, playtimeNoticeDismissedAt: true },
  });
  return {
    playtimePrivacy: isPlaytimePrivacy(u?.playtimePrivacy) ? u.playtimePrivacy : 'public',
    noticeDismissed: !!u?.playtimeNoticeDismissedAt,
  };
}

export async function setPlaytimePrivacy(userId: string, value: PlaytimePrivacy): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { playtimePrivacy: value } });
}

export async function dismissPlaytimeNotice(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { playtimeNoticeDismissedAt: new Date() },
  });
}
