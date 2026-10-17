/**
 * The BEFORE-capture scheduler (spec §6.2, T30) — framework-free.
 *
 * ## What it is for
 *
 * The effect needs a picture of the page the visitor is leaving, and it needs it
 * the instant they choose a destination. Taking it then would put a ~100 ms
 * main-thread capture between the tap and the navigation. So it is taken while
 * the hub sits open and the visitor is still deciding, and handed over on demand.
 *
 * ## When — and, more to the point, when not
 *
 * The hub's open animation is a 500 ms morph (RadialHub's MOTION_MS) that must
 * hold its frame pacing. A capture clones the DOM and inlines resources on the
 * main thread; started during the morph it would drop frames in the one
 * animation every visitor sees. So:
 *
 *   open → wait `motionMs` (setTimeout, never earlier) → next idle period
 *   (`requestIdleCallback`, 300 ms timeout; `setTimeout` where it is absent) →
 *   capture.
 *
 * There is no `requestAnimationFrame` anywhere in here: nothing is drawn, and a
 * rAF would be the wrong clock for "when the main thread is quiet".
 *
 * ## Ownership
 *
 * A bitmap holds GPU/CPU memory until `close()`d. This class holds at most one
 * and keeps it until (a) `awaitBefore` hands it to the caller, who owns it from
 * then on, (b) the hub closes, or (c) a fresher one replaces it — in (b) and (c)
 * the scheduler closes it. A capture that finishes after the hub has closed is
 * closed on arrival; an in-flight capture is also aborted through its signal so
 * the work stops early.
 *
 * ## Staleness
 *
 * A hub can stay open a long time (a visitor reading the menu, a tab left up).
 * The page behind it may have changed (a feed live-update), so a bitmap older
 * than `staleMs` is retaken on the next idle. The old one is kept until its
 * replacement exists, so a slow or failed recapture never leaves the hub with
 * less than it had; `awaitBefore` will not hand out a bitmap that is past stale.
 *
 * ## Failure
 *
 * Capture is an enhancement. Every error — timeout, `failed`, a throw from
 * session creation — is swallowed into `lastError` and the next `awaitBefore`
 * resolves `null`, which the controller turns into today's navigation. Nothing
 * here throws or rejects. A failed first capture is not retried within the same
 * open: a page that cannot be captured will not become capturable in 30 s, and a
 * retry loop is exactly the kind of background cost this effect must not add.
 */

import { BEFORE_STALE_MS, CAPTURE_DPR_CAP, CAPTURE_EXCLUDE_SELECTORS } from './constants';
import type { CaptureApi, CaptureResult, Tier } from './types';

/** Cancel handle for a scheduled callback. */
export type Cancel = () => void;

/** Run `cb` at the next idle period, or after `timeoutMs` at the latest. */
export type IdleScheduler = (cb: () => void, timeoutMs: number) => Cancel;

type IdleHost = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * The real idle scheduler: `requestIdleCallback` if present, else a short timer.
 * Reads it off `globalThis` so the module stays free of DOM globals (it is a
 * pure module under the contracts test) and runs unchanged in node tests.
 */
export const defaultIdleScheduler: IdleScheduler = (cb, timeoutMs) => {
  const host = globalThis as IdleHost;
  if (typeof host.requestIdleCallback === 'function') {
    const handle = host.requestIdleCallback(cb, { timeout: timeoutMs });
    return () => host.cancelIdleCallback?.(handle);
  }
  const handle = setTimeout(cb, 50);
  return () => clearTimeout(handle);
};

/** The hub-open → idle timeout (spec §6.2: a hub that never idles still captures). */
export const IDLE_TIMEOUT_MS = 300;

export interface BeforeCaptureOptions {
  /** Creates the shared capture session on first use (`createCapture`). */
  createCapture: () => CaptureApi;
  /** How long after open to hold off — the hub's open morph. */
  motionMs: number;
  /** Whether a capture is worth taking right now (flag, motion, WebGL2). */
  shouldCapture?: () => boolean;
  staleMs?: number;
  idleTimeoutMs?: number;
  /**
   * Capture scale ceiling. Overrides `tier` when given.
   */
  scaleCap?: number;
  /**
   * The render tier, or a getter for it (it can be resolved after the scheduler is
   * built). Spec §6.2: the scale is `min(dpr, CAPTURE_DPR_CAP[tier])`, so a `low`
   * device must not pay for a 1.5x bitmap. Read at each capture, not once. When
   * absent or `undefined` the largest cap (`high`) applies — the old behaviour.
   */
  tier?: Tier | (() => Tier | undefined);
  exclude?: readonly string[];
  scheduleIdle?: IdleScheduler;
  now?: () => number;
}

