/**
 * The table and product census (third-pass audit DT1): the pure half.
 *
 * A census is one JSON document: every table in the `public` schema with what Postgres
 * knows about it, and every catalogue product with its signed-in actives. It is read live
 * by /admin/census, stored once a month by the jobs worker (`db_census_snapshot`) and
 * rendered to `docs/_generated/db-census.md` by `pnpm db:census`. DT2 decides tiers and
 * drops from it, so every number says what it is and what it is not.
 *
 * Client-safe: types, the "quiet" rule, the catalogue join and the Markdown renderer. The
 * SQL is in `census.server.ts`.
 */

/** A product is active if a signed-in user used it in this many days. */
export const CENSUS_ACTIVE_DAYS = 30;
/** A table or product with no sign of use for this many days is "quiet". */
export const CENSUS_QUIET_DAYS = 90;
/**
 * Heap size up to which a table with no index on its timestamp column is still read for its
 * newest row (a sequential scan of at most 128 pages). Above it the column is left empty.
 */
export const CENSUS_SCAN_MAX_BYTES = 1024 * 1024;
/** Timestamp columns that date a row, in the order they are preferred. */
export const CENSUS_TIMESTAMP_COLUMNS = ['updatedAt', 'createdAt'] as const;
export type CensusTimestampColumn = (typeof CENSUS_TIMESTAMP_COLUMNS)[number];

const DAY_MS = 86_400_000;

export interface CensusTable {
  table: string;
  /** `n_live_tup`: the planner's estimate of live rows, not a count. */
  liveRows: number;
  /** `n_tup_ins` / `n_tup_upd` / `n_tup_del`: rows written since the statistics were last reset. */
  inserts: number;
  updates: number;
  deletes: number;
  /** `idx_scan`: index scans since the statistics were last reset. Sequential scans are left out (a backup makes one per table). */
  indexScans: number;
  /** Heap, indexes and TOAST together, in bytes. */
  bytes: number;
  /** When autovacuum last analysed the table; it does so only after enough rows changed. */
  lastAutoanalyze: string | null;
  /** When someone last ran ANALYZE by hand (says nothing about writes). */
  lastAnalyze: string | null;
  /** The largest value of `newestRowColumn`, where reading it is cheap. */
  newestRow: string | null;
  newestRowColumn: CensusTimestampColumn | null;
  /** How `newestRow` was read: from an index on the column, or by scanning a small table. */
  newestRowMethod: 'index' | 'scan' | null;
}

export type CensusProductKind = 'game' | 'app' | 'uncatalogued';

export interface CensusProduct {
  id: string;
  title: string;
  kind: CensusProductKind;
  href: string | null;
  /** False for an entry that cannot accrue playtime (off-site or hidden): its zeroes mean "not measured". */
  tracked: boolean;
  /** Distinct signed-in users in the window, playtime and history together. */
  actives: number;
  playtimeActives: number;
  historyActives: number;
  /** Distinct signed-in users with any playtime, ever. */
  players: number;
  /** The latest playtime heartbeat or history visit. */
  lastActiveAt: string | null;
}

export interface Census {
  version: 1;
  takenAt: string;
  activeDays: number;
  quietDays: number;
  /** `pg_stat_database.stats_reset`: the start of the "since reset" counters. Null: never reset, start unknown. */
  statsReset: string | null;
  serverVersion: string;
  tables: CensusTable[];
  products: CensusProduct[];
}

/**
 * The write counters of an earlier stored snapshot, at least `quietDays` older than the
 * census it is compared with. The difference is the one exact statement the census can
 * make: this many rows were written between the two.
 */
export interface CensusBaseline {
  takenAt: string;
  statsReset: string | null;
  /** Table name to inserts + updates + deletes at `takenAt`. */
  writes: Record<string, number>;
}

/** The newest of `snapshots` that is at least `quietDays` older than `takenAt`, or null. */
export function pickBaseline<T extends { takenAt: string }>(
  snapshots: readonly T[],
  takenAt: string,
  quietDays: number,
): T | null {
  const cutoff = Date.parse(takenAt) - quietDays * DAY_MS;
  let best: T | null = null;
  for (const s of snapshots) {
    const at = Date.parse(s.takenAt);
    if (at <= cutoff && (!best || at > Date.parse(best.takenAt))) best = s;
  }
  return best;
}

