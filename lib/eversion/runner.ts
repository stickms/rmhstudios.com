/**
 * One navigation's worth of orchestration, with no framework in it (spec §3.2,
 * §6.3, §9.2; tasks T31). OWNER: T31. Client-only at runtime, importable from
 * node.
 *
 * ## Why a class over ports, and not a hook
 *
 * Everything the run touches — the render host, the capture session, the router,
 * the document, the overlay, the clock — is reached through {@link RunnerDeps}.
 * `useEversionController.ts` builds the real set; `__tests__/runner.test.ts`
 * builds a scripted one and asserts the SEQUENCE (the URL changes at `start`,
 * the cover class lives only between `cover` and `unwrap-done`, a fast-forward
 * is posted once, a failed capture becomes `after-failed`). A sequence bug in
 * a hook is only visible in a browser; here it is a unit test.
 *
 * ## The sequence
 *
 * ```
 * run(node, state)
 *   eligibility ──no──▶ fallback(reason)                      today's path
 *   awaitBefore(BEFORE_WAIT_MS) ──null──▶ fallback(before-*)   (waits <= 50 ms; no bitmap in flight = at once)
 *   host ready ──no──▶ fallback(host-error)      (a host still initialising never gets here:
 *                                                    eligibility says host-not-ready, T33)
 *   overlay mounted ──no──▶ fallback(host-error)
 *   prime · texture(before) · placeholder           ← everything that can fail
 *   ─── point of no return ────────────────────────────────────────────────
 *   start ; navigate(href)                          ← the SAME task, no await
 *   cover        → html.eversion-cover on
 *   (route settled · fonts · images · 2 rAF) → capture → texture(after)
 *                                    or after-failed on timeout / throw
 *   unwrap-done  → cover off · 2 rAF · reveal
 *   done         → overlay off · free · mark · resolve
 * ```
 *
 * Everything that can make the effect impossible is done BEFORE the point of no
 * return, because past it the caller has been told nothing and `navigate()` has
 * been called: the contract is that a `fallback` outcome means "the effect did
 * not run, do today's path", so it can never be returned after the navigation
 * was issued. After that point a fault ends the run with `end:
 * 'context-lost'` and the caller does nothing more (the navigation is already
 * under way, which is all today's path would have done).
 *
 * ## Time
 *
 * `start.t0` and every mark use this thread's `performance.now()`. The render
 * side keeps its own clock (see `gl/core.ts`), so no timestamp the render side
 * reports is trusted here; marks are stamped when the message ARRIVES.
 */

import {
  AFTER_CAPTURE_TIMEOUT_MS,
  AFTER_SETTLE_CAP_MS,
  ALWAYS_EVERT_BEFORE_WAIT_MS,
  ALWAYS_EVERT_HOST_WAIT_MS,
  ALWAYS_EVERT_OVERLAY_MOUNT_MS,
  BEFORE_WAIT_MS,
  CAPTURE_DPR_CAP,
  CAPTURE_EXCLUDE_SELECTORS,
  MAX_RUN_MS,
} from './constants';
import type { EntryPoint, EversionMarkDetails, GateOpenReason } from './marks';
import type {
  CaptureApi,
  CaptureResult,
  EversionEnd,
  EversionHost,
  EversionNode,
  EversionOutcome,
  FallbackReason,
  FrameStats,
  FromWorker,
  GlobeStartState,
  NavTransition,
  ProjectionId,
  ThemeColours,
  Tier,
  Viewport,
} from './types';

/**
 * How long the render side may take to say `ready` for a host that is ALREADY
 * initialised. "Host still initialising" is decided earlier, by eligibility (the
 * controller reports `host-not-ready`, see `HOST_INIT_TIMEOUT_MS`); a ready host
 * answers in a microtask, so this only bounds a host that was ready and has
 * since stopped answering - and every millisecond of it is delay added to the
 * fallback navigation, so it is kept to a few frames (review R6 M3).
 */
