/**
 * Which notes of a chart could be on screen right now.
 *
 * The renderer used to walk every note in the chart on every frame and let each
 * one decide it was off-screen. An expert chart is ~2000 notes, so that was
 * ~120 000 scroll-position computations a second to draw the twenty that are
 * actually visible — paid on the weakest device running the game, once per
 * frame, forever.
 *
 * Notes are sorted by time, so the visible set is a contiguous range and two
 * binary searches find it. The contract this module owes the renderer is
 * one-directional: **the range may be too wide, never too narrow.** A note
 * wrongly included costs the per-note cull that was going to run anyway; a note
 * wrongly excluded silently fails to render, which is the bug class that makes
 * this kind of optimisation not worth doing. `visible-window.test.ts` pins that
 * direction down against the renderer's own cull thresholds.
 */

/** Only the fields the window needs; the renderer's `Slice` is wider. */
export interface TimedSlice {
  time: number;
  duration?: number;
}

export interface ViewGeometry {
  /** Pixels per second of scroll — `axisLength / 3 * speed` in the renderer. */
  pixelsPerSecond: number;
  /** Length of the scroll axis in pixels: canvas height in portrait, width otherwise. */
  axisLength: number;
  /** Position of the judgement line along the scroll axis. */
  cursorPosition: number;
  /** Portrait scrolls top-to-bottom; landscape scrolls right-to-left. */
  vertical: boolean;
  /** Longest hold in the chart, seconds. */
  longestHold: number;
}

/** First index whose `time` is >= `t`. Standard lower bound over a sorted array. */
export function lowerBoundByTime(slices: readonly TimedSlice[], t: number): number {
  let lo = 0;
  let hi = slices.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (slices[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * How far ahead of the playhead a note can be and still be on screen.
 *
 * Derived from the renderer's own cull: a future note is dropped once its
 * scroll position leaves the canvas by more than the 100px margin.
 */
export function maxAheadSeconds(geom: ViewGeometry): number {
  const travel = geom.vertical
    ? geom.cursorPosition + 100
    : geom.axisLength + 100 - geom.cursorPosition;
  return Math.max(0, travel) / geom.pixelsPerSecond;
}

/**
 * How far behind the playhead a note can be and still be on screen.
 *
 * A full traverse of the scroll axis covers the fade-out and the scroll-away;
 * the longest hold covers a LONG note that started well before now and is still
 * being held. The extra second is slack, because being generous here is free
 * and being tight is a note that disappears mid-hold.
 */
export function maxBehindSeconds(geom: ViewGeometry): number {
  return geom.longestHold + geom.axisLength / geom.pixelsPerSecond + 1;
}

/**
 * `[from, to)` into `slices` — the notes worth considering this frame.
 *
 * Deliberately inclusive at the edges: the renderer's per-note culls still run
 * and still decide. This only avoids asking about notes that cannot possibly
 * pass them.
 */
export function visibleSliceRange(
  slices: readonly TimedSlice[],
  currentTime: number,
  geom: ViewGeometry,
): { from: number; to: number } {
  if (!(geom.pixelsPerSecond > 0)) return { from: 0, to: slices.length };
  return {
    from: lowerBoundByTime(slices, currentTime - maxBehindSeconds(geom)),
    // `to` is exclusive, and a note exactly at the far edge is still on screen,
    // so nudge past it rather than relying on the strictness of `<`.
    to: lowerBoundByTime(slices, currentTime + maxAheadSeconds(geom) + 1e-6),
  };
}

/**
 * The longest hold in a note list, cached on the list itself.
 *
 * It is what makes {@link maxBehindSeconds} correct, and scanning for it every
 * frame would undo the scan this module exists to avoid. A prepared slice array
 * is immutable and is rebuilt whenever anything about it could change — a new
 * difficulty, a new modifier set, a fresh `loadMap` — so its identity is a safe
 * cache key.
 *
 * Keyed on the ARRAY rather than on the owning chart, because those two do not
 * track each other: one `BeatMap` prepares into a different array per difficulty
 * and per modifier set, and the editor's playtest loop re-prepares the same map
 * object every run. Keying on the map there would pin the first playtest's hold
 * length for the rest of the session.
 */
const holdCache = new WeakMap<object, number>();
export function longestHoldSeconds(slices: readonly TimedSlice[]): number {
  const cached = holdCache.get(slices);
  if (cached !== undefined) return cached;
  let longest = 0;
  for (const slice of slices) {
    if (slice.duration && slice.duration > longest) longest = slice.duration;
  }
  holdCache.set(slices, longest);
  return longest;
}
