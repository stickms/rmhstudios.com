/** Small helpers shared by the CycleTrack jobs (hourly walk and backfill). */

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
