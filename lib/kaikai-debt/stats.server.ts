/**
 * The analytics read for the Kaikai Debt Counter. Server-only.
 *
 * One job: turn a table that is designed to grow forever into a fixed-size
 * payload of aggregates, cheaply enough that a public page can ask for it.
 *
 * ## Everything is aggregated in Postgres, nothing is scanned in Node
 *
 * The same constraint `ledger.server.ts` is built around applies with more
 * force here: the ledger is *infinite by design*, so any statistic computed by
 * loading rows into JavaScript is a statistic that stops working at exactly the
 * moment the feature succeeds. Every number below is a SQL aggregate over one
 * indexed pass, including the ones that look like they need sorting — the
 * percentiles are `percentile_cont`, and the Gini coefficient is a single
 * window function (see {@link readMoments}).
 *
 * ## Every group reports a basis, not just a sum
 *
 * `debt.ts` shows that the ledger's compounded total factorises into one scalar
 * per subset: `Σ aᵢ·e^(−r·tᵢ)`. That is computed here **per group** — per
 * category, per month, per creditor, per hour of the week — so the browser can
 * multiply by `e^(r·t)` and get a chart that keeps growing while it is looked
 * at, without another request. {@link BASIS_SQL} is that expression, written
 * once and interpolated into every query, because two copies of it that drifted
 * apart would be two charts that disagree with the odometer.
 *
 * ## Cost, and the cache
 *
 * This is ~7 aggregate queries over the whole table. That is not a per-request
 * cost anybody should pay: it is read once per {@link STATS_TTL_MS} into a
 * process-local cache and shared by every reader in that window, exactly like
 * `getTotals`. The numbers are a *snapshot* and the page says so; what moves
 * between snapshots is the compounding, which the client does itself.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import {
  ANNUAL_INTEREST_RATE,
  DEBT_EPOCH_MS,
  isDebtCategory,
  type DebtCategory,
  type DebtEntryDto,
  type DebtPerson,
  type DebtSource,
} from '@/lib/kaikai-debt/debt';
import {
  CATEGORY_ORDER,
  DISTRIBUTION_EDGES,
  GRID_MONTH_LIMIT,
  emptyStats,
  type CategoryStat,
  type DebtMoments,
  type DebtStats,
  type DistributionBucket,
  type GridCell,
  type PersonStat,
  type RhythmCell,
  type SourceStat,
  type TimelineBucket,
} from '@/lib/kaikai-debt/stats';

/**
 * How long an analytics read is reused.
 *
 * Much longer than the counter's 5s totals cache, and deliberately so: the
 * counter's basis has to include your own submission the instant you make it,
 * while a histogram that is thirty seconds behind is a histogram that is
 * correct. The charts are never *stale* in the way that matters — their growth
 * comes from the clock, not from the payload.
 */
const STATS_TTL_MS = 30_000;

let statsCache: { at: number; value: DebtStats } | null = null;

/**
 * `Σ amountCents · e^(−r · max(0, age in years))` — the basis, in SQL.
 *
 * The `GREATEST(0, …)` mirrors `secondsSinceEpoch`'s floor, which is what makes
 * a pre-epoch receipt contribute its face value rather than an exponentially
 * *inflated* one. Written once, used by every grouped query below.
 *
 * Takes its two column references as `Prisma.Sql` fragments rather than baking
 * in bare `"amountCents"` / `"createdAt"`, because the leaderboard query joins
 * `"user"` — which has a `createdAt` of its own, and an unqualified reference
 * there is an ambiguous-column error rather than a wrong number. Every caller
 * passes a literal written in this file; nothing about these arguments can come
 * from a request.
 */
