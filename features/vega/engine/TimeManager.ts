import { STEP_S } from './data';

/**
 * The run clock: turns real frame time into fixed simulation steps at the chosen speed, and keeps the run's
 * wall-clock duration (paused time excluded) for the score submission's rate check.
 */
export class TimeManager {
  public speed: 1 | 2 = 1;
  public paused = false;
  /** Wall time the run has been unpaused, ms (carried across a resumed save). */
  public elapsedMs = 0;
  private acc = 0;

  constructor(elapsedMs = 0) {
    this.elapsedMs = elapsedMs;
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
    this.speed = this.speed === 1 ? 2 : 1;
  }
}
