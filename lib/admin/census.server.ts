/**
 * The table and product census (third-pass audit DT1): the SQL, the stored monthly
 * snapshot and its cron. Server-only. The rules and types are in `./census.ts`.
 *
 * What a run costs: one read of `pg_stat_user_tables` (free), one catalogue query for the
 * timestamp columns, one `max()` per table that has such a column and is cheap to read
 * (through an index, or a heap of at most `CENSUS_SCAN_MAX_BYTES`; a large table with no
 * index on the column is never scanned), and four grouped reads of the playtime and
 * history tables.
 */
import { Prisma } from '@prisma/client';
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { apps, games } from '@/lib/catalog';
import { isTrackableTitle } from '@/lib/games/route-match';
import {
  CENSUS_ACTIVE_DAYS,
  CENSUS_QUIET_DAYS,
  CENSUS_TIMESTAMP_COLUMNS,
  HISTORY_GAME_TYPE,
  HISTORY_PRODUCT_OF,
  baselineOf,
  buildProducts,
  censusMonth,
  pickBaseline,
  planNewestRow,
  utcDayBefore,
  type CatalogueEntry,
  type Census,
  type CensusBaseline,
  type CensusSnapshotSummary,
  type CensusSource,
  type CensusTable,
  type CensusTimestampColumn,
  type ProductUsage,
  type TimestampColumn,
} from '@/lib/admin/census';

const DAY_MS = 86_400_000;
/** Timestamps leave SQL as ISO-8601 UTC text, so no driver or session time zone can shift them. */
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
/** The small-table reads share one transaction; Prisma's 5 s default is for request paths. */
const SCAN_TX = { maxWait: 10_000, timeout: 60_000 };
/** `max()` reads per statement. */
const NEWEST_BATCH = 40;

/* --------------------------------- tables --------------------------------- */

interface StatRow {
  table: string;
  liveRows: number;
  inserts: number;
  updates: number;
  deletes: number;
  indexScans: number;
  bytes: number;
  heapBytes: number;
  lastAutoanalyze: string | null;
  lastAnalyze: string | null;
}

interface ColumnRow {
  table: string;
  column: CensusTimestampColumn;
  quotedTable: string;
  quotedColumn: string;
  withZone: boolean;
  indexed: boolean;
}

interface NewestRead {
  table: string;
  column: CensusTimestampColumn;
  method: 'index' | 'scan';
  /** `SELECT <i> AS i, <max as ISO text> AS newest FROM <table>`; identifiers quoted by Postgres. */
  sql: (i: number) => string;
}

async function readTableStats(): Promise<StatRow[]> {
  return prisma.$queryRawUnsafe<StatRow[]>(`
    SELECT s.relname AS "table",
           s.n_live_tup::float8 AS "liveRows",
           s.n_tup_ins::float8 AS "inserts",
           s.n_tup_upd::float8 AS "updates",
           s.n_tup_del::float8 AS "deletes",
           coalesce(s.idx_scan, 0)::float8 AS "indexScans",
           pg_total_relation_size(s.relid)::float8 AS "bytes",
           pg_relation_size(s.relid)::float8 AS "heapBytes",
           to_char(s.last_autoanalyze AT TIME ZONE 'UTC', ${ISO}) AS "lastAutoanalyze",
           to_char(s.last_analyze AT TIME ZONE 'UTC', ${ISO}) AS "lastAnalyze"
    FROM pg_stat_user_tables s
    WHERE s.schemaname = 'public'
    ORDER BY s.relname
  `);
}

/** Every `updatedAt` / `createdAt` timestamp column in `public`, and whether an index leads with it. */
async function readTimestampColumns(): Promise<ColumnRow[]> {
  return prisma.$queryRaw<ColumnRow[]>(Prisma.sql`
    SELECT c.relname AS "table",
           a.attname AS "column",
           quote_ident(c.relname) AS "quotedTable",
           quote_ident(a.attname) AS "quotedColumn",
           a.atttypid = 'timestamptz'::regtype AS "withZone",
           EXISTS (
             SELECT 1
             FROM pg_index i
             JOIN pg_class ic ON ic.oid = i.indexrelid
             JOIN pg_am am ON am.oid = ic.relam
             WHERE i.indrelid = c.oid
               AND i.indisvalid
               AND i.indpred IS NULL
               AND am.amname = 'btree'
               AND i.indkey[0] = a.attnum
           ) AS "indexed"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname IN (${Prisma.join([...CENSUS_TIMESTAMP_COLUMNS])})
      AND a.atttypid IN ('timestamp'::regtype, 'timestamptz'::regtype)
  `);
}

