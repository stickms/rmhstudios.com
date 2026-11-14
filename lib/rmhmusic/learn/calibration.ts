/**
 * Latency calibration maths for RMH Music. The learner plays along to a run of
 * clicks; pairing each response with its click gives how far behind (or ahead)
 * their input path lands. Pure and client-safe, so it is tested apart from the
 * audio scheduling in `LatencyCalibration.tsx`.
 */

/** A response further than this from every click is a stray tap, not an answer. */
const MATCH_WINDOW_MS = 400;
/** Fewer matched pairs than this is too little to trust. */
const MIN_PAIRS = 4;

/**
 * Median offset, in whole ms, of each response from its nearest click
 * (positive = the learner / input lags the click). Both lists are on one clock.
 * Responses matching no click within ±400 ms are ignored; null when fewer than
 * four responses match.
 */
export function medianOffset(
  clickTimesMs: number[],
  responseTimesMs: number[],
):
  | number
  | null {
  const clicks =
    clickTimesMs.filter(
      Number.isFinite,
    );
  if (
    clicks.length ===
    0
  )
    return null;

  const offsets: number[] =
    [];
  for (const response of responseTimesMs) {
    if (
      !Number.isFinite(
        response,
      )
    )
      continue;
    let best:
      | number
      | null =
      null;
    for (const click of clicks) {
      const d =
        response -
        click;
      if (
        Math.abs(
          d,
        ) <=
          MATCH_WINDOW_MS &&
        (best ===
          null ||
          Math.abs(
            d,
          ) <
            Math.abs(
              best,
            ))
      ) {
        best =
          d;
      }
    }
    if (
      best !==
      null
    )
      offsets.push(
        best,
      );
  }
  if (
    offsets.length <
    MIN_PAIRS
  )
    return null;

  offsets.sort(
    (
      a,
      b,
    ) =>
      a -
      b,
  );
  const mid =
    offsets.length >>
    1;
  const median =
    offsets.length %
    2
      ? offsets[
          mid
        ]
      : (offsets[
          mid -
            1
        ] +
          offsets[
            mid
          ]) /
        2;
  // `+ 0` turns a -0 from rounding into 0.
  return (
    Math.round(
      median,
    ) +
    0
  );
}