export const HOST_READY_TIMEOUT_MS = 100;
/**
 * The budget for a COLD host init (worker spawn, shader fetch, `init` handled,
 * programs compiled). It is spent while the hub is open and idle, never at
 * release, so it can be generous: a desktop GPU takes ~100-400 ms, a phone with
 * a cold shader cache a few seconds, and a software GL (SwiftShader, headless CI)
 * well over the old 600 ms. A host still initialising when the visitor releases
 * is "not eligible yet" (`host-not-ready`): today's navigation runs at once and
 * the init carries on for the next one.
 */
export const HOST_INIT_TIMEOUT_MS = 20_000;
/**
 * How long the destination may take to settle (route loaded, no pending router
 * state) before AFTER is declared failed. It is the AFTER capture's own budget
 * (spec 6.4): a destination slower than that is shown by the final crossfade onto
 * whatever is live, not by holding the globe stretched while waiting on it.
 */
export const ROUTE_SETTLE_TIMEOUT_MS = AFTER_CAPTURE_TIMEOUT_MS;
/**
 * How long the overlay may take to attach its canvas before the effect is
 * skipped. React commits it within a frame or two; like the host wait, this is
 * pure added latency on the fallback path.
 */
export const OVERLAY_MOUNT_TIMEOUT_MS = 100;
/** The context-loss fade (spec §9.4; `.eversion-overlay--fading` in eversion.css is 0.2 s). */
export const OVERLAY_FADE_MS = 200;

/** The overlay element the canvas lives in. Implemented by React (the store) and by the DOM helper. */
export interface OverlayPort {
  /** Show the overlay with the canvas attached; resolves once it is in the document. */
  mount(): Promise<void>;
  /** Start the fade-out (context loss). The caller unmounts after {@link OVERLAY_FADE_MS}. */
  fade(): void;
  /** Remove the overlay. The canvas element survives, detached, for the next run. */
  unmount(): void;
}

/** What the runner reads from and writes to the document. */
export interface PagePort {
  /**
   * Run `cb` with the new viewport when the window is resized or rotated, at
   * most once per animation frame (a drag-resize fires many events per frame);
   * returns the remover. A change that leaves the viewport as it was is not
   * reported.
   */
  onResize(cb: (viewport: Viewport) => void): () => void;
  viewport(): Viewport;
  tier(): Tier;
  colours(): ThemeColours;
  /** `html.eversion-cover` on or off. */
  setCover(on: boolean): void;
  /** `data-eversion-settle` on or off. */
  setSettle(on: boolean): void;
  /** `document.fonts.ready` and the viewport's images, each part resolving within `capMs`. */
  whenAssetsSettled(capMs: number): Promise<void>;
  /** Resolves on the next animation frame. */
  nextFrame(): Promise<void>;
  /** Run `cb` on the next input that should fast-forward; returns the remover. */
  onInput(cb: () => void): () => void;
  /** Where a Preview run goes: the current route's href. */
  currentHref(): string;
}

/** The router, narrowed to what a run needs. */
export interface RouterPort {
  /** Issue the navigation. Returns the router's own promise; never awaited by the sequence. */
  navigate(href: string): Promise<unknown> | void;
  /** Resolves when the router has no pending navigation (immediately if none). */
  whenIdle(): Promise<void>;
  /**
   * Run `cb` when the visitor traverses history (browser back/forward) - never
   * for the navigation this run issues itself; returns the remover.
   */
  onTraversal(cb: () => void): () => void;
}

/** The render side's lifecycle, owned by the controller module because the canvas outlives a run. */
export interface HostPort {
  /** The host, with its canvas initialised and `ready` received; rejects on failure or timeout. */
  ready(tier: Tier, timeoutMs: number): Promise<EversionHost>;
  /** Forget the canvas (after context loss) so the next `ready` re-inits on a new element. */
  discardCanvas(): void;
}

