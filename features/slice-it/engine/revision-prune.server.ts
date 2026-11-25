/**
 * Nightly prune of Slice It chart revisions (`slice-it.revision-prune`).
 *
 * Every save writes a `ChartRevision` row holding the whole note list, and an editor left open writes one every 20
 * seconds, so the table only ever grows. What is kept, per chart:
 *   - every `manual` (a named version) and every `publish` revision, forever;
 *   - the newest 30 autosaves;
 *   - the newest autosave of each UTC day for the last 30 days.
 * Every other autosave is deleted, 1,000 rows at a time. The delete repeats `kind = 'autosave'`, so a row that is not
 * an autosave can never be removed by this job, whatever the id list says.
 *
 * The table has no `@@map`, so its name is `"ChartRevision"`; columns are quoted camelCase.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { dayOf } from '@/lib/calendar/tz';

export const REVISION_PRUNE_QUEUE = 'slice-it.revision-prune';
/** Daily at 03:41 UTC. */
export const REVISION_PRUNE_CRON = '41 3 * * *';
export const REVISION_DELETE_BATCH = 1000;
/** The newest autosaves of a chart that are always kept. */
export const KEEP_NEWEST_AUTOSAVES = 30;
/** One autosave a day is kept for this many days. */
export const KEEP_DAILY_DAYS = 30;
/** Charts looked at per page of the sweep. */
const CHART_PAGE = 200;

const DAY_MS = 86_400_000;

export interface AutosaveRow {
  id: bigint;
  createdAt: Date;
}

/**
 * The ids of the autosaves of ONE chart to delete. Pure: `rows` are the chart's autosaves in any order, `now` is the
 * clock. Manual and publish revisions are not passed in, so they cannot be returned.
 */
export function autosaveIdsToDelete(rows: readonly AutosaveRow[], now: Date): bigint[] {
  const newestFirst = rows.slice().sort((a, b) => {
    const byTime = b.createdAt.getTime() - a.createdAt.getTime();
    if (byTime !== 0) return byTime;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  const cutoff = now.getTime() - KEEP_DAILY_DAYS * DAY_MS;
  const keptDays = new Set<string>();
  const doomed: bigint[] = [];
  newestFirst.forEach((row, index) => {
    const at = row.createdAt.getTime();
    const inWindow = at >= cutoff;
    // The newest 30 are kept, and they also stand for their own days: a day that already has a kept autosave does not
    // keep a second one.
    if (index < KEEP_NEWEST_AUTOSAVES) {
      if (inWindow) keptDays.add(dayOf(at, 'UTC'));
      return;
    }
    if (inWindow) {
      const day = dayOf(at, 'UTC');
      if (!keptDays.has(day)) {
        keptDays.add(day);
        return;
      }
    }
    doomed.push(row.id);
  });
  return doomed;
}

/** Chart ids after `after` that hold more autosaves than the newest-30 rule keeps, a page at a time. */
async function chartsOverTheLimit(after: string | null): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ chartId: string }[]>`
    SELECT "chartId"
      FROM "ChartRevision"
     WHERE "kind" = 'autosave'
       AND (${after}::uuid IS NULL OR "chartId" > ${after}::uuid)
     GROUP BY "chartId"
    HAVING COUNT(*) > ${KEEP_NEWEST_AUTOSAVES}
     ORDER BY "chartId"
     LIMIT ${CHART_PAGE}
  `;
  return Array.isArray(rows) ? rows.map((row) => row.chartId) : [];
}

/** Prune one chart's autosaves. Returns the number deleted. */
export async function pruneChartRevisions(
  chartId: string,
  now: Date = new Date(),
  batch: number = REVISION_DELETE_BATCH,
): Promise<number> {
  // Metadata only: `notes` is up to ~90 KB a row and the decision needs none of it.
  const rows = await prisma.$queryRaw<AutosaveRow[]>`
    SELECT "id", "createdAt"
      FROM "ChartRevision"
     WHERE "chartId" = ${chartId}::uuid
       AND "kind" = 'autosave'
     ORDER BY "createdAt" DESC, "id" DESC
  `;
  const doomed = autosaveIdsToDelete(Array.isArray(rows) ? rows : [], now);
  let deleted = 0;
  for (let i = 0; i < doomed.length; i += batch) {
    // Decimal strings, the array shape the repo binds everywhere else (`::text[]`), cast on the database side.
    const ids = doomed.slice(i, i + batch).map(String);
    deleted += Number(
      await prisma.$executeRaw`
        DELETE FROM "ChartRevision"
         WHERE "id" = ANY(${ids}::text[]::bigint[])
           AND "chartId" = ${chartId}::uuid
           AND "kind" = 'autosave'
      `,
    );
  }
  return deleted;
}

/** Prune every chart. Returns the number of revisions deleted. */
export async function pruneRevisions(now: Date = new Date(), batch: number = REVISION_DELETE_BATCH): Promise<number> {
  let total = 0;
  let after: string | null = null;
  for (;;) {
    const charts = await chartsOverTheLimit(after);
    if (charts.length === 0) break;
    for (const chartId of charts) total += await pruneChartRevisions(chartId, now, batch);
    if (charts.length < CHART_PAGE) break;
    after = charts[charts.length - 1] ?? null;
  }
  return total;
}

/** Register the nightly prune. Called once from the jobs worker (only it can schedule). */
export async function registerRevisionPruneCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(REVISION_PRUNE_QUEUE);
  await boss.schedule(REVISION_PRUNE_QUEUE, REVISION_PRUNE_CRON, {}, { tz: 'UTC' });
  await boss.work(REVISION_PRUNE_QUEUE, async () => {
    await pruneRevisions();
  });
}
