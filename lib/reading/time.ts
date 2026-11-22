/**
 * Reading time (sprint 07 18) — the pure half: the activity accumulator and the
 * caps. Client-safe: no Prisma, no zod, no timers.
 *
 * How time is measured without a timer: the reader tools note the timestamp of
 * each reading activity (scroll, key, pointer, a page turn, the document becoming
 * visible). The gap between two consecutive activities counts as reading when it
 * is at most {@link GAP_CAP_MS}; a longer gap counts as {@link GAP_CAP_MS} (a
 * long page is read without scrolling). Hiding the tab closes the gap and stops
 * counting until the next activity. Listen mode (speech) counts from its start
 * to its end event instead, and activity during a listen span adds nothing, so
 * nothing is counted twice.
 *
 * A flush is attributed to the day of the request, so a span that crosses
 * midnight lands on the later day. That is accepted and documented here.
 */

/** A gap between two activities counts for at most this long. */
export const GAP_CAP_MS = 120_000;
/** Accumulated seconds past this are flushed from inside the activity handler. */
export const FLUSH_AFTER_SECONDS = 300;
/** One request carries at most this many seconds for one document. */
export const MAX_SECONDS_PER_REQUEST = 900;
/** A member's reading time for one day is capped at 24 hours in total. */
export const DAY_CAP_SECONDS = 86_400;
/** A listen span with no end event (a stalled engine) counts for at most this long. */
export const LISTEN_SPAN_MAX_MS = 3 * 3_600_000;

export const WEEKLY_TARGET_MIN = 10;
export const WEEKLY_TARGET_MAX = 2000;

/** Milliseconds counted for the gap between two activities. */
export function accumulate(prev: number | null, now: number): number {
  if (prev === null || !Number.isFinite(prev) || !Number.isFinite(now)) return 0;
  return Math.min(Math.max(now - prev, 0), GAP_CAP_MS);
}

export interface ClockState {
  /** Timestamp of the last reading activity; null when none yet or the tab was hidden. */
  last: number | null;
  /** Counted milliseconds not yet flushed. */
  pendingMs: number;
  /** When speech started playing; null when it is not. */
  listenFrom: number | null;
}

export const initialClock: ClockState = {
  last: null,
  pendingMs: 0,
  listenFrom: null,
};

/** A reading activity at `now`. */
export function onActivity(s: ClockState, now: number): ClockState {
  if (s.listenFrom !== null)
    return {
      ...s,
      last: now,
    };
  return {
    ...s,
    last: now,
    pendingMs: s.pendingMs + accumulate(s.last, now),
  };
}

/** The tab was hidden: close the open gap and stop counting until the next activity. */
export function onHidden(s: ClockState, now: number): ClockState {
  const gap = s.listenFrom !== null ? 0 : accumulate(s.last, now);
  return {
    ...s,
    last: null,
    pendingMs: s.pendingMs + gap,
  };
}

function listenMs(s: ClockState, now: number): number {
  return s.listenFrom === null ? 0 : Math.min(Math.max(now - s.listenFrom, 0), LISTEN_SPAN_MAX_MS);
}

/** Speech started playing. The open activity gap is closed first. */
export function onListenStart(s: ClockState, now: number): ClockState {
  if (s.listenFrom !== null) return s;
  return {
    last: now,
    pendingMs: s.pendingMs + accumulate(s.last, now),
    listenFrom: now,
  };
}

/** Speech stopped (end, pause or stop): the span counts. */
export function onListenEnd(s: ClockState, now: number): ClockState {
  if (s.listenFrom === null) return s;
  return {
    last: now,
    pendingMs: s.pendingMs + listenMs(s, now),
    listenFrom: null,
  };
}

/** Whole seconds waiting to be sent, counting an open listen span up to `now`. */
export function pendingSeconds(s: ClockState, now: number): number {
  return Math.floor((s.pendingMs + listenMs(s, now)) / 1000);
}

/**
 * Take up to {@link MAX_SECONDS_PER_REQUEST} whole seconds out of the clock.
 * An open listen span is folded in and restarted, so a long listen flushes in
 * pieces; the sub-second remainder stays.
 */
export function drain(
  s: ClockState,
  now: number,
): {
  seconds: number;
  state: ClockState;
} {
  const folded: ClockState =
    s.listenFrom === null
      ? s
      : {
          ...s,
          pendingMs: s.pendingMs + listenMs(s, now),
          listenFrom: now,
        };
  const seconds = Math.min(Math.floor(folded.pendingMs / 1000), MAX_SECONDS_PER_REQUEST);
  return {
    seconds,
    state: {
      ...folded,
      pendingMs: folded.pendingMs - seconds * 1000,
    },
  };
}

/** True when enough has accumulated to flush from inside an activity handler. */
export function shouldFlush(s: ClockState, now: number): boolean {
  return pendingSeconds(s, now) > FLUSH_AFTER_SECONDS;
}

/** Whole minutes for display; any non-zero time shows as at least one minute. */
export function minutesOf(seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

/** How many of `seconds` still fit in a day that already holds `used`. */
export function roomInDay(used: number, seconds: number): number {
  return Math.max(0, Math.min(seconds, DAY_CAP_SECONDS - used));
}

/** The window event Listen mode raises when speech starts or stops (`detail.speaking`). */
export const LISTEN_EVENT = 'rmh:reading-listen';

/** Tell any reading clock on the page that speech is (or is no longer) playing. */
export function announceListening(speaking: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(LISTEN_EVENT, {
      detail: {
        speaking,
      },
    }),
  );
}