export interface RunnerDeps {
  host: HostPort;
  overlay: OverlayPort;
  page: PagePort;
  router: RouterPort;
  /** Eligibility (flag, reduced motion, WebGL2, chunk), evaluated at the moment of release. */
  ineligibleReason(): FallbackReason | null;
  awaitBefore(graceMs: number): Promise<ImageBitmap | null>;
  /** The BEFORE scheduler's capture session, reused for AFTER; `null` makes the controller open its own. */
  capture(): CaptureApi | null;
  /** A session of the runner's own, when the BEFORE scheduler has none. Disposed at the end of the run. */
  openCapture(): Promise<CaptureApi>;
  placeholder(
    node: EversionNode,
    viewport: Viewport,
    colours: ThemeColours,
    tier: Tier,
  ): Promise<ImageBitmap>;
  /** The projection for this run: the visitor's setting resolved (and, for `random`, drawn). */
  projection(): ProjectionId;
  /** The baked LUT for `projection` at `viewport` (cached; baked ahead while the hub was open). */
  lut(projection: ProjectionId, viewport: Viewport): Float32Array | null;
  /** The visitor's setting, for the `start` mark's `requested`. */
  requested(): NavTransition;
  mark<K extends keyof EversionMarkDetails>(
    name: K,
    detail: EversionMarkDetails[K] | undefined,
  ): void;
  now(): number;
  /**
   * The visitor's "Always evert globe" preference: the priming waits (BEFORE,
   * host ready, overlay mount) use their generous `ALWAYS_EVERT_*` limits instead
   * of falling back. Never skips an accessibility or capability check, and the
   * watchdog still applies. Absent means off.
   */
  alwaysEvert?(): boolean;
  /** Override of {@link MAX_RUN_MS} (the e2e harness on a software-GL box); default the constant. */
  maxRunMs?: number;
}

type Phase = 'idle' | 'priming' | 'running' | 'revealing' | 'done';

/** The runner's observable state (the `controller` debug slot reads it). */
export interface RunnerState {
  phase: Phase;
  coverActive: boolean;
  beforeReady: boolean;
  afterReady: boolean;
}

/** Per-run overrides. */
export interface RunOptions {
  /**
   * Where the BEFORE bitmap comes from, in place of the hub's scheduler. The
   * Settings Preview runs with no hub open, so nothing has been captured ahead:
   * it takes the capture on demand.
   */
  before?: (graceMs: number) => Promise<ImageBitmap | null>;
  /**
   * Called synchronously at the point of no return, in the same task as `start`
   * and `navigate`. Before it a `fallback` outcome is still possible and the
   * caller's UI should be left exactly as it was; from it on the run owns the
   * screen. The hub flips to its `everting` look here, so a fallback never has
   * to undo one.
   */
  onCommit?: () => void;
}

export class EversionRunner {
  private phase: Phase = 'idle';
  private coverActive = false;
  private beforeReady = false;
  private afterReady = false;
  /** Posts to the host of the run in flight; `null` between runs. */
  private abortRun: (() => void) | null = null;
  /** Ends the run in flight at once, whatever it is doing; `null` between runs. */
  private forceEnd: ((fade?: boolean) => void) | null = null;
  /** `dispose()` was called: a run still priming falls back instead of starting. */
  private disposed = false;

  constructor(private readonly deps: RunnerDeps) {}

  state(): RunnerState {
    return {
      phase: this.phase,
      coverActive: this.coverActive,
      beforeReady: this.beforeReady,
      afterReady: this.afterReady,
    };
  }

  /** Hurry the run in flight (back/forward, T33): fast-forward with the gate skipped. */
  abort(): void {
    this.abortRun?.();
  }

  /**
   * The owner is going away (the hub's shell unmounted). A run still priming
   * falls back; a run in flight is aborted and torn down NOW - cover class,
   * settle attribute and overlay included - because nothing will be left to
   * finish it. Terminal: a runner is built per controller.
   */
  dispose(): void {
    this.disposed = true;
    this.forceEnd?.();
  }

