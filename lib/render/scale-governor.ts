/**
 * Render-scale governor for raw-three renderers that own their own canvas.
 *
 * Why this exists: Nightrail and Neon Driftway each timed `draw()` with
 * `performance.now()` and called that "frame time". `draw()` only SUBMITS the
 * frame — the GPU works on it afterwards — so on a GPU-bound device (a phone, an
 * integrated GPU, software GL) the measured time stayed at 2-4 ms while the
 * game ran at 2-20 fps, and the scale never dropped. The only honest signal is
 * the wall-clock interval between consecutive drawn frames, because the browser
 * stops handing out rAF ticks when the compositor is backed up.
 *
 * Behaviour:
 *  - measures the interval between `sample()` calls (a time-weighted average, so
 *    a 600 ms frame counts for what it is and one hitch does not);
 *  - steps DOWN after the average has been over budget for {@link DROP_AFTER_MS}
 *    of wall time (not a frame count: at 3 fps "45 frames" is fifteen seconds of
 *    a slideshow);
 *  - steps back UP slowly, only once the display is being met, and never past
 *    a scale that failed within {@link RETRY_LOCKOUT_MS} of being tried, so a
 *    marginal device settles instead of oscillating (the repo's governor rule).
 */

/** Wall time over budget before one step down. */
export const DROP_AFTER_MS = 700;
/** Wall time comfortably inside budget before one step up. */
export const RISE_AFTER_MS = 8000;
/** A scale that was dropped again this soon after a climb is not retried. */
export const RETRY_LOCKOUT_MS = 30000;
/** Intervals longer than this are a hidden tab / stall, not a slow GPU. */
const STALL_MS = 400;
/** Time constant of the interval average. */
const TAU_MS = 250;

export interface ScaleGovernorOptions {
  /** Interval above which the device is "over budget" (ms). */
  slowMs: number;
  /** Interval at or below which it is meeting the display (ms). */
  fastMs: number;
}

export class RenderScaleGovernor {
  private last = 0;
  private avg = 0;
  private overMs = 0;
  private underMs = 0;
  private ceiling: number;
  private climbedAt = -Infinity;

  /** @param levels number of scale steps; index `levels - 1` is full scale. */
  constructor(
    private readonly levels: number,
    private readonly options: ScaleGovernorOptions,
    public index = levels - 1,
  ) {
    this.ceiling = levels - 1;
  }

  /** Smoothed frame interval, ms (0 until measured). For debug readouts. */
  get averageMs(): number {
    return this.avg;
  }

  /** Forget the cadence — call when drawing resumes after a pause or menu cap. */
  reset(): void {
    this.last = 0;
    this.overMs = 0;
    this.underMs = 0;
  }

  /**
   * Call once per DRAWN frame. Returns the new scale index when it changed,
   * otherwise `null`.
   */
  sample(now: number): number | null {
    const dt = now - this.last;
    this.last = now;
    // First sample, or a clock that did not advance: nothing to measure.
    if (dt <= 0 || dt === now) return null;
    // One isolated stall (hidden tab, asset decode) is not a slow GPU. A device
    // that is genuinely this slow keeps producing long intervals, so `avg`
    // (which only ever skipped the first) catches up through the 6x test.
    if (dt > STALL_MS && this.avg > 0 && dt > this.avg * 6) return null;
    if (this.avg === 0) this.avg = dt;
    else this.avg += (dt - this.avg) * (1 - Math.exp(-dt / TAU_MS));

    const step = Math.min(dt, STALL_MS);
    if (this.avg > this.options.slowMs) {
      this.overMs += step;
      this.underMs = 0;
      if (this.overMs >= DROP_AFTER_MS && this.index > 0) {
        if (now - this.climbedAt < RETRY_LOCKOUT_MS)
          this.ceiling = Math.min(this.ceiling, this.index - 1);
        this.index -= 1;
        this.overMs = 0;
        // Re-measure at the new resolution rather than judging it on the old one.
        this.avg = 0;
        return this.index;
      }
    } else if (this.avg <= this.options.fastMs && this.index < this.ceiling) {
      this.underMs += step;
      this.overMs = 0;
      if (this.underMs >= RISE_AFTER_MS) {
        this.index += 1;
        this.underMs = 0;
        this.climbedAt = now;
        this.avg = 0;
        return this.index;
      }
    } else {
      this.overMs = 0;
      this.underMs = 0;
    }
    return null;
  }
}
