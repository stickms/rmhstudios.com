/**
 * Community insights (s03-15, server-only). Every aggregate is one `$queryRaw` over the community's
 * rows in the range, bucketed in the database, so a 10,000-post community reads counts and never rows.
 * The raw SQL names the real tables and quoted camelCase columns of `prisma/schema/`:
 * `rmheet` (RMHark), `rmheet_reaction`, `rmheet_like`, `rmheet_comment`, `community_member`,
 * `community_member_event`, `community_post_flair`, `community_flair`; a test asserts them.
 *
 * Counts only: nothing here lists who joined, left or reacted. Top posts are public posts, shown with
 * their public author. The whole answer is cached for ten minutes per community, range and zone.
 */
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { userChipSelect } from '@/lib/user-display';
import {
  compare,
  dayKeys,
  hourGrid,
  rangeBounds,
  reconstructMemberLine,
  sumDays,
  weekKeys,
  type CommunityInsightsDTO,
  type InsightRange,
  type TopPostDTO,
} from '@/lib/communities/insights';

const TTL_MS = 10 * 60_000;
const TOP_POSTS = 10;
const FLAIRS_SHOWN = 25;
const EXCERPT_CHARS = 200;

const cacheKey = (communityId: string, range: number, timeZone: string) =>
  `community:insights:${communityId}:${range}:${timeZone}`;

interface DayCount {
  day: string;
  n: number;
}
interface EventDayCount extends DayCount {
  kind: string;
}

const toMap = (rows: readonly DayCount[]) => new Map(rows.map((r) => [r.day, r.n]));

export function getCommunityInsights(
  communityId: string,
  range: InsightRange,
  timeZone: string,
): Promise<CommunityInsightsDTO> {
  return cached(cacheKey(communityId, range, timeZone), TTL_MS, () =>
    computeInsights(communityId, range, timeZone, Date.now()),
  );
}

