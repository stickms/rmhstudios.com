import { prisma } from '@/lib/prisma.server';

const COHORT_WEEKS = 12;

/**
 * Recompute weekly signup cohorts x weeks-later activity.
 * "Active" = the member signed in (session) or has an Activity row that week.
 * Idempotent: rewrites the window it covers.
 */
export async function computeCohortRetention(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - COHORT_WEEKS * 7);

  const sizes = await prisma.$queryRaw<{ cw: Date; size: bigint }[]>`
    SELECT date_trunc('week', "createdAt")::date AS cw, count(*) AS size
    FROM "user"
    WHERE "createdAt" >= ${start} AND "isBot" = false
    GROUP BY 1`;
  const active = await prisma.$queryRaw<{ cw: Date; wk: number; n: bigint }[]>`
    WITH u AS (
      SELECT id, date_trunc('week', "createdAt") AS cw FROM "user"
      WHERE "createdAt" >= ${start} AND "isBot" = false
    ), act AS (
      SELECT "userId", "at" AS ts FROM "activity" WHERE "at" >= ${start}
      UNION ALL
      SELECT "userId", "createdAt" AS ts FROM "session" WHERE "createdAt" >= ${start}
    )
    SELECT u.cw::date AS cw,
           floor(extract(epoch FROM (date_trunc('week', act.ts) - u.cw)) / 604800)::int AS wk,
           count(DISTINCT u.id) AS n
    FROM u JOIN act ON act."userId" = u.id AND act.ts >= u.cw
    GROUP BY 1, 2`;

  const activeMap = new Map(active.map((a) => [`${a.cw.toISOString()}:${a.wk}`, Number(a.n)]));
  const nowWeek = Date.now();
  const rows: { cohortWeek: Date; weeksLater: number; cohortSize: number; active: number }[] = [];
  for (const s of sizes) {
    const elapsedWeeks = Math.floor((nowWeek - s.cw.getTime()) / (7 * 86_400_000));
    for (let w = 0; w <= Math.min(elapsedWeeks, COHORT_WEEKS); w++) {
      rows.push({
        cohortWeek: s.cw,
        weeksLater: w,
        cohortSize: Number(s.size),
        active: activeMap.get(`${s.cw.toISOString()}:${w}`) ?? 0,
      });
    }
  }
  await prisma.$transaction([
    prisma.cohortRetention.deleteMany({ where: { cohortWeek: { gte: start } } }),
    prisma.cohortRetention.createMany({ data: rows }),
  ]);
  return rows.length;
}

export async function getCohortRetention() {
  const rows = await prisma.cohortRetention.findMany({
    orderBy: [{ cohortWeek: 'desc' }, { weeksLater: 'asc' }],
    take: (COHORT_WEEKS + 1) * (COHORT_WEEKS + 1),
  });
  const cohorts = new Map<
    string,
    { cohortWeek: string; size: number; weeks: Record<number, number> }
  >();
  let computedAt: Date | null = null;
  for (const r of rows) {
    const k = r.cohortWeek.toISOString().slice(0, 10);
    const c = cohorts.get(k) ?? { cohortWeek: k, size: r.cohortSize, weeks: {} };
    c.weeks[r.weeksLater] = r.cohortSize ? r.active / r.cohortSize : 0;
    cohorts.set(k, c);
    if (!computedAt || r.computedAt > computedAt) computedAt = r.computedAt;
  }
  return { cohorts: [...cohorts.values()], computedAt: computedAt?.toISOString() ?? null };
}