  /**
   * The page came back from the back/forward cache (`pageshow` persisted): the
   * render side was disposed on `pagehide` and a run that was in flight can never
   * finish. End it now, with a fade, so the hub is not left committed.
   */
  restoreFromCache(): void {
    this.forceEnd?.(true);
  }

  private fallback(reason: FallbackReason, detail?: Partial<EversionMarkDetails['fallback']>) {
    this.deps.mark('fallback', { reason, ...detail });
    return { fallback: reason } satisfies EversionOutcome;
  }

  /**
   * Run the effect toward `node.href`. Never throws; resolves when the overlay is
   * gone. See the file docblock for the sequence and for what `fallback` means.
   */
  async run(
    node: EversionNode,
    globe: GlobeStartState,
    entry?: EntryPoint,
    options: RunOptions = {},
  ): Promise<EversionOutcome> {
    const { deps } = this;
    if (this.phase !== 'idle' && this.phase !== 'done') return this.fallback('busy');

    if (this.disposed) return this.fallback('host-error');
    const ineligible = deps.ineligibleReason();
    if (ineligible) return this.fallback(ineligible);

    this.phase = 'priming';
    this.beforeReady = false;
    this.afterReady = false;
    const href = node.href;

    // Input before `start` is not dropped: a press while the run is still
    // priming (waiting on BEFORE, the host, the placeholder) is a fast-forward
    // the visitor asked for, so it is remembered and posted the moment the
    // render side can take it.
    let queuedInput = false;
    let offEarlyInput: (() => void) | null = deps.page.onInput(() => {
      queuedInput = true;
    });
    // Back/forward while priming (review R6 m2): the router has already moved, so
    // the run must not then push its own destination on top. It is cancelled and
    // reported as a `traversal` fallback, which the hub answers by just closing.
    let traversed = false;
    let offEarlyTraversal: (() => void) | null = deps.router.onTraversal(() => {
      traversed = true;
    });
    const dropEarlyInput = () => {
      offEarlyInput?.();
      offEarlyInput = null;
      offEarlyTraversal?.();
      offEarlyTraversal = null;
    };
    /** Why the priming run must stop now, or `null`. */
    const cancelReason = (): FallbackReason | null =>
      this.disposed ? 'host-error' : traversed ? 'traversal' : null;

    /* ── Everything that can still fall back ──────────────────────────────── */

    let before: ImageBitmap | null;
    const always = deps.alwaysEvert?.() ?? false;
    const beforeWaitMs = always ? ALWAYS_EVERT_BEFORE_WAIT_MS : BEFORE_WAIT_MS;
    const waitStarted = deps.now();
    try {
      before = await (options.before ?? deps.awaitBefore)(beforeWaitMs);
    } catch {
      dropEarlyInput();
      this.phase = 'idle';
      return this.fallback('before-failed');
    }
    const cancelledEarly = cancelReason();
    if (cancelledEarly) {
      before?.close?.();
      dropEarlyInput();
      this.phase = 'idle';
      return this.fallback(cancelledEarly);
    }
    if (!before) {
      dropEarlyInput();
      this.phase = 'idle';
      return this.fallback(
        deps.now() - waitStarted >= beforeWaitMs * 0.9 ? 'before-timeout' : 'before-missing',
      );
    }
    this.beforeReady = true;

    const tier = deps.page.tier();
    let host: EversionHost;
    try {
      host = await deps.host.ready(
        tier,
        always ? ALWAYS_EVERT_HOST_WAIT_MS : HOST_READY_TIMEOUT_MS,
      );
      await withTimeout(
        deps.overlay.mount(),
        always ? ALWAYS_EVERT_OVERLAY_MOUNT_MS : OVERLAY_MOUNT_TIMEOUT_MS,
        'overlay mount',
      );
    } catch {
      before.close?.();
      dropEarlyInput();
      this.cleanupFailedPrime();
      return this.fallback('host-error');
    }
    const cancelledAfterHost = cancelReason();
    if (cancelledAfterHost) {
      before.close?.();
      dropEarlyInput();
      this.cleanupFailedPrime();
      return this.fallback(cancelledAfterHost);
    }

    // A fatal error between here and `start` must still fall back.
    let fatal = false;
    let finish!: (end: EversionEnd, stats?: FrameStats) => void;
    const outcome = new Promise<EversionOutcome>((resolve) => {
      let finished = false;
      finish = (end, stats) => {
        if (finished) return;
        finished = true;
        resolve({ fallback: null, end, stats });
      };
    });

    const listeners: (() => void)[] = [];
    const unsubscribeHost = host.subscribe((m) => onMessage(m));
    listeners.push(unsubscribeHost);

    let started = false;
    let ended = false;
    let fastForwarded = false;
    let gateReason: GateOpenReason = 'stretch-cap';
    let afterSent = false;
    let unwrapBegun = false;
    let t0 = 0;
    let revealing = false;
    let aborted = false;
    // The run watchdog (review R6 M2): armed at the point of no return, re-armed by
    // every stage message (progress), cleared in teardown.
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const armWatchdog = () => {
      if (ended || !started) return;
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => this.forceEnd?.(true), deps.maxRunMs ?? MAX_RUN_MS);
    };
    // Bitmaps this run holds and has not yet handed to the render side (the AFTER
    // one, between capture and a successful post). Teardown closes whatever is left.
    const ownedBitmaps = new Set<ImageBitmap>();
    let ownCapture: CaptureApi | null = null;