function basisSql(amount: Prisma.Sql, createdAt: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SUM(
      ${amount}::double precision
      * EXP(
          -${ANNUAL_INTEREST_RATE}::double precision
          * GREATEST(0, EXTRACT(EPOCH FROM (${createdAt} - ${new Date(DEBT_EPOCH_MS)}::timestamp)))
          / (365.2425 * 24 * 60 * 60)
        )
    )
  `;
}

/** The basis over an unaliased `kaikai_debt_entry`. */
const BASIS_SQL = basisSql(Prisma.sql`"amountCents"`, Prisma.sql`"createdAt"`);
/** The basis over the same table aliased `e` — the joined leaderboard queries. */
const BASIS_SQL_E = basisSql(Prisma.sql`e."amountCents"`, Prisma.sql`e."createdAt"`);

/**
 * `createdAt` is `TIMESTAMP(3)` — no time zone, holding a UTC wall clock (the
 * Prisma convention). `EXTRACT(EPOCH …)` on such a value is documented as the
 * *nominal* seconds since 1970 "without regard to time zone", which for a
 * column that is already UTC is exactly the epoch millis the client wants — and
 * is the same reading `ledger.server.ts` relies on for the basis.
 *
 * Returning the number rather than the timestamp is deliberate: a
 * `timestamp without time zone` handed back to a driver is re-interpreted in
 * whatever zone the Node process happens to be in, which would silently shift
 * every bucket on the accrual chart by the deploy host's UTC offset.
 */
const epochMs = (expr: Prisma.Sql) =>
  Prisma.sql`(EXTRACT(EPOCH FROM ${expr}) * 1000)::double precision`;

/** Postgres hands back `bigint` for counts and `numeric` for some sums. */
const num = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/* -------------------------------------------------------------------------- */
/* The individual reads                                                       */
/* -------------------------------------------------------------------------- */

async function readCategories(): Promise<CategoryStat[]> {
  const rows = await prisma.$queryRaw<
    {
      category: string;
      entries: bigint;
      principal: bigint | null;
      basis: number | null;
      lo: number | null;
      hi: number | null;
      member_entries: bigint;
      member_principal: bigint | null;
    }[]
  >(Prisma.sql`
    SELECT
      "category"                                                        AS category,
      COUNT(*)::bigint                                                  AS entries,
      SUM("amountCents")::bigint                                        AS principal,
      ${BASIS_SQL}                                                      AS basis,
      MIN("amountCents")                                                AS lo,
      MAX("amountCents")                                                AS hi,
      COUNT(*) FILTER (WHERE "source" = 'member')::bigint               AS member_entries,
      SUM("amountCents") FILTER (WHERE "source" = 'member')::bigint     AS member_principal
    FROM kaikai_debt_entry
    GROUP BY "category"
  `);

  const byCategory = new Map<string, (typeof rows)[number]>();
  for (const row of rows) byCategory.set(row.category, row);

  // Always all eight, in the canonical order, so slot `i` is category `i` in
  // every chart — the fixed-hue-assignment rule the palette depends on.
  return CATEGORY_ORDER.map((category) => {
    const row = byCategory.get(category);
    return {
      category,
      count: num(row?.entries),
      principalCents: num(row?.principal),
      basisCents: num(row?.basis),
      minCents: num(row?.lo),
      maxCents: num(row?.hi),
      memberCount: num(row?.member_entries),
      memberPrincipalCents: num(row?.member_principal),
    } satisfies CategoryStat;
  });
}

async function readTimeline(): Promise<TimelineBucket[]> {
  const rows = await prisma.$queryRaw<
    { bucket_ms: number; entries: bigint; principal: bigint | null; basis: number | null }[]
  >(Prisma.sql`
    SELECT
      ${epochMs(Prisma.sql`date_trunc('month', "createdAt")`)}  AS bucket_ms,
      COUNT(*)::bigint                                          AS entries,
      SUM("amountCents")::bigint                                AS principal,
      ${BASIS_SQL}                                              AS basis
    FROM kaikai_debt_entry
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  return rows.map((row) => ({
    startMs: num(row.bucket_ms),
    count: num(row.entries),
    principalCents: num(row.principal),
    basisCents: num(row.basis),
  }));
}

