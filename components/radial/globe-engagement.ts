/**
 * When the liquid globe counts as ENGAGED — the one rule its ambient clock follows, on the page (LiquidGlobe's frame
 * loop: the docked globe's idle drift, its DOM pins and 2D cage) and in the worker (`globe-worker.ts`: the coat's haze).
 *
 * Engaged means engaged WITH THE GLOBE: a pointer over or near the globe or its dock, a press / drag / dwell hold on
 * the ball, or keyboard focus inside the dock or the open hub — and a short settle after the last of those, so a
 * release can finish its spring at the rate it started at. Input anywhere else on the page (moving over cards,
 * scrolling, typing in a field) does not raise the globe's rate: the globe is a sidebar's worth of the page and its
 * cost must stay with it, not follow the visitor round the site. (Until 2026-11-08 any pointer, key or wheel event in
 * the window held the engaged rate for `IDLE_AFTER_MS`, 20 s, so for an active visitor the docked globe drifted at the
 * engaged rate nearly all the time — ~255 ms/s of main thread in the software-GL harness against 85–158 at the floor.)
 *
 * The RATES are not chosen here: engaged is the jelly budget's `clockHz` (60 Hz desktop, 30 handheld, capped under
 * Calm) and otherwise its `idleClockHz` floor (30 / 15), 0 under Still, the degraded tiers, a hidden or unfocused tab
 * or off screen (`lib/jelly/tiers.ts`, the same budget every ambient clock reads). Nothing freezes: away from the
 * globe the drift and haze carry on at the floor. Only the margin and the settle are the globe's own.
 *
 * Pure; no DOM, no clock of its own. Unit-tested (`__tests__/globe-engagement.test.ts`).
 */

/**
 * How far outside the dock's (or the open hub's) box a fine pointer still counts as at the globe, CSS px. Small on
 * purpose: enough that the rate is already up on the move that ARRIVES on the ball (the pins' labels and the
 * shimmer ring sit just outside the sphere), never so wide that working in the reading column beside the rail
 * keeps it raised.
 */
export const GLOBE_NEAR_MARGIN_PX = 24;

/**
 * How long the engaged rate holds after the last engagement ends (pointer leaves, release, focus leaves), ms. A
 * release's wobble and spring settle in ~1.2 s (`docs/plasmatic-jelly-system.md`), so 1.5 s lets one finish at the
 * rate it started at, where the old window-wide rule held it for 20 s.
 */
export const GLOBE_SETTLE_MS = 1500;

/** A viewport box (CSS px), as `getBoundingClientRect` gives it. */
export interface GlobeBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Whether a pointer at (`x`, `y`) is over `box` or within `margin` of it. No box measured: never near. */
export function pointerNear(
  x: number,
  y: number,
  box: GlobeBox | null,
  margin = GLOBE_NEAR_MARGIN_PX,
): boolean {
  if (!box) return false;
  return (
    x >= box.left - margin &&
    x <= box.right + margin &&
    y >= box.top - margin &&
    y <= box.bottom + margin
  );
}

/** The direct conditions, before the settle. */
export interface GlobeEngagementInput {
  /** A fine pointer over or near the globe or its dock / the open hub. */
  near: boolean;
  /** A press, drag or dwell hold on the ball. */
  pressed: boolean;
  /** Keyboard focus inside the dock or the open hub. */
  focused: boolean;
}

export function isDirectlyEngaged(i: GlobeEngagementInput): boolean {
  return i.near || i.pressed || i.focused;
}

/**
 * The engaged state with its settle, edge-triggered: `update` reports only a change, which is when the page posts the
 * coat's clock to the worker, so a pointer moving over the globe is not a message per move. `engaged` is the direct
 * state; `settleUntil` is when the settle after the last engagement ends (0 while engaged or before any).
 */
export class GlobeEngagement {
  engaged = false;
  settleUntil = 0;

  /** Feed the direct state at `now`. Returns whether it changed (an edge). */
  update(now: number, direct: boolean): boolean {
    if (direct === this.engaged) return false;
    this.engaged = direct;
    this.settleUntil = direct ? 0 : now + GLOBE_SETTLE_MS;
    return true;
  }

  /** Engaged, or still inside the settle after it. */
  isEngaged(now: number): boolean {
    return this.engaged || now < this.settleUntil;
  }
}

/** What the rate depends on; `CoatClock` (`globe-protocol.ts`) carries exactly these fields. */
export interface EngagedRateInput {
  /** Engaged and idle-floor rates from the jelly budget; `hz` 0 = no ambient motion (Still, degraded). */
  hz: number;
  idleHz: number;
  /** On screen, tab visible and focused. */
  active: boolean;
  /** Directly engaged ({@link GlobeEngagement.engaged}). */
  engaged: boolean;
  /** When the settle ends ({@link GlobeEngagement.settleUntil}), in the page's `performance.now()`. */
  engagedUntil: number;
}

/** The ambient tick rate at `now`: engaged rate while engaged or settling, the idle floor otherwise, 0 inactive. */
export function engagedRate(c: EngagedRateInput, now: number): number {
  if (!c.active || !(c.hz > 0)) return 0;
  return c.engaged || now < c.engagedUntil ? c.hz : c.idleHz;
}

/** Milliseconds until a running settle ends (just past it), or Infinity when none is running. */
export function msToSettleEnd(
  c: Pick<EngagedRateInput, 'active' | 'engaged' | 'engagedUntil'>,
  now: number,
): number {
  if (!c.active || c.engaged || now >= c.engagedUntil) return Infinity;
  return c.engagedUntil - now + 1;
}