    // Before `start` a throw is the caller's to handle (it falls back). After it
    // there is no falling back, and the callers are timers and message handlers:
    // a host that cannot be posted to ends the run as a lost context.
    const post = (...args: Parameters<EversionHost['post']>) => {
      try {
        host.post(...args);
      } catch (error) {
        if (!started) throw error;
        deps.host.discardCanvas();
        this.loseContext(true, () => teardown('context-lost', undefined, OVERLAY_FADE_MS));
      }
    };

    const teardown = (end: EversionEnd, stats?: FrameStats, keepOverlayMs = 0) => {
      if (ended) return;
      ended = true;
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
      this.abortRun = null;
      this.forceEnd = null;
      for (const off of listeners.splice(0)) off();
      this.setCover(false);
      deps.page.setSettle(false);
      for (const b of ownedBitmaps) b.close?.();
      ownedBitmaps.clear();
      ownCapture?.dispose();
      ownCapture = null;
      const unmount = () => {
        deps.overlay.unmount();
        this.phase = 'done';
        deps.mark('done', { frames: 0, dropped: 0, p95: 0, ...stats, end });
        finish(end, stats);
      };
      if (keepOverlayMs > 0) setTimeout(unmount, keepOverlayMs);
      else unmount();
    };

    const onMessage = (m: FromWorker) => {
      if (ended) return;
      switch (m.type) {
        case 'cover':
          if (!started) return;
          deps.mark('cover', { firstFrameMs: deps.now() - t0 });
          this.setCover(true);
          return;
        case 'stage':
          armWatchdog();
          if (m.stage === 'evert') deps.mark('evert', {});
          else if (m.stage === 'gate-open') {
            deps.mark('gateOpen', { reason: gateReason });
          } else if (m.stage === 'unwrap') {
            unwrapBegun = true;
            deps.mark('unwrap', {});
          }
          return;
        case 'unwrap-done':
          if (!started || revealing) return;
          revealing = true;
          void this.reveal(
            () => ended,
            () => {
              this.phase = 'revealing';
              post({ type: 'reveal' });
              deps.mark('reveal', {});
            },
          );
          return;
        case 'done':
          teardown('done', { frames: m.frames, dropped: m.dropped, p95: m.p95 });
          return;
        case 'context-lost':
          deps.host.discardCanvas();
          // Before `start` nothing has been promised: the prime path sees `fatal`
          // and falls back (the render side now ignores everything but `init`).
          if (!started) fatal = true;
          this.loseContext(started, () => teardown('context-lost', undefined, OVERLAY_FADE_MS));
          return;
        case 'error':
          if (!m.fatal) return;
          fatal = true;
          if (started) {
            deps.host.discardCanvas();
            this.loseContext(true, () => teardown('context-lost', undefined, OVERLAY_FADE_MS));
          }
          return;
        default:
          return;
      }
    };

