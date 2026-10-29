/**
 * The game's one frame loop and its fixed-step clock.
 *
 * `GameLoop` owns the ONLY `requestAnimationFrame` a running game uses: input
 * sampling, the simulation/command ticks, rendering, audio and the HUD all ride
 * the callback (the jelly material is off while a game plays —
 * `markGamePlaying`, lib/game-capabilities.ts). It stops scheduling frames
 * while the tab is hidden (a backgrounded game does no work; an online client
 * keeps receiving snapshots through its socket handlers) and resumes with a
 * zero-length first frame, so a long absence is not replayed as one huge step.
 * `stop()` cancels the pending frame; the client calls it on unmount, which is
 * what bounds the loop's lifetime (lib/__tests__/raf-loop-allowlist.test.ts).
 *
 * `FixedStep` turns variable frame times into whole simulation ticks (the
 * engine's host_frame accumulator): at most `maxSteps` per frame, the rest of a
 * backlog dropped, and `alpha` the fraction of the next tick already elapsed
 * (for interpolating between the last two ticks).
 *
 * Environment-agnostic: the frame source, clock and document are injected.
 */

import { TICK_INTERVAL } from '../core/constants';

/** Frames longer than this (seconds) are clamped — a debugger pause or a stall is not simulated. */
export const MAX_FRAME_DT = 0.1;

export interface LoopHost {
  requestFrame(cb: (t: number) => void): number;
  cancelFrame(id: number): void;
  /** Milliseconds, monotonic. */
  now(): number;
  /** Whether the page is hidden right now. */
  hidden(): boolean;
  /** Subscribes to visibility changes; returns the unsubscribe. */
  onVisibility(fn: () => void): () => void;
}

/** The browser's frame source (rAF), clock and visibility. */
export function browserLoopHost(): LoopHost {
  return {
    requestFrame: (cb) => requestAnimationFrame(cb),
    cancelFrame: (id) => cancelAnimationFrame(id),
    now: () => performance.now(),
    hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    onVisibility: (fn) => {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('visibilitychange', fn);
      return () => document.removeEventListener('visibilitychange', fn);
    },
  };
}

export interface FrameInfo {
  /** Seconds since the previous frame, clamped to MAX_FRAME_DT (0 on the first frame and after a resume). */
  dt: number;
  /** The frame's raw duration in ms (for the frame-time governor; 0 when not measurable). */
  rawMs: number;
  /** Clock time, ms. */
  now: number;
}

export class GameLoop {
  private id = -1;
  private last = -1;
  private started = false;
  private unsubscribe: (() => void) | null = null;
  /** Frames run (diagnostics). */
  frames = 0;
  /** Times the loop was paused because the page was hidden. */
  pauses = 0;
  /**
   * `fps_max` (the developer console): frames closer together than 1000 / maxFps ms are skipped (the
   * next one runs with the whole elapsed time). 0 = every display frame.
   */
  maxFps = 0;

  constructor(
    private readonly onFrame: (f: FrameInfo) => void,
    private readonly host: LoopHost = browserLoopHost(),
    /** Called when the page hides / shows (the client mutes audio, releases keys). */
    private readonly onPause?: (paused: boolean) => void,
  ) {}

  get running(): boolean {
    return this.started;
  }

  /** True while a frame is scheduled. */
  get scheduled(): boolean {
    return this.id >= 0;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.last = -1;
    this.unsubscribe = this.host.onVisibility(() => this.visibilityChanged());
    if (!this.host.hidden()) this.schedule();
    else {
      this.pauses++;
      this.onPause?.(true);
    }
  }

  stop(): void {
    this.started = false;
    if (this.id >= 0) this.host.cancelFrame(this.id);
    this.id = -1;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private schedule(): void {
    if (this.id >= 0 || !this.started) return;
    this.id = this.host.requestFrame(this.tick);
  }

  private readonly tick = (): void => {
    this.id = -1;
    if (!this.started) return;
    if (this.host.hidden()) {
      // A frame the browser delivered on the way into the background: stop here.
      this.pause();
      return;
    }
    const now = this.host.now();
    // fps_max: too soon after the last frame — wait for the next display frame (a 1 ms tolerance for rAF jitter).
    if (this.maxFps > 0 && this.last >= 0 && now - this.last < 1000 / this.maxFps - 1) {
      this.schedule();
      return;
    }
    const rawMs = this.last < 0 ? 0 : now - this.last;
    const dt = this.last < 0 ? 0 : Math.min(MAX_FRAME_DT, Math.max(0, rawMs / 1000));
    this.last = now;
    this.frames++;
    // Schedule first: a frame callback that throws must not end the loop silently mid-game.
    this.schedule();
    this.onFrame({ dt, rawMs, now });
  };

  private pause(): void {
    if (this.id >= 0) this.host.cancelFrame(this.id);
    this.id = -1;
    this.last = -1;
    this.pauses++;
    this.onPause?.(true);
  }

  private visibilityChanged(): void {
    if (!this.started) return;
    if (this.host.hidden()) {
      if (this.id >= 0) this.pause();
      return;
    }
    if (this.id < 0) {
      this.last = -1;
      this.onPause?.(false);
      this.schedule();
    }
  }
}

/** Whole ticks from frame time (host_frame's accumulator). */
export class FixedStep {
  private acc = 0;
  /** Ticks dropped because a frame owed more than `maxSteps` (diagnostics). */
  dropped = 0;

  constructor(
    readonly step = TICK_INTERVAL,
    readonly maxSteps = 5,
  ) {}

  /** Adds `dt` seconds; returns how many ticks to run now. */
  advance(dt: number): number {
    this.acc += Math.max(0, dt);
    let n = Math.floor(this.acc / this.step + 1e-9);
    if (n > this.maxSteps) {
      this.dropped += n - this.maxSteps;
      n = this.maxSteps;
      this.acc = 0;
    } else {
      this.acc -= n * this.step;
      if (this.acc < 0) this.acc = 0;
    }
    return n;
  }

  /** How far into the next tick we are, 0…1. */
  get alpha(): number {
    return Math.min(1, this.acc / this.step);
  }

  reset(): void {
    this.acc = 0;
  }
}
