/**
 * Keeps a hosted world running while the host's tab is in the background.
 *
 * The game advances on `requestAnimationFrame`, and a hidden tab gets none: a host who switches to another
 * browser tab froze the world for every player in it (their links stayed up — pings ride a timer — but no tick
 * was ever stepped). While the host is hidden this pump steps the world from a timer instead. Browsers run
 * timers of a hidden tab about once a second, so each wake catches up the elapsed time in 50 ms ticks (capped,
 * so a laptop that slept for an hour does not spin through 72 000 ticks on wake). Visible again, the frame loop
 * takes over and the pump stops, so the two never advance the same time twice.
 */

import { TICK_MS } from '../world';

/** Catch-up cap per wake: 20 ticks = 1 s of world time. */
export const PUMP_MAX_TICKS = 20;
export const PUMP_INTERVAL_MS = 500;

export interface BackgroundPumpOptions {
  /** The store's `advance` (it steps the host session by this much time). */
  advance(dtMs: number): unknown;
  /** Monotonic ms. */
  now(): number;
  /** Run `fn` every `ms`; returns the stop function. */
  every(ms: number, fn: () => void): () => void;
}

export interface BackgroundPump {
  readonly running: boolean;
  start(): void;
  stop(): void;
}

export function createBackgroundPump(opts: BackgroundPumpOptions): BackgroundPump {
  let stopTimer: (() => void) | null = null;
  let last = 0;
  const wake = () => {
    const now = opts.now();
    let owed = Math.min(Math.max(0, now - last), PUMP_MAX_TICKS * TICK_MS);
    last = now;
    while (owed >= TICK_MS) {
      opts.advance(TICK_MS);
      owed -= TICK_MS;
    }
    // The remainder (< one tick) is not lost: `last` only moves by whole ticks' worth of work next time.
    last -= owed;
  };
  return {
    get running() {
      return stopTimer !== null;
    },
    start() {
      if (stopTimer) return;
      last = opts.now();
      stopTimer = opts.every(PUMP_INTERVAL_MS, wake);
    },
    stop() {
      stopTimer?.();
      stopTimer = null;
    },
  };
}
