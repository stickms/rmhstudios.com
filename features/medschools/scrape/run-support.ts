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
