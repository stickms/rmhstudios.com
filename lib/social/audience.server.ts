import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { addDays, dayKeyInZone } from '@/lib/study/stats';
import { audienceTag } from '@/lib/social/follow-events.server';
import {
  ENGAGEMENT_DAYS,
  NEW_FOLLOWER_LIMIT,
  gridFromRows,
  reconstructDaily,
  weeklyNet,
  type AudienceRange,
  type DayDelta,
} from '@/lib/social/audience';
import { resolveUserDisplay } from '@/lib/user-display';
import type { AudienceInsights } from '@/lib/social/audience.contract';

const DAY_MS = 86_400_000;
const CACHE_MS = 5 * 60_000;

interface DeltaRow {
  day: string;
  gained: number;
  lost: number;
}
interface EngagementRow {
  dow: number;
  hour: number;
  n: number;
}
interface MutualRow {
  followers: number;
  mutual: number;
}

/**
 * The member's own audience view, cached five minutes per user, range and zone and filed
 * under `audience:<userId>` so a follow change drops it at once. `timeZone` must already be
 * validated. Every query is scoped to `userId`, uses bound parameters only, and returns
 * counts: a lost follower is a number, never an id.
 */
export function getAudienceInsights(
  userId: string,
  options: {
    range: AudienceRange;
    timeZone: string;
  },
): Promise<AudienceInsights> {
  const { range, timeZone } = options;
  return cached(
    `audience:${userId}:${range}:${timeZone}`,
    CACHE_MS,
    () => load(userId, range, timeZone),
    {
      tags: [audienceTag(userId)],
    },
  );
}

async function load(
  userId: string,
  range: AudienceRange,
  timeZone: string,
): Promise<AudienceInsights> {
  const now = new Date();
  const today = dayKeyInZone(now, timeZone);
  const windowStart = addDays(today, -(range - 1));
  // Generous in UTC terms; rows before `windowStart` in the viewer's zone are dropped below.
  const since = new Date(now.getTime() - (range + 1) * DAY_MS);
  const engagementSince = new Date(now.getTime() - ENGAGEMENT_DAYS * DAY_MS);

  const [user, first, logged, engagementRows, mutualRows, recent] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        followerCount: true,
      },
    }),
    prisma.followEvent.findFirst({
      where: {
        followingId: userId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.$queryRaw<DeltaRow[]>`
      SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)::date, 'YYYY-MM-DD') AS day,
             (count(*) FILTER (WHERE kind = 'follow'))::int AS gained,
             (count(*) FILTER (WHERE kind <> 'follow'))::int AS lost
      FROM follow_event
      WHERE "followingId" = ${userId} AND "createdAt" >= ${since}
      GROUP BY 1`,
    prisma.$queryRaw<EngagementRow[]>`
      SELECT extract(dow FROM t.at)::int AS dow, extract(hour FROM t.at)::int AS hour, count(*)::int AS n
      FROM (
        SELECT (e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text AS at
        FROM rmheet_like e JOIN rmheet p ON p.id = e."rmheetId"
        WHERE p."userId" = ${userId} AND p."deletedAt" IS NULL AND e."userId" <> ${userId} AND e."createdAt" >= ${engagementSince}
        UNION ALL
        SELECT (e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text
        FROM rmheet_comment e JOIN rmheet p ON p.id = e."rmheetId"
        WHERE p."userId" = ${userId} AND p."deletedAt" IS NULL AND e."userId" <> ${userId} AND e."createdAt" >= ${engagementSince}
        UNION ALL
        SELECT (e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text
        FROM rmheet_repost e JOIN rmheet p ON p.id = e."rmheetId"
        WHERE p."userId" = ${userId} AND p."deletedAt" IS NULL AND e."userId" <> ${userId} AND e."createdAt" >= ${engagementSince}
      ) t
      GROUP BY 1, 2`,
    prisma.$queryRaw<MutualRow[]>`
      SELECT count(*)::int AS followers, count(b.id)::int AS mutual
      FROM follow f
      LEFT JOIN follow b ON b."followerId" = ${userId} AND b."followingId" = f."followerId"
      WHERE f."followingId" = ${userId}`,
    prisma.follow.findMany({
      where: {
        followingId: userId,
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: NEW_FOLLOWER_LIMIT,
      select: {
        createdAt: true,
        follower: {
          select: {
            id: true,
            name: true,
            image: true,
            handle: true,
            profile: {
              select: {
                displayName: true,
                customImage: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const logStart = first ? dayKeyInZone(first.createdAt, timeZone) : null;

  // Before the log began only the surviving follows are known, so those days are gains only.
  const beforeLog = first ? Prisma.sql`AND "createdAt" < ${first.createdAt}` : Prisma.empty;
  const [legacy, followBacks] = await Promise.all([
    prisma.$queryRaw<DeltaRow[]>`
      SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)::date, 'YYYY-MM-DD') AS day,
             count(*)::int AS gained, 0 AS lost
      FROM follow
      WHERE "followingId" = ${userId} AND "createdAt" >= ${since} ${beforeLog}
      GROUP BY 1`,
    recent.length
      ? prisma.follow.findMany({
          where: {
            followerId: userId,
            followingId: {
              in: recent.map((r) => r.follower.id),
            },
          },
          select: {
            followingId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const deltas: DayDelta[] = [...logged, ...legacy]
    .filter((r) => r.day >= windowStart && r.day <= today)
    .map((r) => ({
      date: r.day,
      gained: r.gained,
      lost: r.lost,
    }));
  const days = reconstructDaily(user?.followerCount ?? 0, deltas, range, timeZone, logStart, now);
  const totals = days.reduce(
    (sum, d) => ({
      gained: sum.gained + d.gained,
      lost: sum.lost + d.lost,
      net: sum.net + d.net,
    }),
    {
      gained: 0,
      lost: 0,
      net: 0,
    },
  );
  const followed = new Set(followBacks.map((f) => f.followingId));
  const mutuals = mutualRows[0] ?? {
    followers: 0,
    mutual: 0,
  };

  return {
    range,
    today,
    logStart,
    followerCount: user?.followerCount ?? 0,
    days,
    totals,
    weeks: weeklyNet(days),
    newFollowers: recent
      .filter((r) => dayKeyInZone(r.createdAt, timeZone) >= windowStart)
      .map((r) => {
        const shown = resolveUserDisplay(r.follower);
        return {
          id: r.follower.id,
          name: shown.name,
          handle: r.follower.handle,
          image: shown.image,
          followedAt: r.createdAt.toISOString(),
          followsBack: followed.has(r.follower.id),
        };
      }),
    engagement: gridFromRows(engagementRows),
    mutuals,
  };
}
