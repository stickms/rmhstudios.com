/**
 * The audio clock a rhythm game should draw and judge against: the position of the
 * sound the player is *hearing*, not the one the browser has just *rendered*.
 *
 * ## Why `currentTime` is the wrong clock
 *
 * `AudioContext.currentTime` is the end of the block the audio thread has handed to
 * the device. The speaker (or the Bluetooth link) plays that block later — the
 * context's `outputLatency`, typically 20–60 ms on wired audio and 150–300 ms on
 * Bluetooth. A game that positions notes at `currentTime` shows a beat that long
 * *before* it is heard; a player who presses on what they hear is then judged
 * `outputLatency` late on every note, against a MARVELOUS window of 15 ms. A
 * manual calibration setting can hide that, but nothing told players to use it, and
 * its value silently depended on which headphones were plugged in.
 *
 * ## What this does
 *
 * `getOutputTimestamp()` reports a pair — "the sample the output is playing right
 * now" and "the `performance.now()` at which that was true" — that already accounts
 * for the device's latency. Both ends of the pair advance at the same rate, so
 * `contextTime - performanceTime` is a constant (the context's offset from the page
 * clock, minus latency). Estimating THAT constant from many noisy pairs, and then
 * reading the heard position as `constant + performance.now()`, gives a clock that:
 *
 *  - is continuous (it rides `performance.now()`, not a stepped counter), which is
 *    what removes Firefox's frame stutter;
 *  - includes the output latency, with no setting;
 *  - maps ANY `performance.now()`-domain instant to a song position — a key press's
 *    own `event.timeStamp` — exactly, instead of "whenever JavaScript got round to it".
 *
 * Where `getOutputTimestamp` is missing or answers zeros (older Safari) the offset is
 * estimated from `currentTime` minus the reported latency instead. `currentTime`
 * only ever under-reports (it is a staircase that sits at or below the truth), so
 * that estimate takes the largest recent sample rather than the median.
 *
 * Pure: it is handed every reading, so it can be run against simulated hardware.
 */

export interface OutputTimestamp {
  contextTime: number;
  performanceTime: number;
}

export interface ClockObservation {
  /** `ctx.getOutputTimestamp()`, or null where it is unavailable or threw. */
  timestamp: OutputTimestamp | null;
  /** `ctx.currentTime`, seconds. */
  contextTime: number;
  /** `performance.now()`, milliseconds. */
  perfMs: number;
  /** `ctx.outputLatency || ctx.baseLatency`, seconds — used only without a timestamp. */
  latencySeconds: number;
}

/** How many recent readings the offset is estimated from (~0.4 s at 120 Hz). */
const WINDOW = 48;
/** A reading this far from the estimate is a device change, not noise, seconds. */
const JUMP_SECONDS = 0.06;
/** Consecutive far-off readings before the estimate is re-anchored. */
const JUMP_COUNT = 4;
/** The most the applied offset may move per observation, seconds. */
const MAX_SLEW_SECONDS = 0.0005;
/** A timestamp older than this is stale (a suspended context), ms. */
const MAX_TIMESTAMP_AGE_MS = 1500;

type Mode = 'timestamp' | 'estimate';

export class OutputClock {
  private samples: number[] = [];
  private mode: Mode | null = null;
  private applied: number | null = null;
  private outliers = 0;

  /** Forget everything — a new context, or a device change we were told about. */
  reset(): void {
    this.samples = [];
    this.mode = null;
    this.applied = null;
    this.outliers = 0;
  }

  /** Which source the estimate is currently built from (for diagnostics). */
  get source(): Mode | null {
    return this.mode;
  }

  /** Feed one reading of the audio and page clocks. */
  observe(o: ClockObservation): void {
    if (!Number.isFinite(o.contextTime) || !Number.isFinite(o.perfMs)) return;

    const ts = o.timestamp;
    const usable =
      ts !== null &&
      ts.performanceTime > 0 &&
      ts.contextTime > 0 &&
      ts.performanceTime <= o.perfMs + 5 &&
      o.perfMs - ts.performanceTime < MAX_TIMESTAMP_AGE_MS;

    const mode: Mode = usable ? 'timestamp' : 'estimate';
    const sample = usable
      ? ts.contextTime - ts.performanceTime / 1000
      : o.contextTime - o.perfMs / 1000 - Math.max(0, o.latencySeconds);

    if (mode !== this.mode) {
      this.samples = [];
      this.outliers = 0;
      this.mode = mode;
      this.applied = null;
    }

    const current = this.estimate();
    if (current !== null && Math.abs(sample - current) > JUMP_SECONDS) {
      // Bluetooth connecting, a different output device, a context restarted: the
      // constant has genuinely moved. Wait for it to persist, then snap.
      this.outliers++;
      if (this.outliers < JUMP_COUNT) return;
      this.samples = [];
      this.outliers = 0;
      this.applied = null;
    } else {
      this.outliers = 0;
    }

    this.samples.push(sample);
    if (this.samples.length > WINDOW) this.samples.shift();

    const target = this.estimate();
    if (target === null) return;
    if (this.applied === null) {
      this.applied = target;
      return;
    }
    // Slewed: the estimate sharpens as readings arrive, but the clock the notes ride
    // never lurches. 0.5 ms per observation is invisible and still converges in a
    // few frames.
    const delta = Math.max(-MAX_SLEW_SECONDS, Math.min(MAX_SLEW_SECONDS, target - this.applied));
    this.applied += delta;
  }

  /** True once there is an estimate to read. */
  get ready(): boolean {
    return this.applied !== null;
  }

  /**
   * The context time of the sound being heard at page time `perfMs`.
   * Callers check {@link ready} first; before the first observation this is NaN.
   */
  contextTimeAt(perfMs: number): number {
    return this.applied === null ? Number.NaN : this.applied + perfMs / 1000;
  }

  /**
   * The page time at which the sound scheduled at context time `contextTime` is
   * heard — what a calibration tap should be measured against.
   */
  perfTimeHeard(contextTime: number): number {
    return this.applied === null ? Number.NaN : (contextTime - this.applied) * 1000;
  }

  private estimate(): number | null {
    const n = this.samples.length;
    if (n === 0) return null;
    if (this.mode === 'estimate') {
      // One-sided noise: `currentTime` only under-reports, so the largest recent
      // reading is the closest to the truth.
      let max = this.samples[0];
      for (let i = 1; i < n; i++) if (this.samples[i] > max) max = this.samples[i];
      return max;
    }
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = n >> 1;
    return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}