    /* ── prime · textures · placeholder ───────────────────────────────────── */

    const viewport = deps.page.viewport();
    const colours = deps.page.colours();
    const projection = deps.projection();
    let placeholder: ImageBitmap | null = null;
    try {
      post({
        type: 'prime',
        lut: deps.lut(projection, viewport),
        projection,
        viewport,
        globe,
        colours,
      });
      post({ type: 'texture', slot: 'before', bitmap: before });
      before = null; // transferred
      placeholder = await deps.placeholder(node, viewport, colours, tier);
      if (fatal) throw new Error('eversion: host failed during prime');
      post({ type: 'texture', slot: 'placeholder', bitmap: placeholder });
      placeholder = null;
    } catch {
      before?.close?.();
      placeholder?.close?.();
      dropEarlyInput();
      for (const off of listeners.splice(0)) off();
      deps.overlay.unmount();
      if (fatal) {
        // The render side said its context is gone: the canvas cannot be reused.
        deps.host.discardCanvas();
      } else {
        // The host is fine (a post threw, the placeholder failed): do not orphan the
        // worker's half-primed run on a canvas we are about to forget. Tell it to
        // stop, and keep the canvas and its compiled programs for the next run.
        try {
          host.post({ type: 'abort' });
        } catch {
          deps.host.discardCanvas();
        }
      }
      this.phase = 'idle';
      return this.fallback('host-error');
    }
    const cancelledAfterPrime = cancelReason();
    if (cancelledAfterPrime) {
      dropEarlyInput();
      for (const off of listeners.splice(0)) off();
      deps.overlay.unmount();
      try {
        host.post({ type: 'abort' });
      } catch {
        deps.host.discardCanvas();
      }
      this.phase = 'idle';
      return this.fallback(cancelledAfterPrime);
    }

    /* ── The point of no return: start and navigate in ONE task ───────────── */

    this.abortRun = () => {
      if (ended || aborted) return;
      aborted = true;
      gateReason = 'abort';
      post({ type: 'abort' });
    };
    this.forceEnd = (fade = false) => {
      if (ended) return;
      if (started) {
        try {
          host.post({ type: 'abort' });
        } catch {
          /* torn down regardless */
        }
        // The render side may still be running on this canvas; do not reuse it.
        deps.host.discardCanvas();
      }
      if (fade && started) {
        // The overlay is showing a frozen or dead frame: dissolve it into the live
        // page (cover class off first) instead of cutting.
        this.loseContext(true, () => teardown('abort', undefined, OVERLAY_FADE_MS));
        return;
      }
      teardown('abort');
    };
    const fastForward = () => {
      // Once the unwrap has finished only the reveal fade is left, and a fast-forward
      // during it is ignored (spec 7.6); so is a second one.
      if (ended || fastForwarded || revealing) return;
      fastForwarded = true;
      post({ type: 'fast-forward' });
    };
    dropEarlyInput();
    listeners.push(deps.page.onInput(fastForward));
    // Browser back/forward and a resize or rotation belong to the visitor, not to
    // this run (spec 9.4): hurry the run, and tell the render side the new viewport.
    listeners.push(deps.router.onTraversal(() => this.abort()));
    listeners.push(deps.page.onResize((viewport) => post({ type: 'resize', viewport })));
    t0 = deps.now();
    started = true;
    this.phase = 'running';
    // A run that cannot end (GPU hang, dead worker, a host disposed under us) must
    // not hold the hub committed and the screen under a frozen canvas forever.
    armWatchdog();
    deps.mark('start', {
      requested: deps.requested(),
      projection,
      tier,
      host: host.mode,
      href,
      entry,
    });
    post({ type: 'start', t0 });
    if (queuedInput) fastForward();
    try {
      options.onCommit?.();
    } catch {
      /* the caller's UI hook must never break the run */
    }
    try {
      const navigated = deps.router.navigate(href);
      if (navigated) navigated.catch(() => {});
    } catch {
      // The router refused synchronously. The run continues: AFTER will capture
      // whatever is live, and the visitor sees the effect over the page they were on.
    }

