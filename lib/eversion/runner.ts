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
 *   awaitBefore(BEFORE_GRACE_MS) ──null──▶ fallback(before-*)
 *   host ready ──no──▶ fallback(host-error)
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
  BEFORE_GRACE_MS,
  CAPTURE_DPR_CAP,
  CAPTURE_EXCLUDE_SELECTORS,
} from './constants';
import { EVERSION_MARKS } from './marks';
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
  OrbRect,
  ProjectionId,
  ThemeColours,
  Tier,
  Viewport,
} from './types';

/** How long the render side may take to say `ready` before the effect is skipped. */
export const HOST_READY_TIMEOUT_MS = 600;
/** How long the overlay may take to attach its canvas before the effect is skipped. */
export const OVERLAY_MOUNT_TIMEOUT_MS = 300;
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
  viewport(): Viewport;
  tier(): Tier;
  colours(): ThemeColours;
  orbRect(viewport: Viewport): OrbRect;
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
  mark<K extends keyof typeof EVERSION_MARKS>(
    name: K,
    detail: EversionMarkDetails[K] | undefined,
  ): void;
  now(): number;
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
}

export class EversionRunner {
  private phase: Phase = 'idle';
  private coverActive = false;
  private beforeReady = false;
  private afterReady = false;
  /** Posts to the host of the run in flight; `null` between runs. */
  private abortRun: (() => void) | null = null;

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
    if (this.phase !== 'idle' && this.phase !== 'done') return this.fallback('host-error');

    const ineligible = deps.ineligibleReason();
    if (ineligible) return this.fallback(ineligible);

    this.phase = 'priming';
    this.beforeReady = false;
    this.afterReady = false;
    const href = node.href;

    /* ── Everything that can still fall back ──────────────────────────────── */

    let before: ImageBitmap | null;
    const waitStarted = deps.now();
    try {
      before = await (options.before ?? deps.awaitBefore)(BEFORE_GRACE_MS);
    } catch {
      this.phase = 'idle';
      return this.fallback('before-failed');
    }
    if (!before) {
      this.phase = 'idle';
      return this.fallback(
        deps.now() - waitStarted >= BEFORE_GRACE_MS * 0.9 ? 'before-timeout' : 'before-missing',
      );
    }
    this.beforeReady = true;

    const tier = deps.page.tier();
    let host: EversionHost;
    try {
      host = await deps.host.ready(tier, HOST_READY_TIMEOUT_MS);
      await withTimeout(deps.overlay.mount(), OVERLAY_MOUNT_TIMEOUT_MS, 'overlay mount');
    } catch {
      before.close?.();
      this.cleanupFailedPrime();
      return this.fallback('host-error');
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
    const ownedBitmaps = new Set<ImageBitmap>();
    let ownCapture: CaptureApi | null = null;

    const post = (...args: Parameters<EversionHost['post']>) => host.post(...args);

    const teardown = (end: EversionEnd, stats?: FrameStats, keepOverlayMs = 0) => {
      if (ended) return;
      ended = true;
      this.abortRun = null;
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
        orb: deps.page.orbRect(viewport),
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
      for (const off of listeners.splice(0)) off();
      deps.overlay.unmount();
      deps.host.discardCanvas();
      this.phase = 'idle';
      return this.fallback('host-error');
    }

    /* ── The point of no return: start and navigate in ONE task ───────────── */

    this.abortRun = () => {
      gateReason = 'abort';
      post({ type: 'abort' });
    };
    listeners.push(
      deps.page.onInput(() => {
        if (ended || fastForwarded) return;
        fastForwarded = true;
        post({ type: 'fast-forward' });
      }),
    );
    t0 = deps.now();
    started = true;
    this.phase = 'running';
    deps.mark('start', {
      requested: deps.requested(),
      projection,
      tier,
      host: host.mode,
      href,
      entry,
    });
    post({ type: 'start', t0 });
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
        await deps.router.whenIdle();
        await deps.page.whenAssetsSettled(AFTER_SETTLE_CAP_MS);
        await deps.page.nextFrame();
        await deps.page.nextFrame();
        if (ended || unwrapBegun) return;
        let session = deps.capture();
        if (!session) {
          session = ownCapture = await deps.openCapture();
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
        if (ended || unwrapBegun) {
          result.bitmap.close?.();
          return;
        }
        gateReason = 'after-ready';
        afterSent = true;
        this.afterReady = true;
        post({ type: 'texture', slot: 'after', bitmap: result.bitmap });
      } catch {
        if (ended || afterSent) return;
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
