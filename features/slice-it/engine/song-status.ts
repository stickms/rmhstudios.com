/**
 * Slice It — what the library says about a song's chart.
 *
 * A freshly uploaded song is `pending` while the charting job runs, and the row says
 * "Charting…". That is only true while the job is plausibly alive. A job that never
 * finished (a worker that was down, an expired job) leaves the row `pending` for good,
 * and "Charting…" on a song that has sat there for a day is a lie, and one that reads
 * exactly like a broken upload. The song is playable the whole time — with no stored
 * chart the client generates one on play and patches it back — so past the window the
 * row simply stops claiming anything, and the server's hourly sweep re-queues it.
 */

/** How long after upload a `pending` song still counts as being charted. */
export const CHARTING_LIVE_MS =
  10 *
  60 *
  1000;

export type RowChartState =
  | 'charting'
  | 'failed'
  | null;

export function rowChartState(
  song: {
    analysisState?:
      | string
      | null;
    createdAt: string;
  },
  now: number = Date.now(),
): RowChartState {
  if (
    song.analysisState ===
    'failed'
  )
    return 'failed';
  if (
    song.analysisState !==
    'pending'
  )
    return null;
  const created =
    Date.parse(
      song.createdAt,
    );
  // An unreadable date is treated as old: better to say nothing than to say
  // "Charting…" forever.
  if (
    !Number.isFinite(
      created,
    )
  )
    return null;
  return now -
    created <
    CHARTING_LIVE_MS
    ? 'charting'
    : null;
}
