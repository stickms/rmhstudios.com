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
 * builds a scripted one and asserts the SEQUENCE (the URL changes before `start`,
 * the cover class lives only between `cover` and `uncover`, no input ever
 * fast-forwards the run, a failed capture ends it `abort`). A sequence bug in
 * a hook is only visible in a browser; here it is a unit test.
 *
 * ## The sequence
 *
 * ```
 * run(node, state)
 *   eligibility ──no──▶ fallback(reason)                      today's path
 *   awaitBefore(BEFORE_WAIT_MS) ──null──▶ fallback(before-*)   (in-flight capture, else one on demand; <= 1.2 s)
 *   host ready ──no──▶ fallback(host-error)      (a host still initialising is waited for, bounded)
 *   overlay mounted ──no──▶ fallback(host-error)
 *   hold(BEFORE) · prime · texture(before)          ← the frozen picture is up; everything that can fail
 *   2 rAF                                           (the picture is painted over the live page)
 *   ─── the navigation: from here a failure never falls back (the URL has moved) ───
 *   cover ; navigate(href)                          ← the shell is hidden under the picture; the hub is still open
 *   route idle · READINESS GATE (settle.ts, DESTINATION_SETTLE_*) → capture AFTER → texture(after)
 *                                    nothing captured, or cancelled → the run ends with no animation (`abort`)
 *   raiseHold · UPLOAD_SETTLE_FRAMES rAF            (the picture over the canvas; both pictures resident)
 *   ─── the point of no return ────────────────────────────────────────────
 *   onCommit(handover)                              the hub lets go: veil into the globe, globe swells with WRAP
 *   focusHold · frames until HOLD_FADE_MS           the picture's blur pulled to sharp (a radius, never an opacity)
 *   start (with the hub's globe as it is NOW)
 *   cover message → the picture is dropped: the first frame is the same page, sharp
 *   uncover      → cover off · 2 rAF · reveal   (UNWRAP's last ~260 ms; the page is painted under the canvas)
 *   reveal       → the canvas dissolves onto the live page WHILE UNWRAP finishes; both end at `done`
 *   done         → overlay off · free · mark · resolve
 * ```
 *
 * ## Why the destination is rendered before the animation (amended 2026-10-19)
 *
 * It used to be the other way round: `navigate()` at `start`, and AFTER captured whenever the destination
 * settled, mid-animation. Until it arrived the inside of the globe showed a placeholder (the destination's icon
 * and label), so the visitor watched an icon turn inside out instead of the page they were going to; a slow
 * destination unwrapped the icon. And everything the navigation costs on the main thread - the route's render,
 * the readiness checks, the DOM clone, the texture upload - landed inside the first second of the animation, which
 * on an in-thread host (WebKit) is the same thread that draws it: the stutter at the start. Now all of it happens
 * while the hub is still open, behind a frozen picture of the page being left, and the animation starts with both
 * real pages already on the GPU. The route was preloaded while the visitor held the pin in the reticle
 * (`LiquidGlobe#warmLocked`), so the wait is usually the readiness gate and one capture.
 *
 * ## Time
 *
 * `start.t0` and every mark use this thread's `performance.now()`. The render
 * side keeps its own clock (see `gl/core.ts`), so no timestamp the render side
 * reports is trusted here; marks are stamped when the message ARRIVES.
 */