export function baselineOf(census: Census): CensusBaseline {
  return {
    takenAt: census.takenAt,
    statsReset: census.statsReset,
    writes: Object.fromEntries(census.tables.map((t) => [t.table, tableWrites(t)])),
  };
}

export type CensusSource = 'cron' | 'manual';

export interface CensusSnapshotSummary {
  /** UTC calendar month, 'YYYY-MM'. */
  month: string;
  takenAt: string;
  source: CensusSource;
}

/**
 * History rows that name a catalogue product. A `game` entry's id is the catalogue id; a
 * watched video belongs to RMHTube. The other history kinds (songs, library documents,
 * news) are content, not catalogue products, and are not counted.
 */
export const HISTORY_GAME_TYPE = 'game';
export const HISTORY_PRODUCT_OF = { tube_video: 'rmhtube' } as const;

/* ------------------------------- newest row ------------------------------- */

export interface TimestampColumn {
  column: CensusTimestampColumn;
  /** A valid, unconditional btree index leads with this column. */
  indexed: boolean;
}

/**
 * Which timestamp column to read for a table's newest row, and how, or null when no read
 * is cheap. A small heap is read whole (the preferred column, whatever its indexes); a
 * large one only through an index that leads with the column, so it is never scanned.
 */
export function planNewestRow(
  columns: readonly TimestampColumn[],
  heapBytes: number,
): { column: CensusTimestampColumn; method: 'index' | 'scan' } | null {
  const ordered = CENSUS_TIMESTAMP_COLUMNS.flatMap((name) =>
    columns.filter((c) => c.column === name),
  );
  if (heapBytes <= CENSUS_SCAN_MAX_BYTES) {
    const first = ordered[0];
    return first ? { column: first.column, method: first.indexed ? 'index' : 'scan' } : null;
  }
  const indexed = ordered.find((c) => c.indexed);
  return indexed ? { column: indexed.column, method: 'index' } : null;
}

/* --------------------------------- months --------------------------------- */

export const CENSUS_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The UTC calendar month of `d`, 'YYYY-MM': the key of a stored snapshot. */
export function censusMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The UTC calendar day `days` before `now`, at midnight (the first day of a window). */
export function utcDayBefore(now: Date, days: number): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - days * DAY_MS,
  );
}

/* ------------------------------- quiet tables ------------------------------ */

export type QuietVerdict = 'active' | 'quiet' | 'unknown';
export type QuietBasis = 'newest-row' | 'autoanalyze' | 'counters' | 'snapshots';

export interface Quiet {
  verdict: QuietVerdict;
  basis: QuietBasis | null;
}

export function tableWrites(t: Pick<CensusTable, 'inserts' | 'updates' | 'deletes'>): number {
  return t.inserts + t.updates + t.deletes;
}

/**
 * Whether a table was written in the last `quietDays`.
 *
 * Postgres keeps no last-write time, so this is a verdict from indirect signs, and
 * "unknown" is an answer. In order:
 *
 *  - active: its newest row is inside the window; or autovacuum analysed it inside the
 *    window (it does that only after rows changed); or it has writes and the counters
 *    themselves began inside the window.
 *  - by the monthly snapshots, when one at least `quietDays` old exists, shares this
 *    census's counter start and holds the table: active if the write counter moved since,
 *    quiet if it did not. This is the only exact sign, and the reason the job exists. (The
 *    baseline can be up to a month older than the window, so "active" here means written
 *    since that snapshot.)
 *  - quiet: the counters cover the whole window and show no write; or, failing that, its
 *    newest row is older than the window (a later UPDATE that does not touch the column,
 *    or a DELETE, would not show).
 *  - unknown: none of the above, typically a table with no timestamp column before the
 *    snapshots reach back `quietDays`.
 */