/** What the debug slot and the e2e tests read. */
export interface BeforeCaptureState {
  open: boolean;
  /** A capture is scheduled or running. */
  pending: boolean;
  /** A bitmap is held. */
  held: boolean;
  /** Age of the held bitmap in ms; `null` when none. */
  ageMs: number | null;
  /** Duration of the last successful capture, ms. */
  lastDurationMs: number | null;
  /** How long after the hub opened the last capture started, ms. */
  lastStartedAfterOpenMs: number | null;
  captures: number;
  lastError: string | null;
}

interface Held {
  result: CaptureResult;
  takenAt: number;
}

export class BeforeCaptureScheduler {
  private readonly motionMs: number;
  private readonly staleMs: number;
  private readonly idleTimeoutMs: number;
  private readonly scaleCap: number | undefined;
  private readonly tier: BeforeCaptureOptions['tier'];
  private readonly exclude: readonly string[];
  private readonly scheduleIdle: IdleScheduler;
  private readonly now: () => number;
  private readonly createCapture: () => CaptureApi;
  private readonly shouldCapture: (() => boolean) | undefined;

  private session: CaptureApi | null = null;
  private isOpen = false;
  /** Bumped on every open and close; a capture belonging to an older one is discarded. */
  private epoch = 0;
  private openedAt = 0;
  private held: Held | null = null;
  private consumed = false;
  private inFlight: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private cancelScheduled: Cancel | null = null;
  private motionTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDurationMs: number | null = null;
  private lastStartedAfterOpenMs: number | null = null;
  private captureCount = 0;
  private lastError: string | null = null;
  private disposed = false;

  constructor(options: BeforeCaptureOptions) {
    this.createCapture = options.createCapture;
    this.shouldCapture = options.shouldCapture;
    this.motionMs = options.motionMs;
    this.staleMs = options.staleMs ?? BEFORE_STALE_MS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    this.scaleCap = options.scaleCap;
    this.tier = options.tier;
    this.exclude = options.exclude ?? CAPTURE_EXCLUDE_SELECTORS;
    this.scheduleIdle = options.scheduleIdle ?? defaultIdleScheduler;
    this.now = options.now ?? (() => Date.now());
  }

  /** The hub started to open: schedule the capture. Idempotent while open. */
  hubOpened(): void {
    if (this.disposed || this.isOpen) return;
    this.isOpen = true;
    this.consumed = false;
    this.lastError = null;
    const epoch = ++this.epoch;
    this.openedAt = this.now();
    this.motionTimer = setTimeout(() => {
      this.motionTimer = null;
      if (epoch === this.epoch) this.queue(epoch);
    }, this.motionMs);
  }

  /** The hub closed or was dismissed: stop everything and free the bitmap. */
  hubClosed(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.epoch++;
    this.clearTimers();
    this.abort?.abort();
    this.abort = null;
    this.freeHeld();
  }