function planReads(stats: readonly StatRow[], columns: readonly ColumnRow[]): NewestRead[] {
  const byTable = new Map<string, ColumnRow[]>();
  for (const c of columns) byTable.set(c.table, [...(byTable.get(c.table) ?? []), c]);
  const reads: NewestRead[] = [];
  for (const s of stats) {
    const cols = byTable.get(s.table) ?? [];
    const plan = planNewestRow(cols satisfies readonly TimestampColumn[], s.heapBytes);
    if (!plan) continue;
    const col = cols.find((c) => c.column === plan.column)!;
    const max = col.withZone
      ? `max(${col.quotedColumn}) AT TIME ZONE 'UTC'`
      : `max(${col.quotedColumn})`;
    reads.push({
      table: s.table,
      column: plan.column,
      method: plan.method,
      sql: (i) => `SELECT ${i} AS i, to_char(${max}, ${ISO}) AS newest FROM ${col.quotedTable}`,
    });
  }
  return reads;
}

type RawClient = Pick<typeof prisma, '$queryRawUnsafe'>;

async function runReads(
  client: RawClient,
  reads: readonly NewestRead[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let at = 0; at < reads.length; at += NEWEST_BATCH) {
    const batch = reads.slice(at, at + NEWEST_BATCH);
    const rows = await client.$queryRawUnsafe<{ i: number; newest: string | null }[]>(
      batch.map((r, i) => r.sql(i)).join('\nUNION ALL\n'),
    );
    for (const row of rows) out.set(batch[row.i]!.table, row.newest);
  }
  return out;
}

async function readNewestRows(
  stats: readonly StatRow[],
  columns: readonly ColumnRow[],
): Promise<Map<string, Pick<CensusTable, 'newestRow' | 'newestRowColumn' | 'newestRowMethod'>>> {
  const reads = planReads(stats, columns);
  const indexed = reads.filter((r) => r.method === 'index');
  const scanned = reads.filter((r) => r.method === 'scan');

  const viaIndex = await runReads(prisma, indexed);
  // The small-table reads must stay sequential scans: left to itself the planner may answer
  // from some other index that happens to carry the column, and that would count as an index
  // read of a table the census is trying to measure.
  const viaScan = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL enable_indexscan = off');
    await tx.$executeRawUnsafe('SET LOCAL enable_indexonlyscan = off');
    await tx.$executeRawUnsafe('SET LOCAL enable_bitmapscan = off');
    return runReads(tx, scanned);
  }, SCAN_TX);

  const out = new Map<
    string,
    Pick<CensusTable, 'newestRow' | 'newestRowColumn' | 'newestRowMethod'>
  >();
  for (const r of reads) {
    const newest = (r.method === 'index' ? viaIndex : viaScan).get(r.table) ?? null;
    out.set(r.table, { newestRow: newest, newestRowColumn: r.column, newestRowMethod: r.method });
  }
  return out;
}

async function readTables(): Promise<CensusTable[]> {
  // Statistics first: the reads below are themselves scans, and must not be in the numbers.
  const stats = await readTableStats();
  const newest = await readNewestRows(stats, await readTimestampColumns());
  return stats.map(({ heapBytes: _heapBytes, ...s }) => ({
    ...s,
    ...(newest.get(s.table) ?? { newestRow: null, newestRowColumn: null, newestRowMethod: null }),
  }));
}

/* -------------------------------- products -------------------------------- */

function catalogue(): CatalogueEntry[] {
  return [
    ...games.map((g) => ({ id: g.id, title: g.title, kind: 'game' as const, href: g.href })),
    ...apps.map((a) => ({ id: a.id, title: a.title, kind: 'app' as const, href: a.href })),
  ].map((e) => ({ ...e, tracked: isTrackableTitle(e.id) }));
}

