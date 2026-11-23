/**
 * `medschools.rmh-publish`: the once-a-day public snapshot of the RMH tracker counts (phase 4, Q2).
 *
 * `share-sync.server.ts` keeps `count` / `contributors` equal to the tracker minute by minute; the public readers read only
 * `publishedCount` / `publishedContributors`, which this job (and nothing else) writes. So whatever a member does today, a
 * back-dated milestone included, shows in no public figure until the next run, and a cell crossing 3 does not tell
 * someone who knows two contributors who just shared.
 *
 * One statement: copy `count -> publishedCount` and `contributors -> publishedContributors` for every RMH row that has
 * events, and delete the RMH rows whose live count is 0 (the writer keeps them at 0 so a cell never vanishes mid-day).
 * Idempotent: a second run changes nothing. It takes the same per-school advisory locks, in ascending order, that the
 * writer takes, so it never deletes a row a writer has just read and is about to update.
 *
 * Like the SDN jobs it records a `MedSourceRun` and refuses to repeat inside a minimum interval (read from that ledger, so
 * a deploy or restart does not re-fire it); only a manual run bypasses the interval. The cron lives in pg-boss (UTC) and
 * is fired by the `jobs` timekeeper.
 */
import type { PrismaClient } from '@prisma/client';
import type { Logger, MedPrisma } from './types';
import { brief, closeStaleRuns, lastRealRunWithin } from './run-support';

export const RMH_PUBLISH_JOB = 'rmh-publish';
/** 00:05 UTC every day. */
export const RMH_PUBLISH_CRON = '5 0 * * *';
/** A non-manual run inside this window of an OK run is skipped; the cron is daily, so this only absorbs restarts. */
export const RMH_PUBLISH_MIN_INTERVAL_MS = 20 * 3_600_000;

export interface RmhPublishDeps {
  /** The structural client for the run ledger. */
  prisma: MedPrisma;
  /** The real client: the snapshot is one raw statement. */
  db: Pick<PrismaClient, '$transaction'>;
  now?: () => Date;
  log: Logger;
}

export interface RmhPublishSummary {
  runId: string;
  status: 'OK' | 'FAILED';
  outcome: 'ran' | 'skipped-min-interval';
  /** RMH rows whose published figures were set or changed. */
  published: number;
  /** RMH rows removed because no event is left in the cell. */
  removed: number;
}

/**
 * The snapshot itself, one statement under the school locks. Exported for tests; `db` is a transaction client.
 * `source = 'RMH'` is the only filter on what is touched: another source's rows are never read or written.
 */
export async function publishRmhCounts(
  db: Pick<PrismaClient, '$transaction'>,
): Promise<{ published: number; removed: number }> {
  return db.$transaction(async (tx) => {
    // The writer locks `med-rmh:<school>` ascending; do the same so a writer mid-update and this delete never cross.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended('med-rmh:' || s."schoolId", 0))
      FROM (SELECT DISTINCT "schoolId" FROM "med_cycle_count" WHERE "source" = 'RMH'::"MedSource" ORDER BY "schoolId") s`;
    const rows = await tx.$queryRaw<{ published: bigint; removed: bigint }[]>`
      WITH removed AS (
        DELETE FROM "med_cycle_count" WHERE "source" = 'RMH'::"MedSource" AND "count" = 0 RETURNING 1
      ), published AS (
        UPDATE "med_cycle_count"
        SET "publishedCount" = "count", "publishedContributors" = "contributors"
        WHERE "source" = 'RMH'::"MedSource" AND "count" > 0
          AND ("publishedCount" IS DISTINCT FROM "count" OR "publishedContributors" IS DISTINCT FROM "contributors")
        RETURNING 1
      )
      SELECT (SELECT count(*) FROM published) AS published, (SELECT count(*) FROM removed) AS removed`;
    const r = rows[0];
    return { published: Number(r?.published ?? 0), removed: Number(r?.removed ?? 0) };
  });
}

export async function runRmhPublish(
  deps: RmhPublishDeps,
  opts: { trigger: 'CRON' | 'MANUAL' },
): Promise<RmhPublishSummary | null> {
  const { prisma, db, log } = deps;
  const now = deps.now ?? (() => new Date());
  await closeStaleRuns(prisma, 'RMH', RMH_PUBLISH_JOB, now, log);
  let run: { id: string };
  try {
    run = await prisma.medSourceRun.create({
      data: { source: 'RMH', job: RMH_PUBLISH_JOB, trigger: opts.trigger, status: 'RUNNING', startedAt: now() },
    });
  } catch (e) {
    log.error(`rmh-publish: could not open run: ${brief(e)}`);
    return null;
  }
  const close = async (summary: RmhPublishSummary, error: string | null): Promise<RmhPublishSummary> => {
    const { runId: _id, status, ...stats } = summary;
    try {
      await prisma.medSourceRun.update({
        where: { id: run.id },
        data: { status, finishedAt: now(), stats, error },
      });
    } catch (e) {
      log.error(`rmh-publish: could not close run: ${brief(e)}`);
    }
    return summary;
  };
  const base = { runId: run.id, published: 0, removed: 0 } as const;

  if (opts.trigger !== 'MANUAL') {
    let recent = true; // a ledger read error fails closed: the next cron tick tries again
    try {
      // The run just opened is RUNNING, not OK, so it does not count itself.
      recent = await lastRealRunWithin(prisma, 'RMH', RMH_PUBLISH_JOB, RMH_PUBLISH_MIN_INTERVAL_MS, now());
    } catch (e) {
      log.warn(`rmh-publish: could not read the last run: ${brief(e)}`);
    }
    if (recent) return close({ ...base, status: 'OK', outcome: 'skipped-min-interval' }, null);
  }
  try {
    const r = await publishRmhCounts(db);
    log.info(`rmh-publish: published=${r.published} removed=${r.removed}`);
    return await close({ ...base, ...r, status: 'OK', outcome: 'ran' }, null);
  } catch (e) {
    log.error(`rmh-publish: run failed: ${brief(e)}`);
    return close({ ...base, status: 'FAILED', outcome: 'ran' }, brief(e));
  }
}