export function tableQuiet(
  t: CensusTable,
  census: Pick<Census, 'takenAt' | 'statsReset' | 'quietDays'>,
  baseline: CensusBaseline | null = null,
): Quiet {
  const cutoff = Date.parse(census.takenAt) - census.quietDays * DAY_MS;
  const newest = t.newestRow ? Date.parse(t.newestRow) : null;
  const analysed = t.lastAutoanalyze ? Date.parse(t.lastAutoanalyze) : null;
  const reset = census.statsReset ? Date.parse(census.statsReset) : null;
  const writes = tableWrites(t);

  if (newest !== null && newest >= cutoff) return { verdict: 'active', basis: 'newest-row' };
  if (analysed !== null && analysed >= cutoff) return { verdict: 'active', basis: 'autoanalyze' };
  if (writes > 0 && reset !== null && reset >= cutoff)
    return { verdict: 'active', basis: 'counters' };

  const before = baseline?.writes[t.table];
  if (
    baseline &&
    before !== undefined &&
    Date.parse(baseline.takenAt) <= cutoff &&
    baseline.statsReset === census.statsReset &&
    writes >= before
  ) {
    return { verdict: writes > before ? 'active' : 'quiet', basis: 'snapshots' };
  }

  if (writes === 0 && reset !== null && reset < cutoff)
    return { verdict: 'quiet', basis: 'counters' };
  if (newest !== null) return { verdict: 'quiet', basis: 'newest-row' };
  return { verdict: 'unknown', basis: null };
}

/** A product is quiet when it is measured and nobody used it in the quiet window. */
export function productQuiet(
  p: CensusProduct,
  census: Pick<Census, 'takenAt' | 'quietDays'>,
): QuietVerdict {
  if (!p.tracked) return 'unknown';
  if (!p.lastActiveAt) return 'quiet';
  const cutoff = Date.parse(census.takenAt) - census.quietDays * DAY_MS;
  return Date.parse(p.lastActiveAt) >= cutoff ? 'active' : 'quiet';
}

/* -------------------------------- products -------------------------------- */

export interface CatalogueEntry {
  id: string;
  title: string;
  kind: 'game' | 'app';
  href: string;
  tracked: boolean;
}

/** One catalogue id's usage, as the SQL returns it. Ids with no usage are simply absent. */
export interface ProductUsage {
  id: string;
  actives: number;
  playtimeActives: number;
  historyActives: number;
  players: number;
  lastActiveAt: string | null;
}

/**
 * Every catalogue entry with its usage, zeroes included, then any id the tables hold that
 * the catalogue no longer names (a retired title). Most active first; ties by id.
 */
export function buildProducts(
  catalogue: readonly CatalogueEntry[],
  usage: readonly ProductUsage[],
): CensusProduct[] {
  const byId = new Map(usage.map((u) => [u.id, u]));
  const rows: CensusProduct[] = catalogue.map((c) => {
    const u = byId.get(c.id);
    byId.delete(c.id);
    return {
      id: c.id,
      title: c.title,
      kind: c.kind,
      href: c.href,
      tracked: c.tracked,
      actives: u?.actives ?? 0,
      playtimeActives: u?.playtimeActives ?? 0,
      historyActives: u?.historyActives ?? 0,
      players: u?.players ?? 0,
      lastActiveAt: u?.lastActiveAt ?? null,
    };
  });
  for (const u of byId.values()) {
    rows.push({ ...u, title: u.id, kind: 'uncatalogued', href: null, tracked: true });
  }
  return rows.sort(
    (a, b) => b.actives - a.actives || b.players - a.players || a.id.localeCompare(b.id),
  );
}

/* --------------------------------- summary -------------------------------- */

export interface CensusSummary {
  tables: number;
  emptyTables: number;
  quietTables: number;
  unknownTables: number;
  products: number;
  activeProducts: number;
  quietProducts: number;
}

export function summarizeCensus(
  census: Census,
  baseline: CensusBaseline | null = null,
): CensusSummary {
  let emptyTables = 0;
  let quietTables = 0;
  let unknownTables = 0;
  for (const t of census.tables) {
    if (t.liveRows === 0) emptyTables++;
    const { verdict } = tableQuiet(t, census, baseline);
    if (verdict === 'quiet') quietTables++;
    else if (verdict === 'unknown') unknownTables++;
  }
  const listed = census.products.filter((p) => p.kind !== 'uncatalogued');
  return {
    tables: census.tables.length,
    emptyTables,
    quietTables,
    unknownTables,
    products: listed.length,
    activeProducts: listed.filter((p) => p.actives > 0).length,
    quietProducts: listed.filter((p) => productQuiet(p, census) === 'quiet').length,
  };
}