/** The catalogue id a history row belongs to, as SQL. */
function historyProductId(): Prisma.Sql {
  const whens = Object.entries(HISTORY_PRODUCT_OF).map(
    ([type, id]) => Prisma.sql`WHEN ${type} THEN ${id}`,
  );
  return Prisma.sql`CASE "entityType" WHEN ${HISTORY_GAME_TYPE} THEN "entityId" ${Prisma.join(whens, ' ')} END`;
}

async function readProductUsage(now: Date): Promise<ProductUsage[]> {
  // Playtime is stored per UTC calendar day: the window is today and the days before it.
  const sinceDay = utcDayBefore(now, CENSUS_ACTIVE_DAYS - 1);
  const since = new Date(now.getTime() - CENSUS_ACTIVE_DAYS * DAY_MS);
  const types = [HISTORY_GAME_TYPE, ...Object.keys(HISTORY_PRODUCT_OF)];
  const productId = historyProductId();

  const [both, playtime, history, players] = await Promise.all([
    prisma.$queryRaw<{ id: string; actives: number }[]>(Prisma.sql`
      SELECT u.id, count(DISTINCT u."userId")::int AS actives
      FROM (
        SELECT "gameId" AS id, "userId" FROM game_playtime_day WHERE day >= ${sinceDay}::date
        UNION ALL
        SELECT ${productId} AS id, "userId" FROM history_entry
        WHERE "entityType" IN (${Prisma.join(types)}) AND "updatedAt" >= ${since}
      ) u
      GROUP BY u.id
    `),
    prisma.$queryRaw<{ id: string; actives: number }[]>(Prisma.sql`
      SELECT "gameId" AS id, count(DISTINCT "userId")::int AS actives
      FROM game_playtime_day WHERE day >= ${sinceDay}::date
      GROUP BY "gameId"
    `),
    prisma.$queryRaw<{ id: string; actives: number; last: string | null }[]>(Prisma.sql`
      SELECT h.id,
             (count(DISTINCT h."userId") FILTER (WHERE h."updatedAt" >= ${since}))::int AS actives,
             to_char(max(h."updatedAt"), ${Prisma.raw(ISO)}) AS last
      FROM (
        SELECT ${productId} AS id, "userId", "updatedAt" FROM history_entry
        WHERE "entityType" IN (${Prisma.join(types)})
      ) h
      GROUP BY h.id
    `),
    prisma.$queryRaw<{ id: string; players: number; last: string | null }[]>(Prisma.sql`
      SELECT "gameId" AS id, count(*)::int AS players,
             to_char(max("lastPlayedAt"), ${Prisma.raw(ISO)}) AS last
      FROM game_playtime
      GROUP BY "gameId"
    `),
  ]);

  const usage = new Map<string, ProductUsage>();
  const at = (id: string): ProductUsage => {
    let u = usage.get(id);
    if (!u) {
      u = { id, actives: 0, playtimeActives: 0, historyActives: 0, players: 0, lastActiveAt: null };
      usage.set(id, u);
    }
    return u;
  };
  const later = (a: string | null, b: string | null): string | null =>
    a && b ? (a > b ? a : b) : (a ?? b);
  for (const r of both) at(r.id).actives = r.actives;
  for (const r of playtime) at(r.id).playtimeActives = r.actives;
  for (const r of history) {
    const u = at(r.id);
    u.historyActives = r.actives;
    u.lastActiveAt = later(u.lastActiveAt, r.last);
  }
  for (const r of players) {
    const u = at(r.id);
    u.players = r.players;
    u.lastActiveAt = later(u.lastActiveAt, r.last);
  }
  return [...usage.values()];
}

/* --------------------------------- census --------------------------------- */

/** Take the census now. Reads only. */
export async function takeCensus(now: Date = new Date()): Promise<Census> {
  const [database] = await prisma.$queryRawUnsafe<
    { statsReset: string | null; serverVersion: string }[]
  >(`
    SELECT to_char(d.stats_reset AT TIME ZONE 'UTC', ${ISO}) AS "statsReset",
           current_setting('server_version') AS "serverVersion"
    FROM pg_stat_database d
    WHERE d.datname = current_database()
  `);
  if (!database) throw new Error('pg_stat_database has no row for the current database');
  const tables = await readTables();
  const usage = await readProductUsage(now);
  return {
    version: 1,
    takenAt: now.toISOString(),
    activeDays: CENSUS_ACTIVE_DAYS,
    quietDays: CENSUS_QUIET_DAYS,
    statsReset: database.statsReset,
    // "16.4 (Debian 16.4-1.pgdg120+2)" -> "16.4": the build string says nothing a reader needs.
    serverVersion: database.serverVersion.split(' ')[0]!,
    tables,
    products: buildProducts(catalogue(), usage),
  };
}