export async function computeInsights(
  communityId: string,
  range: InsightRange,
  timeZone: string,
  nowMs: number,
): Promise<CommunityInsightsDTO> {
  const { prevStart, start, end } = rangeBounds(nowMs, range);

  const [
    firstEvent,
    members,
    postTotals,
    reactorTotals,
    weeklyPosts,
    weeklyReactions,
    joinedRows,
    eventRows,
    topRows,
    activityBins,
    flairRows,
  ] = await Promise.all([
    prisma.$queryRaw<
      {
        at: string;
      }[]
    >`
          SELECT to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "at"
          FROM "community_member_event"
          ORDER BY "id" ASC
          LIMIT 1`,
    prisma.communityMember.count({
      where: {
        communityId,
      },
    }),
    prisma.$queryRaw<
      {
        posts: number;
        prevPosts: number;
        posters: number;
        prevPosters: number;
      }[]
    >`
          SELECT
            count(*) FILTER (WHERE "createdAt" >= ${start})::int AS "posts",
            count(*) FILTER (WHERE "createdAt" < ${start})::int AS "prevPosts",
            count(DISTINCT "userId") FILTER (WHERE "createdAt" >= ${start})::int AS "posters",
            count(DISTINCT "userId") FILTER (WHERE "createdAt" < ${start})::int AS "prevPosters"
          FROM "rmheet"
          WHERE "communityId" = ${communityId}
            AND "deletedAt" IS NULL
            AND "createdAt" >= ${prevStart}
            AND "createdAt" < ${end}`,
    prisma.$queryRaw<
      {
        reactors: number;
        prevReactors: number;
      }[]
    >`
          SELECT
            count(DISTINCT x."userId") FILTER (WHERE x."at" >= ${start})::int AS "reactors",
            count(DISTINCT x."userId") FILTER (WHERE x."at" < ${start})::int AS "prevReactors"
          FROM (
            SELECT r."userId", r."createdAt" AS "at"
            FROM "rmheet_reaction" r
            JOIN "rmheet" p ON p."id" = r."rmheetId"
            WHERE p."communityId" = ${communityId} AND p."deletedAt" IS NULL
              AND r."createdAt" >= ${prevStart} AND r."createdAt" < ${end}
            UNION ALL
            SELECT l."userId", l."createdAt" AS "at"
            FROM "rmheet_like" l
            JOIN "rmheet" p ON p."id" = l."rmheetId"
            WHERE p."communityId" = ${communityId} AND p."deletedAt" IS NULL
              AND l."createdAt" >= ${prevStart} AND l."createdAt" < ${end}
          ) x`,
    prisma.$queryRaw<
      {
        week: string;
        posts: number;
        posters: number;
      }[]
    >`
          SELECT to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD') AS "week",
                 count(*)::int AS "posts",
                 count(DISTINCT "userId")::int AS "posters"
          FROM "rmheet"
          WHERE "communityId" = ${communityId}
            AND "deletedAt" IS NULL
            AND "createdAt" >= ${start} AND "createdAt" < ${end}
          GROUP BY 1`,
    prisma.$queryRaw<
      {
        week: string;
        n: number;
      }[]
    >`
          SELECT to_char(date_trunc('week', x."at"), 'YYYY-MM-DD') AS "week",
                 count(*)::int AS "n"
          FROM (
            SELECT r."createdAt" AS "at"
            FROM "rmheet_reaction" r
            JOIN "rmheet" p ON p."id" = r."rmheetId"
            WHERE p."communityId" = ${communityId} AND p."deletedAt" IS NULL
              AND r."createdAt" >= ${start} AND r."createdAt" < ${end}
            UNION ALL
            SELECT l."createdAt" AS "at"
            FROM "rmheet_like" l
            JOIN "rmheet" p ON p."id" = l."rmheetId"
            WHERE p."communityId" = ${communityId} AND p."deletedAt" IS NULL
              AND l."createdAt" >= ${start} AND l."createdAt" < ${end}
          ) x
          GROUP BY 1`,
    // Joins before the first recorded event are known only from the members who are still here.
    prisma.$queryRaw<DayCount[]>`
          SELECT to_char("joinedAt", 'YYYY-MM-DD') AS "day", count(*)::int AS "n"
          FROM "community_member"
          WHERE "communityId" = ${communityId}
            AND "joinedAt" >= ${prevStart}
            AND "joinedAt" < COALESCE(
              (SELECT "createdAt" FROM "community_member_event" ORDER BY "id" ASC LIMIT 1),
              ${end}
            )
          GROUP BY 1`,
    prisma.$queryRaw<EventDayCount[]>`
          SELECT to_char("createdAt", 'YYYY-MM-DD') AS "day", "kind", count(*)::int AS "n"
          FROM "community_member_event"
          WHERE "communityId" = ${communityId}
            AND "createdAt" >= ${prevStart} AND "createdAt" < ${end}
          GROUP BY 1, 2`,
    prisma.$queryRaw<
      {
        id: string;
        userId: string;
        excerpt: string;
        createdAt: Date;
        likes: number;
        reactions: number;
        replies: number;
      }[]
    >`
          SELECT x."id", x."userId", x."excerpt", x."createdAt", x."likes", x."reactions", x."replies"
          FROM (
            SELECT p."id", p."userId", left(p."content", ${EXCERPT_CHARS}::int) AS "excerpt", p."createdAt",
                   p."likeCount"::int AS "likes", p."commentCount"::int AS "replies",
                   (SELECT count(*)::int FROM "rmheet_reaction" r WHERE r."rmheetId" = p."id") AS "reactions"
            FROM "rmheet" p
            WHERE p."communityId" = ${communityId}
              AND p."deletedAt" IS NULL
              AND p."audience" = 'PUBLIC'
              AND p."isSensitive" = false
              AND COALESCE(p."unlockPrice", 0) = 0
              AND p."createdAt" >= ${start} AND p."createdAt" < ${end}
          ) x
          WHERE x."likes" + x."reactions" + x."replies" > 0
          ORDER BY x."likes" + x."reactions" + x."replies" DESC, x."createdAt" DESC
          LIMIT ${TOP_POSTS}::int`,
    // 15-minute bins in UTC: `hourGrid` places each in the moderator's zone, daylight saving included.
    prisma.$queryRaw<
      {
        at: string;
        n: number;
      }[]
    >`
          SELECT to_char(
                   date_trunc('hour', a."at") + floor(extract(minute FROM a."at") / 15) * interval '15 minutes',
                   'YYYY-MM-DD"T"HH24:MI:SS"Z"'
                 ) AS "at",
                 count(*)::int AS "n"
          FROM (
            SELECT p."createdAt" AS "at"
            FROM "rmheet" p
            WHERE p."communityId" = ${communityId} AND p."deletedAt" IS NULL
              AND p."createdAt" >= ${start} AND p."createdAt" < ${end}
            UNION ALL
            SELECT c."createdAt" AS "at"
            FROM "rmheet_comment" c
            JOIN "rmheet" p ON p."id" = c."rmheetId"
            WHERE p."communityId" = ${communityId} AND p."deletedAt" IS NULL AND c."deletedAt" IS NULL
              AND c."createdAt" >= ${start} AND c."createdAt" < ${end}
            UNION ALL
            SELECT r."createdAt" AS "at"
            FROM "rmheet_reaction" r
            JOIN "rmheet" p ON p."id" = r."rmheetId"
            WHERE p."communityId" = ${communityId} AND p."deletedAt" IS NULL
              AND r."createdAt" >= ${start} AND r."createdAt" < ${end}
            UNION ALL
            SELECT l."createdAt" AS "at"
            FROM "rmheet_like" l
            JOIN "rmheet" p ON p."id" = l."rmheetId"
            WHERE p."communityId" = ${communityId} AND p."deletedAt" IS NULL
              AND l."createdAt" >= ${start} AND l."createdAt" < ${end}
          ) a
          GROUP BY 1`,
    prisma.$queryRaw<
      {
        name: string | null;
        posts: number;
      }[]
    >`
          SELECT f."name" AS "name", count(*)::int AS "posts"
          FROM "rmheet" p
          LEFT JOIN "community_post_flair" pf ON pf."postId" = p."id"
          LEFT JOIN "community_flair" f ON f."id" = pf."flairId"
          WHERE p."communityId" = ${communityId}
            AND p."deletedAt" IS NULL
            AND p."createdAt" >= ${start} AND p."createdAt" < ${end}
          GROUP BY f."name"
          ORDER BY count(*) DESC, f."name" ASC
          LIMIT ${FLAIRS_SHOWN}::int`,
  ]);

  const days = dayKeys(nowMs, range);
  const prevDays = dayKeys(start.getTime() - 1, range);

  const joins = toMap(joinedRows);
  const losses = new Map<string, number>();
  const byKind = {
    leave: new Map<string, number>(),
    removed: new Map<string, number>(),
  };
  for (const row of eventRows) {
    if (row.kind === 'join') joins.set(row.day, (joins.get(row.day) ?? 0) + row.n);
    else if (row.kind === 'leave' || row.kind === 'removed') {
      byKind[row.kind].set(row.day, row.n);
      losses.set(row.day, (losses.get(row.day) ?? 0) + row.n);
    }
  }
  const pair = (counts: ReadonlyMap<string, number>) => compare(sumDays(counts, days), sumDays(counts, prevDays));
  const joined = pair(joins);
  const lost = pair(losses);

  const posts = postTotals[0];
  const reactors = reactorTotals[0];

  const postWeeks = new Map(weeklyPosts.map((r) => [r.week, r]));
  const reactionWeeks = new Map(weeklyReactions.map((r) => [r.week, r.n]));
  const weekly = weekKeys(days[0]!, days[days.length - 1]!).map((week) => ({
    week,
    posts: postWeeks.get(week)?.posts ?? 0,
    posters: postWeeks.get(week)?.posters ?? 0,
    reactions: reactionWeeks.get(week) ?? 0,
  }));

  const authors = topRows.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: [...new Set(topRows.map((r) => r.userId))],
          },
        },
        select: userChipSelect,
      })
    : [];
  const authorById = new Map(authors.map((a) => [a.id, a]));
  const topPosts: TopPostDTO[] = topRows.map((r) => {
    const author = authorById.get(r.userId);
    return {
      id: r.id,
      author: author?.handle || r.userId,
      authorName: author?.name ?? null,
      excerpt: r.excerpt,
      createdAt: r.createdAt.toISOString(),
      likes: r.likes,
      reactions: r.reactions,
      replies: r.replies,
    };
  });

  return {
    range,
    timeZone,
    lossesKnownFrom: firstEvent[0] ? firstEvent[0].at.slice(0, 10) : null,
    members,
    netChange: compare(joined.value - lost.value, joined.previous - lost.previous),
    joins: joined,
    leaves: pair(byKind.leave),
    removed: pair(byKind.removed),
    posts: compare(posts?.posts ?? 0, posts?.prevPosts ?? 0),
    posters: compare(posts?.posters ?? 0, posts?.prevPosters ?? 0),
    reactors: compare(reactors?.reactors ?? 0, reactors?.prevReactors ?? 0),
    memberLine: reconstructMemberLine({
      days,
      total: members,
      joins,
      losses,
    }),
    weekly,
    topPosts,
    hours: hourGrid(activityBins, timeZone),
    flairs: flairRows,
  };
}