/* -------------------------------- markdown -------------------------------- */

const day = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

/**
 * The evidence file. `origin` is printed first, verbatim, so a reader knows which database
 * the numbers describe before reading any of them.
 */
export function renderCensusMarkdown(
  census: Census,
  origin: string,
  baseline: CensusBaseline | null = null,
): string {
  const s = summarizeCensus(census, baseline);
  const lines: string[] = [
    '# Database and product census (audit DT1)',
    '',
    `> ${origin}`,
    '',
    `Taken ${census.takenAt} (UTC) from PostgreSQL ${census.serverVersion} by \`pnpm db:census\`.`,
    `Statistics counters start: ${census.statsReset ?? 'never reset (start unknown)'}.`,
    baseline
      ? `Compared with the stored snapshot taken ${baseline.takenAt}.`
      : `No stored snapshot is ${census.quietDays} days old yet, so no table is judged by a counter difference.`,
    '',
    '## What the columns mean',
    '',
    'Postgres does not record when a table was last written. The table columns are what it does record:',
    '',
    "- **Rows**: `n_live_tup`, the planner's estimate of live rows. Not a count.",
    '- **Writes**: rows inserted, updated and deleted since the statistics counters started (above).',
    '- **Index reads**: index scans since the counters started. Sequential scans are left out: a backup makes one per table.',
    `- **Newest row**: the largest \`updatedAt\` or \`createdAt\`, read only where it is cheap (an index on the column, or a heap of at most ${Math.round(CENSUS_SCAN_MAX_BYTES / 1024)} kB). It dates the last insert (or, for \`updatedAt\`, the last change Prisma made); a delete never shows.`,
    '- **Autoanalyze**: when autovacuum last analysed the table, which it does only after enough rows changed.',
    `- **${census.quietDays} days**: \`active\`, \`quiet\` or \`unknown\`, with the sign it rests on (rule: \`tableQuiet\` in lib/admin/census.ts).`,
    '',
    `Product actives are distinct signed-in users in the last ${census.activeDays} days, from playtime heartbeats (\`game_playtime_day\`) and history visits (\`history_entry\`), grouped by catalogue id. Signed-out visitors are not counted anywhere.`,
    '',
    '## Summary',
    '',
    `- Tables: ${s.tables}. Empty by estimate: ${s.emptyTables}. Quiet for ${census.quietDays} days: ${s.quietTables}. Unknown: ${s.unknownTables}.`,
    `- Catalogue products: ${s.products}. With ${census.activeDays}-day actives: ${s.activeProducts}. Quiet for ${census.quietDays} days: ${s.quietProducts}.`,
    '',
    '## Products',
    '',
    `| Product | Kind | ${census.activeDays}-day actives | Playtime | History | Players, all time | Last active | Measured |`,
    '|---|---|---:|---:|---:|---:|---|---|',
    ...census.products.map(
      (p) =>
        `| ${p.id} | ${p.kind} | ${p.actives} | ${p.playtimeActives} | ${p.historyActives} | ${p.players} | ${day(p.lastActiveAt)} | ${p.tracked ? 'yes' : 'no'} |`,
    ),
    '',
    '## Tables',
    '',
    `| Table | Rows | Writes | Index reads | Bytes | Newest row | Autoanalyze | ${census.quietDays} days |`,
    '|---|---:|---:|---:|---:|---|---|---|',
    ...census.tables.map((t) => {
      const q = tableQuiet(t, census, baseline);
      const newest = t.newestRow
        ? `${day(t.newestRow)} (${t.newestRowColumn}, ${t.newestRowMethod})`
        : '';
      return `| ${t.table} | ${t.liveRows} | ${tableWrites(t)} | ${t.indexScans} | ${t.bytes} | ${newest} | ${day(t.lastAutoanalyze)} | ${q.verdict}${q.basis ? ` (${q.basis})` : ''} |`;
    }),
    '',
  ];
  return lines.join('\n');
}