/* -------------------------------- snapshots ------------------------------- */

const summaryOf = (row: {
  month: string;
  takenAt: Date;
  source: string;
}): CensusSnapshotSummary => ({
  month: row.month,
  takenAt: row.takenAt.toISOString(),
  source: row.source as CensusSource,
});

/** The stored months, newest first, without their documents. */
export async function listCensusSnapshots(): Promise<CensusSnapshotSummary[]> {
  const rows = await prisma.dbCensusSnapshot.findMany({
    select: { month: true, takenAt: true, source: true },
    orderBy: { month: 'desc' },
  });
  return rows.map(summaryOf);
}

/** One stored month's census, or null when that month has none. */
export async function getCensusSnapshot(
  month: string,
): Promise<{ census: Census; source: CensusSource } | null> {
  const row = await prisma.dbCensusSnapshot.findUnique({ where: { month } });
  if (!row) return null;
  const census = row.data as unknown as Census;
  if (census.version !== 1) throw new Error(`census snapshot ${month} has an unknown version`);
  return { census, source: row.source as CensusSource };
}

/**
 * The stored snapshot a census taken at `takenAt` is compared with: the newest one at least
 * `CENSUS_QUIET_DAYS` older, reduced to its write counters. Null until the monthly job has
 * been running that long.
 */
export async function findCensusBaseline(takenAt: string): Promise<CensusBaseline | null> {
  const picked = pickBaseline(await listCensusSnapshots(), takenAt, CENSUS_QUIET_DAYS);
  if (!picked) return null;
  const stored = await getCensusSnapshot(picked.month);
  return stored ? baselineOf(stored.census) : null;
}

/** Take the census and store it as this month's row, replacing one already there (the admin action). */
export async function replaceCensusSnapshot(
  now: Date = new Date(),
): Promise<CensusSnapshotSummary> {
  const census = await takeCensus(now);
  const data = census as unknown as Prisma.InputJsonValue;
  const row = await prisma.dbCensusSnapshot.upsert({
    where: { month: censusMonth(now) },
    create: { month: censusMonth(now), takenAt: now, source: 'manual', data },
    update: { takenAt: now, source: 'manual', data },
    select: { month: true, takenAt: true, source: true },
  });
  return summaryOf(row);
}

/**
 * The cron's tick: store this month's census unless the month already has one. Safe to
 * deliver twice (the month is the primary key), and a manual snapshot is never overwritten.
 */
export async function ensureMonthlyCensusSnapshot(
  now: Date = new Date(),
): Promise<{ month: string; written: boolean }> {
  const month = censusMonth(now);
  const existing = await prisma.dbCensusSnapshot.findUnique({
    where: { month },
    select: { month: true },
  });
  if (existing) return { month, written: false };
  const census = await takeCensus(now);
  const { count } = await prisma.dbCensusSnapshot.createMany({
    data: [
      { month, takenAt: now, source: 'cron', data: census as unknown as Prisma.InputJsonValue },
    ],
    skipDuplicates: true,
  });
  return { month, written: count === 1 };
}

/* ----------------------------------- cron ---------------------------------- */

export const CENSUS_QUEUE = 'ops.db-census';
/**
 * Daily at 03:40 UTC, in the quiet window. The snapshot is monthly; the tick is daily so a
 * worker that was down on the 1st still writes the month's row the next night. Every other
 * night it is one primary-key lookup.
 */
export const CENSUS_CRON = '40 3 * * *';

export async function registerCensusCron(boss: PgBoss): Promise<void> {
  // No retries: a failed night is retried by the next one.
  await boss.createQueue(CENSUS_QUEUE, { policy: 'exclusive', retryLimit: 0 });
  await boss.schedule(CENSUS_QUEUE, CENSUS_CRON, {}, { tz: 'UTC' });
  await boss.work(CENSUS_QUEUE, async () => {
    const result = await ensureMonthlyCensusSnapshot();
    if (result.written) console.log(`[census] stored the ${result.month} snapshot`);
  });
}
