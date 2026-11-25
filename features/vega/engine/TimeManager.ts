import { STEP_S } from './data';
import { FAST_SPEED } from './assist-profile';

/**
 * The run clock: turns real frame time into fixed simulation steps at the chosen speed, and keeps the run's
 * wall-clock duration (paused time excluded) for the score submission's rate check.
 *
 * The toggle moves between the run's normal speed (`minSpeed`, 1 unless the speed floor assist slows it) and
 * `FAST_SPEED`. A slower run only lengthens the wall-clock duration the score rate check reads.
 */
export class TimeManager {
  public speed = 1;
  /** The normal speed: 1, or the member's speed floor (0.5-1). */
  public readonly minSpeed: number;
  public paused = false;
  /** Wall time the run has been unpaused, ms (carried across a resumed save). */
  public elapsedMs = 0;
  private acc = 0;

  constructor(elapsedMs = 0, minSpeed = 1) {
    this.elapsedMs = elapsedMs;
    this.minSpeed = minSpeed;
    this.speed = minSpeed;
  }

  /**
   * Feed one frame's real delta (ms). Returns how many fixed steps to run now. The delta is clamped so a
   * backgrounded tab does not resume with a burst of steps, and steps per frame are capped.
   */
  public frame(deltaMs: number, running: boolean): number {
    const d = Math.min(Math.max(deltaMs, 0), 100);
    if (this.paused) return 0;
    this.elapsedMs += d;
    if (!running) {
      this.acc = 0;
      return 0;
    }
    this.acc += (d / 1000) * this.speed;
    let steps = 0;
    while (this.acc >= STEP_S && steps < 12) {
      this.acc -= STEP_S;
      steps++;
    }
    if (steps === 12) this.acc = 0;
    return steps;
  }

  public toggleSpeed() {
    this.speed = this.speed === FAST_SPEED ? this.minSpeed : FAST_SPEED;
  }
}
