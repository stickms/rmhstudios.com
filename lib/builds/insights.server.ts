/**
 * Build insights (s04-05, server-only). One `$queryRaw` per table groups the build's rows by UTC day over the previous
 * period and the range together, so a build with a million views reads at most 2 x 90 rows per table. The raw SQL names
 * the real tables and quoted camelCase columns of `prisma/schema/builds.prisma`: `build_view`, `build_like`,
 * `build_comment`, `build_unlock` (`"buildId"`, `"createdAt"`, `"pricePaid"`); a test asserts them.
 *
 * Counts only: nothing here names a viewer, liker, commenter or buyer. Who may read is decided here (`canReadInsights`),
 * so the endpoint module only identifies the caller.
 */
import { prisma } from '@/lib/prisma.server';
import { listReleases } from '@/lib/builds/releases.server';
import {
  buildInsights,
  rangeBounds,
  type BuildDayCounts,
  type BuildInsightRange,
  type BuildInsightsDTO,
  type DayMap,
} from '@/lib/builds/insights';

export interface InsightsViewer {
  id: string;
  isAdmin: boolean;
}

interface DayRow {
  day: string;
  n: number;
  coins?: number;
}

/** The build's owner and site admins may read; anyone else is told the build does not exist. */
export function canReadInsights(build: { userId: string }, viewer: InsightsViewer | null): boolean {
  return !!viewer && (viewer.isAdmin || viewer.id === build.userId);
}

function merge(map: DayMap, rows: readonly DayRow[], key: keyof BuildDayCounts): void {
  for (const row of rows) map.set(row.day, { ...map.get(row.day), [key]: row.n });
}

/** The insights of a build (id or slug) for `viewer`, or null when it does not exist or the viewer may not read them. */
export async function getBuildInsights(
  idOrSlug: string,
  viewer: InsightsViewer | null,
  range: BuildInsightRange,
  nowMs: number = Date.now(),
): Promise<BuildInsightsDTO | null> {
  const select = { id: true, userId: true, title: true, isCurated: true } as const;
  const build =
    (await prisma.userBuild.findUnique({ where: { id: idOrSlug }, select })) ??
    (await prisma.userBuild.findUnique({ where: { slug: idOrSlug }, select }));
  if (!build || !canReadInsights(build, viewer)) return null;

  const { prevStart, start, end } = rangeBounds(nowMs, range);
  const buildId = build.id;

  const [views, likes, comments, unlocks, releases] = await Promise.all([
    build.isCurated
      ? Promise.resolve([] as DayRow[])
      : prisma.$queryRaw<DayRow[]>`
          SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "day", count(*)::int AS "n"
          FROM "build_view"
          WHERE "buildId" = ${buildId} AND "createdAt" >= ${prevStart} AND "createdAt" < ${end}
          GROUP BY 1`,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "day", count(*)::int AS "n"
      FROM "build_like"
      WHERE "buildId" = ${buildId} AND "createdAt" >= ${prevStart} AND "createdAt" < ${end}
      GROUP BY 1`,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "day", count(*)::int AS "n"
      FROM "build_comment"
      WHERE "buildId" = ${buildId} AND "createdAt" >= ${prevStart} AND "createdAt" < ${end}
      GROUP BY 1`,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "day", count(*)::int AS "n",
        COALESCE(sum("pricePaid"), 0)::float8 AS "coins"
      FROM "build_unlock"
      WHERE "buildId" = ${buildId} AND "createdAt" >= ${prevStart} AND "createdAt" < ${end}
      GROUP BY 1`,
    // The viewer is already allowed to read this build's insights, so its private build's releases are theirs to see.
    listReleases(buildId, build.userId),
  ]);

  const counts: DayMap = new Map();
  merge(counts, views, 'views');
  merge(counts, likes, 'likes');
  merge(counts, comments, 'comments');
  merge(counts, unlocks, 'unlocks');
  for (const row of unlocks) counts.set(row.day, { ...counts.get(row.day), coins: row.coins ?? 0 });

  return buildInsights(
    nowMs,
    range,
    build,
    counts,
    (releases ?? []).filter((r) => Date.parse(r.createdAt) >= start.getTime()),
  );
}