/**
 * The (month × category) grid the three spatial views share.
 *
 * Capped to the most recent {@link GRID_MONTH_LIMIT} months, and capped in SQL
 * rather than by slicing the result: the full grid is unbounded in the same way
 * the ledger is, and a `LIMIT` applied after transferring every month of a
 * decade-long archive would have already paid the cost the cap exists to avoid.
 *
 * The window is derived from the newest row rather than from `now()`, because
 * `now()` is only the right anchor while somebody is actively adding to the tab
 * — on a quiet week it would start walking the window off the end of the data
 * and the terrain would slowly go flat for no reason a viewer could see.
 */
async function readGrid(): Promise<GridCell[]> {
  const rows = await prisma.$queryRaw<
    {
      bucket_ms: number;
      category: string;
      entries: bigint;
      principal: bigint | null;
      basis: number | null;
    }[]
  >(Prisma.sql`
    WITH bounds AS (
      SELECT date_trunc('month', MAX("createdAt")) - make_interval(months => ${GRID_MONTH_LIMIT - 1})
        AS floor_month
      FROM kaikai_debt_entry
    )
    SELECT
      ${epochMs(Prisma.sql`date_trunc('month', "createdAt")`)}  AS bucket_ms,
      "category"                                                AS category,
      COUNT(*)::bigint                                          AS entries,
      SUM("amountCents")::bigint                                AS principal,
      ${BASIS_SQL}                                              AS basis
    FROM kaikai_debt_entry, bounds
    WHERE "createdAt" >= bounds.floor_month
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC
  `);

  return rows.map((row) => ({
    startMs: num(row.bucket_ms),
    category: (isDebtCategory(row.category) ? row.category : 'other') satisfies DebtCategory,
    count: num(row.entries),
    principalCents: num(row.principal),
    basisCents: num(row.basis),
  }));
}

/**
 * The amount histogram, bucketed on {@link DISTRIBUTION_EDGES}.
 *
 * `width_bucket` with an explicit array is the right tool and needs the edges as
 * a SQL array literal. They are interpolated as parameters rather than
 * stringified into the statement, so the ladder can be edited in TypeScript
 * without anyone hand-editing SQL to match — the two staying in step is the
 * whole reason the edges are exported in the first place.
 *
 * `width_bucket` returns 0 for a value below the first edge and `n` for one at
 * or above the last; both are clamped into the visible range, because a debt of
 * zero cents cannot exist (`MIN_ENTRY_CENTS` is 1) and one above the top edge
 * belongs in the open-ended bucket the chart already draws.
 */
async function readDistribution(): Promise<DistributionBucket[]> {
  const rows = await prisma.$queryRaw<
    { bucket: number; entries: bigint; principal: bigint | null; basis: number | null }[]
  >(Prisma.sql`
    SELECT
      width_bucket(
        "amountCents"::double precision,
        ARRAY[${Prisma.join(DISTRIBUTION_EDGES.map((edge) => Prisma.sql`${edge}::double precision`))}]
      )                             AS bucket,
      COUNT(*)::bigint              AS entries,
      SUM("amountCents")::bigint    AS principal,
      ${BASIS_SQL}                  AS basis
    FROM kaikai_debt_entry
    GROUP BY 1
  `);

  const base = DISTRIBUTION_EDGES.map((loCents, index) => ({
    index,
    loCents,
    hiCents: DISTRIBUTION_EDGES[index + 1] ?? Number.POSITIVE_INFINITY,
    count: 0,
    principalCents: 0,
    basisCents: 0,
  })) satisfies DistributionBucket[];

  for (const row of rows) {
    // width_bucket is 1-indexed against the edge array; 0 means "below the first
    // edge", which for a table whose minimum is one cent can only be a row
    // written before that floor existed.
    const index = Math.min(base.length - 1, Math.max(0, num(row.bucket) - 1));
    const bucket = base[index]!;
    bucket.count += num(row.entries);
    bucket.principalCents += num(row.principal);
    bucket.basisCents += num(row.basis);
  }
  return base;
}

