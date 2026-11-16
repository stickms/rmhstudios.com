/**
 * When a note was played: the DOM or MIDI event's own `timeStamp` where it has one, not the time
 * the handler ran. A main-thread stall queues input; stamping at handler time would hand two notes
 * played 150 ms apart times a millisecond apart (and the Daily board's checks read those gaps).
 *
 * The stamp is used only when it is on the `performance.now()` clock the lessons time against:
 * positive, finite, not in the future, and within `EVENT_TIME_TOLERANCE_MS` of now. Anything else
 * (a 0 from an old browser, an epoch time, a stamp from a stall longer than the tolerance) falls
 * back to `now`. Pure.
 */

/** How far before now an event's stamp may be and still be trusted. */
export const EVENT_TIME_TOLERANCE_MS = 1_000;

export function eventTime(
  stamp:
    | number
    | undefined,
  now: number,
): number {
  if (
    stamp ===
      undefined ||
    !Number.isFinite(
      stamp,
    ) ||
    stamp <=
      0
  )
    return now;
  if (
    stamp >
      now ||
    now -
      stamp >
      EVENT_TIME_TOLERANCE_MS
  )
    return now;
  return stamp;
}
