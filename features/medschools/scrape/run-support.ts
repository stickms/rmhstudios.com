/** Small helpers shared by the CycleTrack and Admit jobs. */
import type {
  Logger,
  MedPrisma,
} from './types';
import type { MedSource } from '../engine/types';

/** One-line error text for logs and `MedSourceRun.error`; never carries a page body. */
export const brief =
  (
    e: unknown,
  ): string =>
    (e instanceof
    Error
      ? e.message
      : String(
          e,
        )
    ).slice(
      0,
      150,
    );

/**
 * The aliases a CycleTrack walk fetches: active schools only, sorted by key,
 * the first key per school wins (a school with two keys would have the diff
 * delete each key's rows on the other's turn). The skipped keys come back in
 * `duplicates` so the run can report them.
 */
export function pickWalkTargets<
  T extends
    {
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
  const sorted =
    aliases
      .filter(
        (
          a,
        ) =>
          activeIds.has(
            a.schoolId,
          ),
      )
      .sort(
        (
          a,
          b,
        ) =>
          a.sourceKey <
          b.sourceKey
            ? -1
            : a.sourceKey >
                b.sourceKey
              ? 1
              : 0,
      );
  const seen =
    new Set<string>();
  const targets: T[] =
    [];
  const duplicates: string[] =
    [];
  for (const a of sorted) {
    if (
      seen.has(
        a.schoolId,
      )
    )
      duplicates.push(
        a.sourceKey,
      );
    else {
      seen.add(
        a.schoolId,
      );
      targets.push(
        a,
      );
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
