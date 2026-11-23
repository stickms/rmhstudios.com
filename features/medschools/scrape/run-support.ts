/** Small helpers shared by the CycleTrack and Admit jobs. */
import type { Logger, MedPrisma } from './types';
import type { MedSource } from '../engine/types';

/** One-line error text for logs and `MedSourceRun.error`; never carries a page body. */
export const brief = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 150);

/**
 * The aliases a CycleTrack walk fetches: active schools only, sorted by key,
 * the first key per school wins (a school with two keys would have the diff
 * delete each key's rows on the other's turn). The skipped keys come back in
 * `duplicates` so the run can report them.
 */
export function pickWalkTargets<
  T extends {
    schoolId: string;
    sourceKey: string;
  },
>(
  aliases: T[],
  activeIds: Set<string>,
): {
  targets: T[];
  duplicates: string[];
} {
  const sorted = aliases
    .filter((a) => activeIds.has(a.schoolId))
    .sort((a, b) => (a.sourceKey < b.sourceKey ? -1 : a.sourceKey > b.sourceKey ? 1 : 0));
  const seen = new Set<string>();
  const targets: T[] = [];
  const duplicates: string[] = [];
  for (const a of sorted) {
    if (seen.has(a.schoolId)) duplicates.push(a.sourceKey);
    else {
      seen.add(a.schoolId);
      targets.push(a);
    }
  }
  return {
    targets,
    duplicates,
  };
}

/**
 * Close RUNNING rows an earlier, killed run of this job left behind. The queue is exclusive and the tick guarded,
 * so an older RUNNING row is a dead predecessor.
 */
export async function closeStaleRuns(
  prisma: MedPrisma,
  source: MedSource,
  job: string,
  now: () => Date,
  log: Logger,
): Promise<void> {
  try {
    for (let n = 0; n < 50; n++) {
      const stale = await prisma.medSourceRun.findFirst({
        where: { source, job, status: 'RUNNING' },
      });
      if (!stale) break;
      await prisma.medSourceRun.update({
        where: { id: stale.id },
        data: { status: 'FAILED', finishedAt: now(), error: 'interrupted' },
      });
    }
  } catch (e) {
    log.warn(`${job}: could not close stale runs: ${brief(e)}`);
  }
}

/**
 * Record a source key that matched no alias (D8: not when the admin ignored it). Returns true when this call
 * counted a new miss, so the caller can report one miss per key per run.
 */
export async function recordAliasMiss(
  prisma: MedPrisma,
  source: MedSource,
  sourceKey: string,
  now: () => Date,
): Promise<boolean> {
  const miss = await prisma.medSchoolAliasMiss.findFirst({
    where: { source, sourceKey },
  });
  if (miss?.ignored) return false;
  await prisma.medSchoolAliasMiss.upsert({
    where: { source_sourceKey: { source, sourceKey } },
    create: { source, sourceKey, seenCount: 1 },
    update: { lastSeenAt: now(), seenCount: { increment: 1 } },
  });
  return true;
}

/** Outcomes that did no work (zero requests); they never extend the minimum-interval window. */
export type SdnRunOutcome = 'ran' | 'paused-peak' | 'skipped-min-interval';
const ZERO_WORK_OUTCOMES: readonly string[] = ['paused-peak', 'skipped-min-interval'];

/** The AI-backed SDN jobs run at most about once a day: a non-manual run inside this window is skipped. */
export const SDN_MIN_INTERVAL_MS = 20 * 3_600_000;

/**
 * True when a non-manual run of this source and job started within `ms` of `now` and finished OK or PARTIAL.
 * Read from `MedSourceRun`, so it survives restarts and deploys. Benign zero-work rows (`paused-peak`,
 * `skipped-min-interval`, a backfill peak pause that made no request) are ignored so they do not extend the window.
 */
export async function lastRealRunWithin(
  prisma: MedPrisma,
  source: MedSource,
  job: string,
  ms: number,
  now: Date,
): Promise<boolean> {
  const rows = await prisma.medSourceRun.findMany({
    where: { source, job, startedAt: { gte: new Date(now.getTime() - ms) } },
  });
  return rows.some((r) => {
    if (r.trigger === 'MANUAL') return false;
    if (r.status !== 'OK' && r.status !== 'PARTIAL') return false;
    if (r.startedAt.getTime() < now.getTime() - ms) return false;
    const st = r.stats !== null && typeof r.stats === 'object' ? (r.stats as Record<string, unknown>) : {};
    if (typeof st.outcome === 'string' && ZERO_WORK_OUTCOMES.includes(st.outcome)) return false;
    if (st.peakPaused === true && (st.requests === 0 || st.requests === undefined)) return false;
    return true;
  });
}

/**
 * The Admit forums job runs every 3 hours (8 times a day); a non-manual run inside this window of a real run is
 * skipped, so a restart, a duplicate trigger or a mistyped cron cannot run it more often than about every 2.5 hours.
 */
export const ADMIT_FORUMS_MIN_INTERVAL_MS = 2.5 * 3_600_000;
