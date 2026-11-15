/**
 * Wall-clock "over budget" detector for the R3F governor.
 *
 * `FrametimeMonitor` needs a full window of FRAMES, which on a slow device is
 * the very thing it cannot afford: 90 frames at 4 fps is 22 s. This one counts
 * wall time instead, so the first downscale lands after ~1.5 s whatever the
 * frame rate, while a single stall (hidden tab, asset decode) is ignored.
 */
export const SLOW_FOR_MS = 1500;
const STALL_MS = 400;
const TAU_MS = 250;

export class SlowFrameClock {
  private avg = 0;
  private overMs = 0;

  reset(): void {
    this.avg = 0;
    this.overMs = 0;
  }

  /** Feed one frame interval (ms); true once the average has been over `budgetMs` for {@link SLOW_FOR_MS}. */
  over(
    dtMs: number,
    budgetMs: number,
  ): boolean {
    if (
      dtMs <=
      0
    )
      return false;
    if (
      dtMs >
        STALL_MS &&
      this
        .avg >
        0 &&
      dtMs >
        this
          .avg *
          6
    )
      return false;
    this.avg =
      this
        .avg ===
      0
        ? dtMs
        : this
            .avg +
          (dtMs -
            this
              .avg) *
            (1 -
              Math.exp(
                -dtMs /
                  TAU_MS,
              ));
    if (
      this
        .avg <=
      budgetMs
    ) {
      this.overMs = 0;
      return false;
    }
    this.overMs +=
      Math.min(
        dtMs,
        STALL_MS,
      );
    return (
      this
        .overMs >=
      SLOW_FOR_MS
    );
  }
}