async function readRhythm(): Promise<RhythmCell[]> {
  const rows = await prisma.$queryRaw<
    { weekday: number; hour: number; entries: bigint; principal: bigint | null; basis: number | null }[]
  >(Prisma.sql`
    SELECT
      EXTRACT(DOW  FROM "createdAt")::int  AS weekday,
      EXTRACT(HOUR FROM "createdAt")::int  AS hour,
      COUNT(*)::bigint                     AS entries,
      SUM("amountCents")::bigint           AS principal,
      ${BASIS_SQL}                         AS basis
    FROM kaikai_debt_entry
    GROUP BY 1, 2
  `);

  return rows.map((row) => ({
    weekday: num(row.weekday),
    hour: num(row.hour),
    count: num(row.entries),
    principalCents: num(row.principal),
    basisCents: num(row.basis),
  }));
}

/**
 * Top people by basis, on either side of the ledger.
 *
 * `column` is a `Prisma.Sql` fragment rather than a string, so this cannot be
 * called with anything but the two identifiers below — the join is built from
 * code, never from input, and there is no path from a request to this argument.
 */
async function readPeople(column: Prisma.Sql, limit: number): Promise<PersonStat[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string | null;
      handle: string | null;
      image: string | null;
      entries: bigint;
      principal: bigint | null;
      basis: number | null;
    }[]
  >(Prisma.sql`
    SELECT
      u.id                          AS id,
      u.name                        AS name,
      u.handle                      AS handle,
      u.image                       AS image,
      COUNT(*)::bigint              AS entries,
      SUM(e."amountCents")::bigint  AS principal,
      ${BASIS_SQL_E}                AS basis
    FROM kaikai_debt_entry e
    JOIN "user" u ON u.id = e.${column}
    GROUP BY u.id, u.name, u.handle, u.image
    ORDER BY basis DESC NULLS LAST
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    person: { id: row.id, name: row.name, handle: row.handle, image: row.image },
    count: num(row.entries),
    principalCents: num(row.principal),
    basisCents: num(row.basis),
  }));
}

/**
 * The distribution's shape: percentiles, spread, and two concentration measures.
 *
 * The Gini coefficient normally implies a sort of the whole column; it does not
 * here, because the standard discrete form
 *
 * ```
 *   G = (2·Σ i·xᵢ) / (n·Σ xᵢ) − (n + 1) / n      (xᵢ ascending, i from 1)
 * ```
 *
 * is a single pass once `row_number()` supplies the `i`, and Postgres can supply
 * it from the index that already orders the column. The HHI is the sum of
 * squared shares, which is one more aggregate over the same scan.
 */
async function readMoments(): Promise<DebtMoments> {
  const rows = await prisma.$queryRaw<
    {
      p10: number | null;
      p25: number | null;
      p50: number | null;
      p75: number | null;
      p90: number | null;
      p99: number | null;
      mean: number | null;
      stdev: number | null;
      gini: number | null;
      hhi: number | null;
    }[]
  >(Prisma.sql`
    WITH ranked AS (
      SELECT
        "amountCents"::double precision                            AS amount,
        row_number() OVER (ORDER BY "amountCents" ASC)::double precision AS rnk,
        (COUNT(*) OVER ())::double precision                       AS n,
        SUM("amountCents"::double precision) OVER ()               AS total
      FROM kaikai_debt_entry
    )
    SELECT
      percentile_cont(0.10) WITHIN GROUP (ORDER BY amount)  AS p10,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY amount)  AS p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY amount)  AS p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY amount)  AS p75,
      percentile_cont(0.90) WITHIN GROUP (ORDER BY amount)  AS p90,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY amount)  AS p99,
      AVG(amount)                                           AS mean,
      COALESCE(stddev_pop(amount), 0)                       AS stdev,
      CASE WHEN MAX(total) > 0 AND MAX(n) > 0
        THEN (2 * SUM(rnk * amount)) / (MAX(n) * MAX(total)) - (MAX(n) + 1) / MAX(n)
        ELSE 0 END                                          AS gini,
      -- Σ(aᵢ/T)² written as Σaᵢ²/T²: the same number, and not an aggregate
      -- nested inside an aggregate. The obvious spelling — dividing by
      -- MAX(total) INSIDE the SUM — is rejected outright by Postgres (42803).
      CASE WHEN MAX(total) > 0
        THEN SUM(POWER(amount, 2)) / POWER(MAX(total), 2)
        ELSE 0 END                                          AS hhi
    FROM ranked
  `);

  const row = rows[0];
  return {
    p10Cents: num(row?.p10),
    p25Cents: num(row?.p25),
    p50Cents: num(row?.p50),
    p75Cents: num(row?.p75),
    p90Cents: num(row?.p90),
    p99Cents: num(row?.p99),
    meanCents: num(row?.mean),
    stdevCents: num(row?.stdev),
    // Float error around an exactly-equal ledger can push these a hair outside
    // their definitions, and a Gini of -0.0000001 renders as "-0.0%".
    gini: Math.min(1, Math.max(0, num(row?.gini))),
    hhi: Math.min(1, Math.max(0, num(row?.hhi))),
  };
}

async function readSources(): Promise<SourceStat[]> {
  const rows = await prisma.$queryRaw<
    { source: string; entries: bigint; principal: bigint | null; basis: number | null }[]
  >(Prisma.sql`
    SELECT
      "source"                    AS source,
      COUNT(*)::bigint            AS entries,
      SUM("amountCents")::bigint  AS principal,
      ${BASIS_SQL}                AS basis
    FROM kaikai_debt_entry
    GROUP BY 1
  `);

  const bySource = new Map(rows.map((row) => [row.source, row]));
  return (['member', 'ledger'] satisfies DebtSource[]).map((source) => {
    const row = bySource.get(source);
    return {
      source,
      count: num(row?.entries),
      principalCents: num(row?.principal),
      basisCents: num(row?.basis),
    };
  });
}

async function readSpanAndCounts(): Promise<{
  oldestMs: number;
  newestMs: number;
  contributorCount: number;
  creditorCount: number;
}> {
  const rows = await prisma.$queryRaw<
    { oldest_ms: number | null; newest_ms: number | null; contributors: bigint; creditors: bigint }[]
  >(Prisma.sql`
    SELECT
      ${epochMs(Prisma.sql`MIN("createdAt")`)}   AS oldest_ms,
      ${epochMs(Prisma.sql`MAX("createdAt")`)}   AS newest_ms,
      COUNT(DISTINCT "addedById")::bigint        AS contributors,
      COUNT(DISTINCT "creditorId")::bigint       AS creditors
    FROM kaikai_debt_entry
  `);
  const row = rows[0];
  const now = Date.now();
  return {
    oldestMs: row?.oldest_ms == null ? now : num(row.oldest_ms),
    newestMs: row?.newest_ms == null ? now : num(row.newest_ms),
    contributorCount: num(row?.contributors),
    creditorCount: num(row?.creditors),
  };
}

/** The handful of individually largest lines, for the "worst offenders" list. */
async function readLargest(limit: number): Promise<DebtEntryDto[]> {
  const rows = await prisma.kaikaiDebtEntry.findMany({
    orderBy: [{ amountCents: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      source: true,
      item: true,
      note: true,
      category: true,
      amountCents: true,
      claim: true,
      createdAt: true,
      addedBy: { select: { id: true, name: true, handle: true, image: true } },
      creditor: { select: { id: true, name: true, handle: true, image: true } },
    },
  });

  const person = (u: {
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  }): DebtPerson => ({ id: u.id, name: u.name, handle: u.handle, image: u.image });

  return rows.map((row) => ({
    id: row.id,
    source: (row.source === 'ledger' ? 'ledger' : 'member') satisfies DebtSource,
    item: row.item,
    note: row.note,
    category: (isDebtCategory(row.category) ? row.category : 'other') satisfies DebtCategory,
    amountCents: row.amountCents,
    claim: row.claim,
    createdAtMs: row.createdAt.getTime(),
    addedBy: row.addedBy ? person(row.addedBy) : null,
    creditor: row.creditor ? person(row.creditor) : row.addedBy ? person(row.addedBy) : null,
  }));
}

/* -------------------------------------------------------------------------- */
/* The read                                                                   */
/* -------------------------------------------------------------------------- */

/** How many people each leaderboard names. */
const PEOPLE_LIMIT = 12;
/** How many individual lines the extremes list carries. */
const LARGEST_LIMIT = 8;

/**
 * Every statistic the analytics section draws, from the cache when it is warm.
 *
 * The queries run concurrently — they are independent aggregates over the same
 * table, and the connection pool is sized for more than seven — so the read is
 * one round trip deep rather than seven.
 *
 * Failure is non-fatal by design: this hangs off a page whose actual job is the
 * counter and the log, and a broken histogram must never be able to take those
 * down with it. The caller gets zero-filled stats and the charts render their
 * empty state.
 */
export async function getDebtStats(): Promise<DebtStats> {
  const now = Date.now();
  if (statsCache && now - statsCache.at < STATS_TTL_MS) return statsCache.value;

  try {
    const [
      categories,
      timeline,
      grid,
      distribution,
      rhythm,
      creditors,
      contributors,
      moments,
      sources,
      meta,
      largest,
    ] = await Promise.all([
      readCategories(),
      readTimeline(),
      readGrid(),
      readDistribution(),
      readRhythm(),
      readPeople(Prisma.sql`"creditorId"`, PEOPLE_LIMIT),
      readPeople(Prisma.sql`"addedById"`, PEOPLE_LIMIT),
      readMoments(),
      readSources(),
      readSpanAndCounts(),
      readLargest(LARGEST_LIMIT),
    ]);

    // The grand totals are derived from the category roll-up rather than read
    // again: one more pass over the table to recompute numbers that are already
    // in hand is a pass that can disagree with them.
    let count = 0;
    let principalCents = 0;
    let basisCents = 0;
    let memberPrincipalCents = 0;
    let memberEntryCount = 0;
    for (const c of categories) {
      count += c.count;
      principalCents += c.principalCents;
      basisCents += c.basisCents;
      memberPrincipalCents += c.memberPrincipalCents;
      memberEntryCount += c.memberCount;
    }

    const value: DebtStats = {
      // Read after the queries, so a client that starts compounding from this
      // instant is never ahead of the bases it was handed — the same ordering
      // `getSnapshot` uses, for the same reason.
      asOfMs: Date.now(),
      totals: {
        count,
        principalCents,
        basisCents,
        memberPrincipalCents,
        memberEntryCount,
        contributorCount: meta.contributorCount,
        creditorCount: meta.creditorCount,
      },
      categories,
      timeline,
      grid,
      distribution,
      rhythm,
      creditors,
      contributors,
      largest,
      moments,
      sources,
      span: { oldestMs: meta.oldestMs, newestMs: meta.newestMs },
    };

    statsCache = { at: now, value };
    return value;
  } catch (err) {
    console.error('[kaikai-debt] stats read failed:', (err as Error)?.message);
    return emptyStats(Date.now());
  }
}

/** Drop the cache. Exported for the tests and for a future write path. */
export function invalidateDebtStats(): void {
  statsCache = null;
}