import {
  AFTER_CAPTURE_TIMEOUT_MS,
  ALWAYS_EVERT_BEFORE_WAIT_MS,
  ALWAYS_EVERT_HOST_WAIT_MS,
  ALWAYS_EVERT_OVERLAY_MOUNT_MS,
  GLOBE_RADIUS_FRACTION,
  EVERSION_PLAYBACK_RATE,
  HOLD_FADE_MS,
  BEFORE_WAIT_MS,
  CAPTURE_DPR_CAP,
  CAPTURE_EXCLUDE_SELECTORS,
  DESTINATION_SETTLE_HARD_MS,
  DESTINATION_SETTLE_SOFT_MS,
  MAX_RUN_MS,
  UPLOAD_SETTLE_FRAMES,
  WRAP_MS,
} from './constants';
import type { SettleReport, SettleRequest } from './settle';
import type { EntryPoint, EversionMarkDetails, GateOpenReason } from './marks';
import type {
  CaptureApi,
  CaptureResult,
  EversionEnd,
  EversionHandover,
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
 * How long a release waits for the render host to say `ready`. A ready host
 * answers in a microtask. One still initialising (the bridge starts the init on
 * the page's real canvas as soon as it mounts, so this is the first seconds of a
 * page-load at most) is waited for rather than skipped: it used to be eligibility's
 * immediate `host-not-ready`, and so the first navigation of a page-load, and
 * every navigation on a phone whose compile outlasted the visitor, simply did not
 * play (2026-10-18). Bounded, because the hub sits still meanwhile.
 */
export const HOST_READY_TIMEOUT_MS = 2500;
/**
 * The budget for a COLD host init (worker spawn, shader fetch, `init` handled,
 * programs compiled). It is spent while the page is idle (the bridge starts it
 * when it mounts), so it can be generous: a desktop GPU takes ~100-400 ms, a phone
 * with a cold shader cache a few seconds, and a software GL (SwiftShader, headless
 * CI) well over the old 600 ms. A release while it is still running waits
 * {@link HOST_READY_TIMEOUT_MS} for it; the init itself carries on regardless.
 */
export const HOST_INIT_TIMEOUT_MS = 20_000;
/**
 * How long the overlay may take to attach its canvas before the effect is
 * skipped. React commits it within a frame or two; a low-end phone still busy
 * with the capture it has just taken can take several, and 100 ms skipped the
 * effect there.
 */
export const OVERLAY_MOUNT_TIMEOUT_MS = 500;
/** Ceiling on the frames the focus pull waits (a hidden tab's "frames" are 100 ms timers). */
const FOCUS_MAX_FRAMES = 64;
/** The context-loss fade (spec §9.4; `.eversion-overlay--fading` in eversion.css is 0.2 s). */
export const OVERLAY_FADE_MS = 200;

/** The overlay element the canvas lives in. Implemented by React (the store) and by the DOM helper. */
export interface OverlayPort {
  /** Show the overlay with the canvas attached; resolves once it is in the document. */
  mount(): Promise<void>;
  /**
   * Lay a frozen picture (the BEFORE capture, drawn, not kept: the caller transfers the bitmap right after) over
   * the canvas, so the live page can change underneath unseen while the destination is rendered.
   */
  hold(bitmap: ImageBitmap): void;
  /**
   * The canvas is about to draw: lift the frozen picture over it. Until then the picture sits under the floating UI
   * (the cookie bar, menus), which the capture leaves out and which therefore stays on screen while the destination
   * renders.
   */
  raiseHold(): void;
  /** The hub has let go: pull the frozen picture's blur to sharp (`HOLD_FADE_MS`). WRAP starts once it is. */
  focusHold(): void;
  /** The canvas's first frame is up, and it is the same sharp page: drop the frozen picture. */
  releaseHold(): void;
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
  /**
   * `html.eversion-live` on or off: the live page is handed back SHARP and opaque, with no transition on it
   * (the hub's `everting` look blurs it and holds it so until the hub closes, which would turn the final
   * dissolve into a fade onto a blurred page followed by a pop to the sharp one). On from the first `cover`,
   * released a couple of frames after the run ends, once the hub has left `everting`.
   */
  setLive(on: boolean): void;
  /** `data-eversion-settle` on or off. */
  setSettle(on: boolean): void;
  /**
   * Start watching the live document for the AFTER readiness gate (`settle.ts`). Called before the navigation
   * is issued, so "the page has been quiet" covers the route's own commit.
   */
  watchSettle(): SettleWatch;
  /** Resolves on the next animation frame. */
  nextFrame(): Promise<void>;
  /** Where a Preview run goes: the current route's href. */
  currentHref(): string;
}

/** The AFTER readiness gate's side of the page: see `settle.ts`. */
export interface SettleWatch {
  /** Resolve when the destination is settled, or the bounds in `request` say stop. Never rejects. */
  whenSettled(request: SettleRequest): Promise<SettleReport>;
  /** Stop watching. */
  dispose(): void;
}

/** The router, narrowed to what a run needs. */
export interface RouterPort {
  /**
   * Issue the navigation. Returns the router's own promise; never awaited by the sequence. `issue`, when given,
   * is how (a replayed history push, a back/forward traversal: `RunOptions.navigate`); `href` is then only where.
   */
  navigate(href: string, issue?: () => void): Promise<unknown> | void;
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
  /** The display's refresh rate in Hz (`lib/render/refresh-rate.ts`): the render side's governor aims at it. */
  refreshHz?(): number;
  /**
   * Observability seam (debug only): the AFTER bitmap about to be handed to the render side, before the post
   * detaches it. Must not retain or close it. A throw is swallowed.
   */
  afterCaptured?(bitmap: ImageBitmap, settle: SettleReport | null): void;
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
   * Called at the point of no return: the destination is captured and on the GPU, and the frozen picture is about
   * to come into focus; WRAP starts `handover.delayMs` later. Before it the caller's UI should be left exactly as it
   * was (the hub stays open while the destination renders); from it on the run owns the screen. The hub flips to
   * its `everting` look here, swelling its globe into the effect's with `handover`.
   */
  onCommit?: (handover: EversionHandover) => void;
  /**
   * The effect's first frame is on screen (`cover`): its sphere starts to move NOW. The hub swells its glass globe
   * from this moment, on the sphere's own curve, so the two are one sphere frame for frame (amended 2026-10-20: a
   * swell started on a fixed delay from the commit ran ahead of the sphere by however long the commit's render and
   * the first GL frame took, and the two spheres disagreed about their size while one dissolved into the other).
   */
  onFirstFrame?: () => void;
  /**
   * The globe's pose NOW. The destination is rendered between the confirm and
   * `start`, and the hub's globe keeps turning meanwhile: the effect starts from
   * where it is at `start`, not where it was at the confirm. Absent, the pose
   * given to `run` stands.
   */
  globe?: () => GlobeStartState;
  /**
   * How the navigation is issued, in place of `router.navigate(node.href)` (amended 2026-10-21: every page
   * transition runs the effect). A navigation the site's interceptor held back is REPLAYED exactly as it was asked
   * for: the same history push with its state, or the same back/forward traversal, so the history stack is what it
   * would have been without the effect.
   */
  navigate?: () => void;
  /**
   * `navigate` is a history traversal (back/forward): the one `popstate` it fires is this run's own, not the
   * visitor traversing again, and must not cancel the run.
   */
  traverses?: boolean;
  /**
   * Awaited just before the commit, at most {@link READY_WAIT_MS}: the caller's globe is not ready to be handed
   * over yet (the pop-up globe is still blooming out of the press point). The destination is already rendered and
   * captured by then, so this costs nothing unless the destination was quicker than the bloom.
   */
  ready?: () => Promise<void>;
}

/** The longest a run waits on `RunOptions.ready` before it commits regardless. */
export const READY_WAIT_MS = 1000;

export class EversionRunner {
  private phase: Phase = 'idle';
  private coverActive = false;
  private beforeReady = false;
  private afterReady = false;
  /** Posts to the host of the run in flight; `null` between runs. */
  private abortRun: (() => void) | null = null;
  private fastForwardRun: (() => void) | null = null;
  /** Ends the run in flight at once, whatever it is doing; `null` between runs. */
  private forceEnd: ((fade?: boolean) => void) | null = null;
  /** `dispose()` was called: a run still priming falls back instead of starting. */
  private disposed = false;
  private liveActive = false;
  /** Bumped by every run, so a release scheduled by an earlier one cannot undo a later run's class. */
  private liveEpoch = 0;

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
   * Compress the rest of the run in flight (the timeline's fast-forward, spec §7.6). For the test harness alone
   * (the `run` debug slot, behind `?eversion-debug`): no visitor input reaches it, the run always plays in full
   * (amended 2026-10-20). Once, never during the final dissolve.
   */
  fastForward(): void {
    this.fastForwardRun?.();
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
    this.liveEpoch++;
    this.setLive(false);
    this.beforeReady = false;
    this.afterReady = false;
    const href = node.href;

    // No input speeds the run up, before `start` or after it (owner, 2026-10-20: "Ensure the animation always
    // plays in full, don't speed it up too much"). A tap while the destination renders used to be queued as a
    // fast-forward, and a phone's wait is long enough to invite one: the whole animation then ran in 650 ms.
    // Back/forward while priming (review R6 m2): the router has already moved, so
    // the run must not then push its own destination on top. It is cancelled and
    // reported as a `traversal` fallback, which the hub answers by just closing.
    let traversed = false;
    /** Set while the run waits on the destination: back/forward ends that wait at once. */
    let onTraversalNow: (() => void) | null = null;
    /** `popstate`s this run fires itself (a replayed back/forward), which are not the visitor traversing. */
    let ownPops = 0;
    const ownPop = (): boolean => {
      if (ownPops <= 0) return false;
      ownPops--;
      return true;
    };
    let offEarlyTraversal: (() => void) | null = deps.router.onTraversal(() => {
      if (ownPop()) return;
      traversed = true;
      onTraversalNow?.();
    });
    const dropEarlyInput = () => {
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

    // A fatal error from the render side before `start`: before the navigation it is a fallback, after it the
    // run ends without animating.
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
    let gateReason: GateOpenReason = 'after-ready';
    let t0 = 0;
    let revealing = false;
    let aborted = false;
    /** The frozen picture is over the canvas. */
    let holding = false;
    let settleWatch: SettleWatch | null = null;
    // The run watchdog (review R6 M2): armed at the point of no return, re-armed by
    // every stage message (progress), cleared in teardown.
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const armWatchdog = () => {
      if (ended || !started) return;
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => this.forceEnd?.(true), deps.maxRunMs ?? MAX_RUN_MS);
    };
    let ownCapture: CaptureApi | null = null;

    // Before `start` a throw is the caller's to handle (it falls back, or ends the run unanimated). After it
    // there is no falling back, and the callers are timers and message handlers: a host that cannot be posted
    // to ends the run as a lost context.
    const post = (...args: Parameters<EversionHost['post']>) => {
      try {
        host.post(...args);
      } catch (error) {
        if (!started) throw error;
        deps.host.discardCanvas();
        this.loseContext(true, () => teardown('context-lost', undefined, OVERLAY_FADE_MS));
      }
    };

    const releaseHold = () => {
      if (!holding) return;
      holding = false;
      deps.overlay.releaseHold();
    };

    const teardown = (end: EversionEnd, stats?: FrameStats, keepOverlayMs = 0) => {
      if (ended) return;
      ended = true;
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
      this.abortRun = null;
      this.fastForwardRun = null;
      this.forceEnd = null;
      for (const off of listeners.splice(0)) off();
      this.setCover(false);
      deps.page.setSettle(false);
      ownCapture?.dispose();
      ownCapture = null;
      const unmount = () => {
        holding = false;
        deps.overlay.unmount();
        this.phase = 'done';
        deps.mark('done', { frames: 0, dropped: 0, p95: 0, ...stats, end });
        finish(end, stats);
        // The caller (the hub) leaves `everting` in answer to `finish`: only then may the page blur again.
        this.releaseLiveSoon();
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
          // The first frame is on screen under the frozen picture, and it is the same page, as sharp as the picture
          // now is: let the picture go.
          releaseHold();
          try {
            options.onFirstFrame?.();
          } catch {
            /* the hub's look; never the run's problem */
          }
          return;
        case 'stage':
          armWatchdog();
          if (m.stage === 'evert') deps.mark('evert', {});
          else if (m.stage === 'gate-open') {
            deps.mark('gateOpen', { reason: gateReason });
          } else if (m.stage === 'unwrap') {
            deps.mark('unwrap', {});
          }
          return;
        case 'uncover':
          if (!started || revealing) return;
          revealing = true;
          releaseHold();
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
          // Before `start` nothing has been promised: the prime path sees `fatal` and stops (the render side now
          // ignores everything but `init`).
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

    /** Undo a prime that cannot go on, BEFORE the navigation: the caller does today's path. */
    const unprime = (reason: FallbackReason): EversionOutcome => {
      dropEarlyInput();
      for (const off of listeners.splice(0)) off();
      holding = false;
      deps.overlay.unmount();
      if (fatal) {
        // The render side said its context is gone: the canvas cannot be reused.
        deps.host.discardCanvas();
      } else {
        // The host is fine (a post threw): do not orphan the worker's half-primed run on a canvas we are about
        // to forget. Tell it to stop, and keep the canvas and its compiled programs for the next run.
        try {
          host.post({ type: 'abort' });
        } catch {
          deps.host.discardCanvas();
        }
      }
      this.phase = 'idle';
      return this.fallback(reason);
    };

    /* ── The frozen picture · prime · BEFORE ──────────────────────────────── */

    const viewport = deps.page.viewport();
    const colours = deps.page.colours();
    const projection = deps.projection();
    try {
      // Drawn into the overlay before the bitmap is transferred below.
      deps.overlay.hold(before);
      holding = true;
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
      // The picture must be ON SCREEN before the page under it may change.
      await deps.page.nextFrame();
      await deps.page.nextFrame();
      if (fatal) throw new Error('eversion: host failed during prime');
    } catch {
      before?.close?.();
      return unprime('host-error');
    }
    const cancelledAfterPrime = cancelReason();
    if (cancelledAfterPrime) return unprime(cancelledAfterPrime);

    /* ── The destination: navigated under the picture, settled, captured ─── */

    // Interrupts the wait for the destination at once: back/forward, `dispose`, a bfcache restore.
    let halted = false;
    let interrupt!: () => void;
    const interrupted = new Promise<null>((resolve) => {
      interrupt = () => {
        halted = true;
        resolve(null);
      };
    });
    onTraversalNow = interrupt;
    this.forceEnd = () => interrupt();
    const stop = () => halted || traversed || fatal || this.disposed;
    /** The hub globe's pose now (it keeps turning while the destination renders), or `undefined`. */
    const readPose = (): GlobeStartState | undefined => {
      try {
        return options.globe?.();
      } catch {
        return undefined;
      }
    };

    /**
     * The run ends here, after the navigation and before any animation: nothing is left to show the effect with.
     * Never a fallback (the URL has moved and the destination is live under the picture), except back/forward,
     * which is `traversal` as it always was. The hub closes onto the page as it is.
     */
    const abandon = (): EversionOutcome => {
      ended = true;
      this.forceEnd = null;
      onTraversalNow = null;
      dropEarlyInput();
      for (const off of listeners.splice(0)) off();
      deps.page.setSettle(false);
      ownCapture?.dispose();
      ownCapture = null;
      if (fatal) deps.host.discardCanvas();
      else {
        try {
          host.post({ type: 'abort' });
        } catch {
          deps.host.discardCanvas();
        }
      }
      this.setCover(false);
      // Released at once, not a couple of frames later: no `everting` look was ever shown to leave.
      this.liveEpoch++;
      this.setLive(false);
      holding = false;
      deps.overlay.unmount();
      this.phase = 'idle';
      if (traversed) return this.fallback('traversal');
      deps.mark('done', { frames: 0, dropped: 0, p95: 0, end: 'abort' });
      return { fallback: null, end: 'abort' };
    };

    // The live page is no longer what the visitor sees: hide the shell under the picture (nothing is repainted,
    // and nothing toggles on <html> once the globe moves), and watch the document from BEFORE the navigation so
    // the readiness gate's quiet window covers the route's own commit.
    this.setCover(true);
    try {
      settleWatch = deps.page.watchSettle();
    } catch {
      settleWatch = null;
    }
    const dropSettleWatch = () => {
      settleWatch?.dispose();
      settleWatch = null;
    };
    listeners.push(dropSettleWatch);
    try {
      if (options.navigate && options.traverses) ownPops = 1;
      const navigated = deps.router.navigate(href, options.navigate);
      if (navigated) navigated.catch(() => {});
    } catch {
      // The router refused synchronously. AFTER captures whatever is live, and the visitor sees the effect over
      // the page they were on.
    }

    const renderDestination = async (): Promise<ImageBitmap | null> => {
      const from = deps.now();
      const soft = from + DESTINATION_SETTLE_SOFT_MS;
      const hard = from + DESTINATION_SETTLE_HARD_MS;
      try {
        // The route's own loader (preloaded while the pin sat in the reticle, so usually at once). A router that
        // never settles is waited on to the hard bound; the page is then taken as it is.
        await withTimeout(
          deps.router.whenIdle(),
          Math.max(0, hard - deps.now()),
          'route settle',
        ).catch(() => {});
        if (stop()) return null;
        // The route being idle says nothing about what the page then fetches for itself (a deferred loader, a
        // query, a lazy chunk): the readiness gate waits until it is settled, within the two bounds.
        let settle: SettleReport | null = null;
        if (settleWatch) {
          settle = await settleWatch.whenSettled({
            soft: () => soft,
            hard: () => hard,
            cancelled: stop,
            hurried: () => false,
          });
        } else {
          await deps.page.nextFrame();
          await deps.page.nextFrame();
        }
        if (stop()) return null;
        let session = deps.capture();
        if (!session) {
          const opened = await deps.openCapture();
          // Opened after the run was interrupted: nobody else will dispose it.
          if (stop()) {
            opened.dispose();
            return null;
          }
          session = ownCapture = opened;
        }
        deps.page.setSettle(true);
        // A phone's budget, not a desktop's: a miss here is a navigation with no effect (constants.ts).
        const timeoutMs = AFTER_CAPTURE_TIMEOUT_MS;
        let result: CaptureResult;
        try {
          result = await withTimeout(
            session.captureViewport({
              phase: 'after',
              exclude: CAPTURE_EXCLUDE_SELECTORS,
              scaleCap: CAPTURE_DPR_CAP[tier],
              timeoutMs,
            }),
            timeoutMs + 50,
            'AFTER capture',
          );
        } finally {
          deps.page.setSettle(false);
        }
        if (stop()) {
          result.bitmap.close?.();
          return null;
        }
        try {
          deps.afterCaptured?.(result.bitmap, settle);
        } catch {
          /* observability only */
        }
        return result.bitmap;
      } catch {
        return null;
      }
    };

    const after = await Promise.race([renderDestination(), interrupted]);
    dropSettleWatch();
    if (!after || stop()) {
      after?.close?.();
      return abandon();
    }
    try {
      post({ type: 'texture', slot: 'after', bitmap: after });
    } catch {
      after.close?.();
      return abandon();
    }
    this.afterReady = true;
    // The picture goes over the canvas before the canvas can draw anything, and both pages go to the GPU now, not in
    // the first frame.
    deps.overlay.raiseHold();
    for (let i = 0; i < UPLOAD_SETTLE_FRAMES; i++) await deps.page.nextFrame();
    if (stop()) return abandon();

    // The caller's globe may still be on its way in (the pop-up globe blooms out of the press point): it is handed
    // over from rest, never from the middle of its own entrance.
    if (options.ready) {
      let waited: ReturnType<typeof setTimeout> | null = null;
      await Promise.race([
        options.ready().catch(() => {}),
        new Promise<void>((resolve) => {
          waited = setTimeout(resolve, READY_WAIT_MS);
        }),
        interrupted,
      ]);
      if (waited) clearTimeout(waited);
      if (stop()) return abandon();
    }

    /* ── The commit: the hub lets go and the page comes into focus ────────── */

    // The hub hands its globe over (it swells and travels exactly as the effect's sphere will) and the frozen
    // picture's blur is pulled to sharp. WRAP starts only once the picture IS the canvas's first frame: the flat
    // page, sharp. So nothing crossfades at the start; the picture is simply replaced by itself.
    const committed = readPose() ?? globe;
    const now = deps.page.viewport();
    try {
      options.onCommit?.({
        swell: (GLOBE_RADIUS_FRACTION * Math.min(now.w, now.h)) / Math.max(committed.radius, 1),
        dx: now.w / 2 - committed.centre[0],
        dy: now.h / 2 - committed.centre[1],
        delayMs: HOLD_FADE_MS,
        // WRAP is timeline time; the hub's swell runs on the wall clock beside it.
        wrapMs: WRAP_MS / EVERSION_PLAYBACK_RATE,
      });
    } catch {
      /* the caller's UI hook must never break the run */
    }
    deps.overlay.focusHold();
    const focusFrom = deps.now();
    // Bounded in frames too: a hidden tab's frames are timers, and a clock that does not move must not hang it.
    for (let i = 0; i < FOCUS_MAX_FRAMES && deps.now() - focusFrom < HOLD_FADE_MS; i++) {
      if (stop()) break;
      await deps.page.nextFrame();
    }
    if (stop()) return abandon();
    onTraversalNow = null;

    /* ── The point of no return ───────────────────────────────────────────── */

    this.abortRun = () => {
      if (ended || aborted) return;
      aborted = true;
      gateReason = 'abort';
      post({ type: 'abort' });
    };
    let fastForwarded = false;
    this.fastForwardRun = () => {
      if (ended || aborted || fastForwarded || revealing) return;
      fastForwarded = true;
      post({ type: 'fast-forward' });
    };
    this.forceEnd = (fade = false) => {
      if (ended) return;
      try {
        host.post({ type: 'abort' });
      } catch {
        /* torn down regardless */
      }
      // The render side may still be running on this canvas; do not reuse it.
      deps.host.discardCanvas();
      if (fade) {
        // The overlay is showing a frozen or dead frame: dissolve it into the live
        // page (cover class off first) instead of cutting.
        this.loseContext(true, () => teardown('abort', undefined, OVERLAY_FADE_MS));
        return;
      }
      teardown('abort');
    };
    dropEarlyInput();
    // Browser back/forward and a resize or rotation belong to the visitor, not to
    // this run (spec 9.4): hurry the run, and tell the render side the new viewport.
    listeners.push(
      deps.router.onTraversal(() => {
        if (!ownPop()) this.abort();
      }),
    );
    listeners.push(deps.page.onResize((v) => post({ type: 'resize', viewport: v })));
    // The window changed while the destination rendered: the render side re-plans for it at `start`.
    const current = deps.page.viewport();
    if (current.w !== viewport.w || current.h !== viewport.h || current.dpr !== viewport.dpr) {
      post({ type: 'resize', viewport: current });
    }
    const pose = readPose();
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
    post({ type: 'start', t0, refreshHz: deps.refreshHz?.(), ...(pose ? { globe: pose } : {}) });

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
    // The overlay is about to dissolve onto the live page: it must be the sharp one.
    if (started) this.setLive(true);
    this.setCover(false);
    if (started) {
      this.deps.overlay.fade();
      finishRun();
    }
  }

  private setCover(on: boolean): void {
    if (this.coverActive === on) return;
    this.coverActive = on;
    // From the first cover the live page is the page the canvas will dissolve onto: sharp, opaque, no transition.
    if (on) this.setLive(true);
    this.deps.page.setCover(on);
  }

  private setLive(on: boolean): void {
    if (this.liveActive === on) return;
    this.liveActive = on;
    this.deps.page.setLive(on);
  }

  /**
   * Let go of `eversion-live` once the hub has had time to leave `everting` (two frames: the hub closes in the
   * same breath as the run ends, and a sharp page that blurred again for one frame would be its own glitch).
   */
  private releaseLiveSoon(): void {
    const epoch = this.liveEpoch;
    void (async () => {
      try {
        await this.deps.page.nextFrame();
        await this.deps.page.nextFrame();
      } catch {
        /* release regardless */
      }
      if (epoch === this.liveEpoch) this.setLive(false);
    })();
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
