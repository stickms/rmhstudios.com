/**
 * Frame caps for a 3D scene that is on screen but not being played.
 *
 * A game's menu usually sits in front of its live scene — Nightrail's idle
 * cruise, the Isleworks island breathing behind the title card, Cookgame's town
 * behind a shop overlay. That is deliberate and stays. What it should not do is
 * render at the panel's full rate: a menu backdrop stays at 60fps so it looks
 * smooth, but on a 120/144/240Hz panel the frames above 60 buy nothing behind
 * a dimmed or blurred menu, and every one is a full WebGL draw (plus, under a
 * `backdrop-filter`, a re-blur of the whole viewport). At 240Hz a menu at full
 * rate is 4× the GPU work of the same menu at 60.
 *
 * Two shapes, one rule:
 *  - raw `requestAnimationFrame` loops keep their loop and ask a
 *    {@link FrameCap} whether this tick should draw;
 *  - R3F scenes mount `components/render/FrameCap` and let it drive
 *    `frameloop="demand"`.
 *
 * Measured before/after: docs/performance-audit-2026-10-21.md §3D idle.
 */

/** Rate for a live scene shown behind a translucent or blurred menu. */
export const MENU_BACKDROP_FPS = 60;

/**
 * Decides which rAF ticks draw when a loop is capped below the display rate,
 * and hands back the time that elapsed since the last DRAWN frame so motion
 * keeps its real speed rather than slowing down with the cap.
 */
export class FrameCap {
  private last = 0;
  private carried = 0;

  /**
   * Call once per rAF tick with the tick's own `dt` (seconds). Returns `null`
   * when this tick should be skipped, else the dt to draw with.
   *
   * `fps` of `null` (or ≥ the display rate) passes every tick through.
   */
  tick(timestamp: number, dt: number, fps: number | null): number | null {
    if (fps === null) {
      this.carried = 0;
      this.last = timestamp;
      return dt;
    }
    this.carried += dt;
    const interval = 1000 / fps;
    // 4ms of slack so a callback that runs a fraction early is not skipped:
    // a 60fps cap draws every tick at 60Hz, every 2nd at 120/144Hz (60/72fps)
    // and every 4th at 240Hz, instead of drifting between neighbours.
    if (this.last && timestamp - this.last < interval - 4) return null;
    this.last = timestamp;
    const out = this.carried;
    this.carried = 0;
    return out;
  }

  /** Forget the cadence so the next tick draws (e.g. after a resize). */
  reset(): void {
    this.last = 0;
  }
}

/**
 * Renderers currently held below their natural rate by a cap. A frametime
 * governor reads this so a cap it did not choose is not mistaken for a slow
 * GPU (`components/render/AdaptiveQuality` would otherwise step quality down
 * every time a menu opened).
 */
const capped = new WeakSet<object>();

export function markFrameCapped(renderer: object, on: boolean): void {
  if (on) capped.add(renderer);
  else capped.delete(renderer);
}

export function isFrameCapped(renderer: object): boolean {
  return capped.has(renderer);
}
