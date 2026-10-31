/**
 * Keeps Balatro smooth on a machine that cannot fill the drawing buffer at full
 * rate. The game redraws every pixel through its CRT shader each frame, so frame cost
 * is mostly fill, and fill is the one thing the page can change without touching the
 * game: the buffer's pixel ratio (runtime.ts `renderSize`). Firefox, which pays more
 * per WebGL call than Chromium, and any hi-DPI laptop on its integrated GPU, are the
 * usual cases.
 *
 * Fed one requestAnimationFrame interval at a time; answers with a new scale (a
 * multiplier on the pixel ratio) when frames have been slow for long enough to be
 * sure, else null. Downscale-only: a resolution change rebuilds the game's canvas,
 * which is a visible hitch, so going back up to test whether the load has passed would
 * cost more than it could save. Steps are small, patient and bounded.
 */

/** Median frame time above this (under ~44 fps) is slow. */
export const SLOW_FRAME_MS = 22.5;
/** Consecutive slow windows (WINDOW_MS each) before a step down. */
export const SLOW_WINDOWS = 2;
export const WINDOW_MS = 1000;
/** Ignored after boot and after every change: the canvas rebuild and shader compiles are not load. */
export const WARMUP_MS = 4000;
export const STEP = 0.8;
export const MIN_SCALE = 0.6;
/** An interval longer than this is a stalled or hidden tab, not a measurement. */
const STALL_MS = 250;

export interface RenderGovernor {
  /** One frame interval in ms; returns the new scale when it should change. */
  push(dt: number): number | null;
  /** Forget the window in progress and wait out a warm-up (a resize, a tab switch). */
  hold(): void;
  readonly scale: number;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function createGovernor(): RenderGovernor {
  let scale = 1;
  let warm = WARMUP_MS;
  let windowMs = 0;
  let frames: number[] = [];
  let slow = 0;
  let stalled = false;

  const reset = (warmup: number) => {
    warm = warmup;
    windowMs = 0;
    frames = [];
    slow = 0;
    stalled = false;
  };

  return {
    get scale() {
      return scale;
    },
    hold() {
      reset(WARMUP_MS);
    },
    push(dt) {
      if (dt > STALL_MS) {
        stalled = true;
        return null;
      }
      if (warm > 0) {
        warm -= dt;
        return null;
      }
      frames.push(dt);
      windowMs += dt;
      if (windowMs < WINDOW_MS) return null;
      const slowWindow = !stalled && median(frames) > SLOW_FRAME_MS;
      frames = [];
      windowMs = 0;
      stalled = false;
      slow = slowWindow ? slow + 1 : 0;
      if (slow < SLOW_WINDOWS || scale <= MIN_SCALE) return null;
      scale = Math.max(MIN_SCALE, Math.round(scale * STEP * 1000) / 1000);
      reset(WARMUP_MS);
      return scale;
    },
  };
}
