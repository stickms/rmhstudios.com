/**
 * Where the docked globe's refracted picture should be placed, with no layout read and a little look-ahead.
 *
 * The coat's picture is the page behind the ball, placed from the page's scroll offset and the ball's centre
 * (`globe-protocol.ts` `place`). Placing it used to be: scroll event -> next animation frame -> read the stage's rect
 * (a forced layout) -> post to the worker -> the worker's next frame -> draw -> present. On iOS the page itself scrolls
 * on the compositor, so by the time that chain lands the picture inside the ball is several frames behind the page
 * moving under it, while a pure-CSS glass (no picture) never trails. This module is the two numbers that let the page
 * post the placement synchronously from the scroll / visual-viewport event instead:
 *
 * - {@link ballCentreY}: the phone dock is bottom-anchored (the orb follows the visible bottom in CSS), so after one
 *   measured rect its centre moves 1:1 with the visual viewport's height — Safari's toolbar growing and shrinking —
 *   and nothing needs measuring again.
 * - {@link predictScrollY}: the scroll offset the page will have when this placement is on screen (dead reckoning
 *   from the last two scroll events, capped), so the picture lands where the page is, not where it was.
 *
 * Pure; no DOM. Unit-tested (`__tests__/globe-scroll-track.test.ts`).
 */

/** How far ahead of the last scroll event the picture is placed, ms: the post-to-present latency of the worker, ~2 frames. */
export const PLACE_LEAD_MS = 34;
/** The most look-ahead ever applied, CSS px: a wrong guess (a flick that stops dead) can never be further off than this. */
export const PLACE_LEAD_MAX_PX = 40;
/** A scroll event older than this says nothing about the speed now (the page has stopped), ms. */
export const SCROLL_STALE_MS = 60;

/** The ball's centre y in viewport CSS px: `cy0` measured when the visual viewport was `vvH0` tall, now `vvH` tall. */
export function ballCentreY(cy0: number, vvH0: number, vvH: number): number {
  return cy0 + (vvH - vvH0);
}

/**
 * The scroll offset to place the picture at: `y` (this event's `scrollY`) advanced by the speed the last two events
 * show, over {@link PLACE_LEAD_MS}, never more than {@link PLACE_LEAD_MAX_PX}. `prevY` / `dtMs` are the previous event's
 * offset and the time since it; no previous event, a stale one, or a non-positive interval is no look-ahead.
 */
export function predictScrollY(y: number, prevY: number | null, dtMs: number): number {
  if (prevY === null || !(dtMs > 0) || dtMs > SCROLL_STALE_MS) return y;
  const lead = ((y - prevY) / dtMs) * PLACE_LEAD_MS;
  return y + Math.max(-PLACE_LEAD_MAX_PX, Math.min(PLACE_LEAD_MAX_PX, lead));
}