    /* ── AFTER ────────────────────────────────────────────────────────────── */

    void (async () => {
      try {
        // A router that never settles (a loader that hangs, a chunk that never
        // arrives) must not leave the gate waiting for a texture that cannot come:
        // it is an AFTER failure like any other, and the run unwraps the placeholder.
        await withTimeout(deps.router.whenIdle(), ROUTE_SETTLE_TIMEOUT_MS, 'route settle');
        await deps.page.whenAssetsSettled(AFTER_SETTLE_CAP_MS);
        await deps.page.nextFrame();
        await deps.page.nextFrame();
        if (ended || unwrapBegun || aborted) return;
        let session = deps.capture();
        if (!session) {
          session = ownCapture = await deps.openCapture();
          // The session took time to open; the run may have ended (or been aborted)
          // meanwhile, and `setSettle(true)` after teardown would never be undone.
          if (ended || unwrapBegun || aborted) {
            ownCapture?.dispose();
            ownCapture = null;
            return;
          }
        }
        deps.page.setSettle(true);
        let result: CaptureResult;
        try {
          result = await withTimeout(
            session.captureViewport({
              phase: 'after',
              exclude: CAPTURE_EXCLUDE_SELECTORS,
              scaleCap: CAPTURE_DPR_CAP[tier],
              timeoutMs: AFTER_CAPTURE_TIMEOUT_MS,
            }),
            AFTER_CAPTURE_TIMEOUT_MS + 50,
            'AFTER capture',
          );
        } finally {
          deps.page.setSettle(false);
        }
        if (ended || unwrapBegun || aborted) {
          result.bitmap.close?.();
          return;
        }
        gateReason = 'after-ready';
        afterSent = true;
        this.afterReady = true;
        // Owned until the post succeeds: if it throws, `post` ends the run and
        // teardown closes it (a transferred bitmap is detached, so a close is harmless).
        ownedBitmaps.add(result.bitmap);
        post({ type: 'texture', slot: 'after', bitmap: result.bitmap });
        ownedBitmaps.delete(result.bitmap);
      } catch {
        if (ended || afterSent || aborted) return;
        gateReason = 'after-failed';
        post({ type: 'after-failed' });
      }
    })();

    return outcome;
  }

  /** Two main-thread rAFs after the cover class comes off, then the caller posts `reveal`. */
  private async reveal(skip: () => boolean, post: () => void): Promise<void> {
    if (skip()) return;
    this.setCover(false);
    await this.deps.page.nextFrame();
    await this.deps.page.nextFrame();
    if (skip()) return;
    post();
  }

  private loseContext(started: boolean, finishRun: () => void): void {
    this.setCover(false);
    if (started) {
      this.deps.overlay.fade();
      finishRun();
    }
  }

  private setCover(on: boolean): void {
    if (this.coverActive === on) return;
    this.coverActive = on;
    this.deps.page.setCover(on);
  }

  private cleanupFailedPrime(): void {
    this.deps.overlay.unmount();
    this.phase = 'idle';
  }
}

/** Reject if `promise` has not settled in `ms`. The timer is always cleared. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`eversion: ${what} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
