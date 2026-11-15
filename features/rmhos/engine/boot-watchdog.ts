/**
 * The boot watchdog: v86 reports a stuck download or a machine that never comes up only by
 * doing nothing, so the page has to notice the silence itself. Pure timing, with the clock
 * injected so every failure class is testable without waiting.
 *
 *  - `downloading`: no download progress for STALL_MS ends in `stalled`. Every progress event
 *    (any file) restarts the timer.
 *  - `booting`: the machine has everything and must announce itself within BOOT_COLD_MS (a cold
 *    boot prints RMHOS READY) or BOOT_SNAPSHOT_MS (a restored snapshot reports ready).
 */
export const STALL_MS = 30_000;
export const BOOT_COLD_MS = 180_000;
export const BOOT_SNAPSHOT_MS = 60_000;
/** After this long in `downloading` or `booting` the boot screen offers "Try again". */
export const TRY_AGAIN_AFTER_MS = 20_000;

export interface WatchdogClock {
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const browserClock: WatchdogClock = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type WatchdogReason = 'stalled' | 'boot-timeout';

export class BootWatchdog {
  private handle: unknown = null;
  private stage: 'downloading' | 'booting' | null = null;

  constructor(
    private readonly clock: WatchdogClock,
    private readonly onExpire: (reason: WatchdogReason, stage: 'downloading' | 'booting') => void,
  ) {}

  /** Waiting for bytes: expires after STALL_MS without `progress()`. */
  downloading(): void {
    this.arm('downloading', STALL_MS);
  }

  /** Everything is here, waiting for the machine to announce itself. */
  booting(kind: 'snapshot' | 'cold'): void {
    this.arm('booting', kind === 'cold' ? BOOT_COLD_MS : BOOT_SNAPSHOT_MS);
  }

  /** A download made progress: the stall timer starts over. No effect outside `downloading`. */
  progress(): void {
    if (this.stage === 'downloading') this.arm('downloading', STALL_MS);
  }

  stop(): void {
    if (this.handle !== null) this.clock.clearTimeout(this.handle);
    this.handle = null;
    this.stage = null;
  }

  private arm(stage: 'downloading' | 'booting', ms: number): void {
    if (this.handle !== null) this.clock.clearTimeout(this.handle);
    this.stage = stage;
    this.handle = this.clock.setTimeout(() => {
      this.handle = null;
      const s = this.stage;
      this.stage = null;
      if (s) this.onExpire(s === 'downloading' ? 'stalled' : 'boot-timeout', s);
    }, ms);
  }
}
