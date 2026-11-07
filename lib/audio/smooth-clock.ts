/**
 * A frame-smooth view of `AudioContext.currentTime`.
 *
 * ## The problem
 *
 * `currentTime` is not a continuous clock: it advances when the audio thread
 * finishes a block. Chrome updates it about every 3 ms; **Firefox reports it in
 * much coarser steps** (and rounds it for timer-precision protection), so at 60 Hz
 * or 144 Hz two or three consecutive animation frames can read the *same* time and
 * the next frame reads a time several milliseconds later. A rhythm game draws note
 * positions straight from that number, so the notes freeze for a frame and then
 * jump — the stutter Firefox players see in Slice It while Chrome looks smooth.
 *
 * ## The fix
 *
 * Free-run on `performance.now()` (continuous, sub-millisecond) and let the audio
 * clock only *steer*. The audio value is a staircase that sits at or below the
 * true time, so the prediction is allowed to run a little ahead of it; we only
 * correct when the audio clock has fallen behind the prediction or the prediction
 * has drifted further ahead than a staircase step can explain. Corrections are
 * partial (a fraction of the error per audio step) so a single odd reading cannot
 * make the notes lurch, and the output never goes backwards.
 *
 * The result stays within {@link MAX_LEAD_SECONDS} of the audio clock, so hit
 * windows (tens of milliseconds) still judge against what the player hears.
 *
 * Pure: it is handed both clocks, so it can be tested without a browser.
 */

/** The most the smoothed clock may run ahead of the audio clock, seconds. */
export const MAX_LEAD_SECONDS = 0.035;
/** A disagreement bigger than this is not jitter (a seek, a sleep) — re-anchor. */
export const SNAP_SECONDS = 0.15;
/** Share of the error removed per audio-clock step. */
const GAIN = 0.2;

export class SmoothedClock {
  private anchorTime = 0;
  private anchorPerf = 0;
  private lastRaw = Number.NaN;
  private last = Number.NEGATIVE_INFINITY;

  /** Forget everything — call when the underlying clock is re-anchored. */
  reset(): void {
    this.lastRaw = Number.NaN;
    this.last = Number.NEGATIVE_INFINITY;
  }

  /**
   * @param raw `audioContext.currentTime`, seconds.
   * @param perfMs `performance.now()`, milliseconds.
   * @returns audio-context seconds, continuous and non-decreasing.
   */
  read(raw: number, perfMs: number): number {
    if (!Number.isFinite(raw) || !Number.isFinite(perfMs)) return raw;

    if (Number.isNaN(this.lastRaw)) {
      this.anchor(raw, perfMs);
      this.lastRaw = raw;
      this.last = raw;
      return raw;
    }

    let predicted = this.anchorTime + (perfMs - this.anchorPerf) / 1000;
    const error = raw - predicted;

    if (Math.abs(error) > SNAP_SECONDS || raw < this.lastRaw) {
      // A seek, a suspended tab or a context restart: trust the audio clock.
      this.anchor(raw, perfMs);
      this.lastRaw = raw;
      this.last = raw;
      return raw;
    }

    if (raw !== this.lastRaw) {
      this.lastRaw = raw;
      // Behind the audio clock: catch up. Too far ahead of it: ease back. In
      // between is the staircase's own width, which is not an error.
      const correction =
        error > 0 ? error * GAIN : error < -MAX_LEAD_SECONDS ? (error + MAX_LEAD_SECONDS) * GAIN : 0;
      if (correction !== 0) {
        predicted += correction;
        this.anchor(predicted, perfMs);
      }
    }

    // Never backwards, and never further ahead than the cap, whatever happened above.
    const value = Math.min(Math.max(predicted, this.last), raw + MAX_LEAD_SECONDS);
    this.last = Math.max(this.last, value);
    return this.last;
  }

  private anchor(time: number, perfMs: number): void {
    this.anchorTime = time;
    this.anchorPerf = perfMs;
  }
}