  /**
   * The BEFORE bitmap, or `null`. Resolves a fresh held bitmap immediately; if a
   * capture is running, waits up to `graceMs` for it. Ownership of the returned
   * bitmap passes to the caller (it is NOT closed here). Never rejects.
   */
  async awaitBefore(graceMs: number): Promise<ImageBitmap | null> {
    if (!this.isOpen) return null;
    const epoch = this.epoch;
    const ready = this.take();
    if (ready) return ready;
    const running = this.inFlight;
    if (!running) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      running,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, graceMs));
      }),
    ]);
    clearTimeout(timer);
    return epoch === this.epoch ? this.take() : null;
  }

  /** The shared capture session (T31 reuses it for AFTER), created on demand. */
  getCapture(): CaptureApi | null {
    // After dispose a fresh session would be an orphan (a context and a sandbox
    // iframe nobody disposes): there is none to hand out.
    if (this.disposed) return null;
    this.session ??= this.createCapture();
    return this.session;
  }

  state(): BeforeCaptureState {
    return {
      open: this.isOpen,
      pending: this.inFlight !== null || this.cancelScheduled !== null || this.motionTimer !== null,
      held: this.held !== null,
      ageMs: this.held ? this.now() - this.held.takenAt : null,
      lastDurationMs: this.lastDurationMs,
      lastStartedAfterOpenMs: this.lastStartedAfterOpenMs,
      captures: this.captureCount,
      lastError: this.lastError,
    };
  }

  /** Hub unmounted: close everything including the capture session. */
  dispose(): void {
    this.hubClosed();
    this.disposed = true;
    try {
      this.session?.dispose();
    } catch {
      /* nothing to do: the session is going away either way */
    }
    this.session = null;
  }

  /** Hand the held bitmap to the caller if it is still fresh. */
  private take(): ImageBitmap | null {
    const held = this.held;
    if (!held) return null;
    if (this.now() - held.takenAt > this.staleMs) return null;
    this.held = null;
    this.consumed = true;
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = null;
    return held.result.bitmap;
  }

  private freeHeld(): void {
    const held = this.held;
    this.held = null;
    if (held) this.closeBitmap(held.result.bitmap);
  }

  private closeBitmap(bitmap: ImageBitmap): void {
    try {
      bitmap.close();
    } catch {
      /* already closed */
    }
  }

  private clearTimers(): void {
    if (this.motionTimer) clearTimeout(this.motionTimer);
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.motionTimer = null;
    this.staleTimer = null;
    this.cancelScheduled?.();
    this.cancelScheduled = null;
  }

  private currentScaleCap(): number {
    if (this.scaleCap !== undefined) return this.scaleCap;
    const tier = typeof this.tier === 'function' ? this.tier() : this.tier;
    return CAPTURE_DPR_CAP[tier ?? 'high'];
  }

  /**
   * Start a capture now unless one is running. If one IS running (a hub
   * re-opened while the previous open's capture is still winding down after its
   * abort), wait for it and then capture — silently dropping the request would
   * leave the new open with no BEFORE at all.
   */
  private begin(epoch: number): void {
    if (epoch !== this.epoch || this.disposed) return;
    const running = this.inFlight;
    if (running) {
      void running.then(() => {
        if (!this.inFlight) this.begin(epoch);
      });
      return;
    }
    if (this.shouldCapture && !this.shouldCapture()) return;
    this.inFlight = this.run(epoch).finally(() => {
      this.inFlight = null;
    });
  }

  /** Wait for an idle period, then capture. */
  private queue(epoch: number): void {
    this.cancelScheduled?.();
    this.cancelScheduled = this.scheduleIdle(() => {
      this.cancelScheduled = null;
      this.begin(epoch);
    }, this.idleTimeoutMs);
  }

  private async run(epoch: number): Promise<void> {
    const abort = new AbortController();
    this.abort = abort;
    this.lastStartedAfterOpenMs = this.now() - this.openedAt;
    let result: CaptureResult;
    try {
      const session = this.getCapture();
      if (!session) return;
      await session.createSession();
      result = await session.captureViewport({
        phase: 'before',
        exclude: this.exclude,
        scaleCap: this.currentScaleCap(),
        signal: abort.signal,
      });
    } catch (err) {
      if (epoch === this.epoch) {
        this.lastError = err instanceof Error ? err.message : String(err);
      }
      return;
    } finally {
      if (this.abort === abort) this.abort = null;
    }
    this.captureCount++;
    if (epoch !== this.epoch || this.consumed) {
      // The hub closed (or the bitmap was already used) while this was running.
      this.closeBitmap(result.bitmap);
      return;
    }
    const previous = this.held;
    this.held = { result, takenAt: this.now() };
    this.lastDurationMs = result.durationMs;
    if (previous) this.closeBitmap(previous.result.bitmap);
    this.armStaleTimer(epoch);
  }

  /** After `staleMs`, retake on the next idle if the bitmap is still unused. */
  private armStaleTimer(epoch: number): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null;
      if (epoch === this.epoch && this.held && !this.consumed) this.queue(epoch);
    }, this.staleMs);
  }
}
