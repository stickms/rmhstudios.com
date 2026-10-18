'use client';

import { Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import { aspectBucket, getBakedLut } from '@/lib/eversion/projection-lut';
import { buildPlaceholder } from '@/lib/eversion/placeholder';
import { createCapture, fixedViewport } from '@/lib/eversion/capture';
import { evaluateHostEligibility } from '@/lib/eversion/eligibility';
import { registerDebug, maybeLoadEversionDebug } from '@/lib/eversion/debug';
import { isEversionDebugEnabled, isEversionEnabled } from '@/lib/eversion/flags';
import { getEversionHost, resetEversionHost } from '@/lib/eversion/gl/host';
import { resolveProjection } from '@/lib/eversion/random';
import { EVERSION_MARKS } from '@/lib/eversion/marks';
import type { EntryPoint } from '@/lib/eversion/marks';
import { EversionRunner, HOST_INIT_TIMEOUT_MS, withTimeout } from '@/lib/eversion/runner';
import { createDomProbe, decodeViewportImages, waitForSettled } from '@/lib/eversion/settle';
import type {
  HostPort,
  OverlayPort,
  PagePort,
  RouterPort,
  RunnerDeps,
  RunOptions,
} from '@/lib/eversion/runner';
import {
  BEFORE_GRACE_MS,
  CAPTURE_DPR_CAP,
  CAPTURE_EXCLUDE_SELECTORS,
  TIERS,
} from '@/lib/eversion/constants';
import type {
  CaptureApi,
  EversionController,
  EversionHost,
  EversionNode,
  EversionOutcome,
  FallbackReason,
  GlobeStartState,
  NavTransition,
  ProjectionId,
  Rgba,
  ThemeColours,
  Tier,
  TranslateFn,
  Viewport,
} from '@/lib/eversion/types';
import { useThemeStore } from '@/stores/themeStore';
import {
  discardCanvas,
  fadeOverlay,
  getCanvas,
  mountOverlay,
  unmountOverlay,
} from './overlay-store';
import { detectTier } from './detect-tier';
import type { UseBeforeCapture } from './useBeforeCapture';

/**
 * The orchestrator the hub talks to (spec §3.2, §6.3, §9.2; tasks T31).
 * OWNER: T31. Client-only.
 *
 * ## How the hub uses it (T32)
 *
 * The hub must not gain a static import of anything in here — the capture
 * library, the render host and the renderer all hang off this module — so it
 * loads it with a dynamic `import()` once the effect is wanted (the warm-up,
 * T29, is what makes that import cheap by the time a visitor releases):
 *
 * ```ts
 * const mod = await import('./eversion/useEversionController');
 * const controller = mod.createEversionController({ router, beforeCapture, translate: t });
 * // …render <LazyEversionOverlay /> (React.lazy → ./eversion/EversionOverlay)
 * controller.start(node, globeState, 'release') // → Promise<EversionOutcome>
 * ```
 *
 * `beforeCapture` is the hub's own `useBeforeCapture` result (the BEFORE
 * scheduler runs from the hub, not from here), `router` is `useRouter()`. Until
 * the module has loaded the hub's own `isEligible()` (which includes
 * `chunkReady`) is false, so today's path runs and this is never needed.
 *
 * ## What lives where
 *
 * The sequence is `lib/eversion/runner.ts` (framework-free, unit tested). This
 * file is the real set of ports: the host and its persistent canvas, the
 * document, the router, the theme, the capture session. It is deliberately
 * dull — each port is a few lines over a browser API.
 *
 * ## Work done while the hub is open, not at release
 *
 * `onHubOpened` is idle time: nothing is moving and the visitor is choosing.
 * Three things that would otherwise cost a hitch at release are done then:
 * the projection is drawn (`random` included), its LUT is baked (Peirce is
 * ~45 ms on a desktop — a full dropped-frame run if paid at release), and the
 * render host is initialised on its canvas, which compiles the programs. At
 * release the LUT is posted from the cache; if the hub was released before the
 * idle work ran, `lut` is `null` and the render side bakes it (in the worker,
 * off the main thread), so the cost is only ever moved, never added.
 */

/* ═════════════════════════════════════════════════════════════════════════════
   Colours (spec §10.2)
   ═════════════════════════════════════════════════════════════════════════════ */

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour → RGBA in 0..1, via a 1×1 canvas (which understands everything the page can write). */
function parseColour(css: string): Rgba | null {
  const value = css.trim();
  if (!value || (typeof CSS !== 'undefined' && !CSS.supports('color', value))) return null;
  try {
    if (!probe) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      probe = c.getContext('2d', { willReadFrequently: true });
    }
    if (!probe) return null;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0]! / 255, d[1]! / 255, d[2]! / 255, d[3]! / 255];
  } catch {
    return null;
  }
}

const OPAQUE_BLACK: Rgba = [0, 0, 0, 1];

function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + under[0] * (1 - a),
    top[1] * a + under[1] * (1 - a),
    top[2] * a + under[2] * (1 - a),
    1,
  ];
}

/**
 * Resolve the effect's palette from computed styles (spec §10.2): `--site-bg`,
 * `--site-accent`, the registered `--cage-*` tokens, and the veil — the hub's
 * own `.radial-hub__veil` gradient, whose middle stop is what the visitor sees
 * behind the globe, composited over `--site-bg` so the canvas can be opaque.
 * The `--cage-*` fallback is `LiquidGlobe`'s: on an engine without `@property`
 * the computed value is literal `color-mix(…)` text, so it is mixed here from the
 * same ink at the same alphas.
 */
export function resolveThemeColours(): ThemeColours {
  const root = document.documentElement;
  const hub = document.querySelector('.radial-hub') ?? root;
  const rs = getComputedStyle(root);
  const hs = getComputedStyle(hub);
  const bg =
    parseColour(rs.getPropertyValue('--site-bg')) ??
    parseColour(rs.backgroundColor) ??
    OPAQUE_BLACK;
  const opaqueBg: Rgba = [bg[0], bg[1], bg[2], 1];
  const accent = parseColour(rs.getPropertyValue('--site-accent')) ?? opaqueBg;
  const ink = hs.color || 'rgb(0 0 0)';
  const token = (name: string, alpha: number): Rgba =>
    parseColour(hs.getPropertyValue(name)) ??
    parseColour(`color-mix(in srgb, ${ink} ${alpha * 100}%, transparent)`) ?? [
      0.5,
      0.5,
      0.5,
      alpha,
    ];

  let veil: Rgba = over([bg[0], bg[1], bg[2], 0.76], opaqueBg);
  const veilEl = document.querySelector('.radial-hub__veil');
  if (veilEl) {
    const image = getComputedStyle(veilEl).backgroundImage;
    const stops = image.match(/(?:rgba?|color|oklch|oklab|hsla?|lab|lch)\([^)]*\)/g);
    const mid = stops?.[Math.floor(stops.length / 2)];
    const parsed = mid ? parseColour(mid) : null;
    if (parsed) veil = over(parsed, opaqueBg);
  }
  return {
    bg: opaqueBg,
    veil,
    accent,
    cageMinor: token('--cage-minor', 0.2),
    cageParallel: token('--cage-parallel', 0.13),
    cageMajor: token('--cage-major', 0.34),
    cageRipple: token('--cage-ripple', 0.5),
    cageWidth: parseFloat(hs.getPropertyValue('--cage-width')) || 1,
  };
}

/* ═════════════════════════════════════════════════════════════════════════════
   Ports
   ═════════════════════════════════════════════════════════════════════════════ */

/** The slice of TanStack's router a run needs (`useRouter()` satisfies it). */
export interface RouterLike {
  navigate(options: { to: string }): Promise<unknown>;
  readonly state: { readonly status: 'idle' | 'pending' };
  subscribe(event: 'onResolved', fn: () => void): () => void;
}

export interface EversionControllerDeps {
  router: RouterLike;
  /** The hub's `useBeforeCapture` result: BEFORE bitmap, eligibility, the shared capture session. */
  beforeCapture: Pick<
    UseBeforeCapture,
    'awaitBefore' | 'isEligible' | 'ineligibleReason' | 'getCapture'
  >;
  translate: TranslateFn;
}

const IDLE_DELAY_MS = 700;

/**
 * The viewport as the effect's `position: fixed; inset: 0` overlay sees it, i.e.
 * WITHOUT the `scrollbar-gutter: stable` strip (`capture.ts#fixedViewport`). The
 * canvas backing store, the LUT aspect and the capture must all be this one size:
 * sizing the canvas to `innerWidth` while the capture is `innerWidth - gutter`
 * resampled the page twice.
 */
function viewportNow(): Viewport {
  const { width, height } = fixedViewport();
  return { w: width, h: height, dpr: window.devicePixelRatio || 1 };
}

/** A frame, or 100 ms if the tab is hidden and none will come (a hidden tab never fires one). */
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function createPagePort(): PagePort {
  return {
    onResize(cb) {
      // `resize` fires many times per frame while a window is dragged, and
      // `orientationchange` can fire before the new size is readable: coalesce to
      // one report per frame, read the size then, and say nothing if it did not change.
      let last = viewportNow();
      let frame = 0;
      const flush = () => {
        frame = 0;
        const v = viewportNow();
        if (v.w === last.w && v.h === last.h && v.dpr === last.dpr) return;
        last = v;
        cb(v);
      };
      const onChange = () => {
        if (!frame) frame = requestAnimationFrame(flush);
      };
      window.addEventListener('resize', onChange, { passive: true });
      window.addEventListener('orientationchange', onChange, { passive: true });
      return () => {
        window.removeEventListener('resize', onChange);
        window.removeEventListener('orientationchange', onChange);
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      };
    },
    viewport: viewportNow,
    tier: detectTier,
    colours: resolveThemeColours,
    setCover(on) {
      document.documentElement.classList.toggle('eversion-cover', on);
    },
    setLive(on) {
      document.documentElement.classList.toggle('eversion-live', on);
    },
    setSettle(on) {
      if (on) document.documentElement.setAttribute('data-eversion-settle', '');
      else document.documentElement.removeAttribute('data-eversion-settle');
    },
    watchSettle() {
      const probe = createDomProbe();
      return {
        async whenSettled(request) {
          const report = await waitForSettled(
            probe,
            { now: () => performance.now(), nextFrame },
            request,
          );
          // The pictures the capture reads must be decoded, not merely loaded.
          if (report.reason !== 'cancelled' && report.reason !== 'hurried') {
            await decodeViewportImages();
          }
          return report;
        },
        dispose: () => probe.dispose(),
      };
    },
    nextFrame,
    onInput(cb) {
      const onKey = (e: KeyboardEvent) => {
        if (e.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        cb();
      };
      const onPointer = () => cb();
      // Capture phase on `window`: the fading hub above the overlay sees the press first otherwise.
      // Not `wheel`: a scroll is not a skip request, and the inertial tail of a
      // trackpad flick made just before releasing would fast-forward the run at once.
      window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
      window.addEventListener('keydown', onKey, { capture: true });
      return () => {
        window.removeEventListener('pointerdown', onPointer, { capture: true });
        window.removeEventListener('keydown', onKey, { capture: true });
      };
    },
    currentHref: () => window.location.pathname + window.location.search + window.location.hash,
  };
}

function createRouterPort(router: RouterLike): RouterPort {
  let last: Promise<unknown> = Promise.resolve();
  return {
    navigate(href) {
      // `navigate` pushes history synchronously and resolves when the route has loaded.
      last = router.navigate({ to: href });
      return last;
    },
    async whenIdle() {
      try {
        await last;
      } catch {
        /* an error route still renders: AFTER captures it like any page (spec §9.4) */
      }
      if (router.state.status === 'idle') return;
      await new Promise<void>((resolve) => {
        const off = router.subscribe('onResolved', () => {
          off();
          resolve();
        });
        if (router.state.status === 'idle') {
          off();
          resolve();
        }
      });
    },
    onTraversal(cb) {
      // `popstate` fires for back/forward (and `history.go`) and NOT for the
      // `pushState` our own `navigate` makes, which is exactly the distinction wanted.
      window.addEventListener('popstate', cb);
      return () => window.removeEventListener('popstate', cb);
    },
  };
}

/** The overlay as the React store (`EversionOverlay` renders it). */
const storeOverlay: OverlayPort = {
  mount: mountOverlay,
  fade: fadeOverlay,
  unmount: unmountOverlay,
};

/**
 * An overlay that needs no React: a `div.eversion-overlay` appended to `<body>`.
 * For the debug entry point and the controller e2e, where no hub is mounted.
 */
export function createDomOverlayPort(): OverlayPort {
  let el: HTMLDivElement | null = null;
  return {
    async mount() {
      el = document.createElement('div');
      el.className = 'eversion-overlay';
      el.setAttribute('role', 'presentation');
      el.appendChild(getCanvas());
      document.body.appendChild(el);
    },
    fade() {
      el?.classList.add('eversion-overlay--fading');
    },
    unmount() {
      el?.remove();
      el = null;
    },
  };
}

/* ═════════════════════════════════════════════════════════════════════════════
   The host and its canvas
   ═════════════════════════════════════════════════════════════════════════════ */

/** Where the page's host is in its life (spec 3.2: one host, one persistent canvas). */
type HostState = 'idle' | 'initialising' | 'ready' | 'failed';
/** Cold inits that may fail before the host is written off for the page's lifetime. */
const MAX_HOST_INIT_FAILURES = 2;

/**
 * The page's one host, initialised on the persistent canvas. `init` is sent once
 * per canvas (that is when the programs compile) and `ready` awaited on every
 * call; a failure discards the canvas, because a canvas whose control was
 * transferred to a failed context cannot be reused.
 *
 * ## Readiness is a state, not a wait
 *
 * The init is started while the hub is open and idle (`warm`), has its own
 * generous budget ({@link HOST_INIT_TIMEOUT_MS}) and publishes where it is:
 * `idle` (nothing sent), `initialising`, `ready`, or `failed` (written off after
 * {@link MAX_HOST_INIT_FAILURES} failures, so a broken GPU is not retried on
 * every release). The controller's eligibility reads it, so a release before the
 * init finished is a clean, immediate `host-not-ready` fallback instead of a
 * 600 ms wait that ends in `host-error` - and starts the init for next time.
 */
function createHostPort(): HostPort & {
  warm(tier: Tier): void;
  state(): HostState;
  whenReady(tier: Tier): Promise<boolean>;
  reset(): void;
} {
  let initedFor: HTMLCanvasElement | null = null;
  let readyPromise: Promise<EversionHost> | null = null;
  let state: HostState = 'idle';
  let failures = 0;

  function init(tier: Tier): Promise<EversionHost> {
    const host = getEversionHost();
    const canvas = getCanvas();
    if (initedFor === canvas && readyPromise) return readyPromise;
    initedFor = canvas;
    state = 'initialising';
    let off = () => {};
    const attempt = new Promise<EversionHost>((resolve, reject) => {
      off = host.subscribe((m) => {
        if (m.type === 'ready') {
          off();
          resolve(host);
        } else if (m.type === 'error' && m.fatal) {
          off();
          reject(new Error(m.message));
        }
      });
      try {
        host.post({ type: 'init', canvas, tier, dprCap: TIERS[tier].canvasDprCap });
      } catch (error) {
        off();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    const mine = (readyPromise = withTimeout(attempt, HOST_INIT_TIMEOUT_MS, 'host init'));
    mine.then(
      () => {
        if (readyPromise === mine) {
          state = 'ready';
          failures = 0;
        }
      },
      () => {
        off();
        if (readyPromise !== mine) return;
        failures++;
        port.discardCanvas();
        if (failures >= MAX_HOST_INIT_FAILURES) state = 'failed';
      },
    );
    return mine;
  }

  const port: HostPort & {
    warm(tier: Tier): void;
    state(): HostState;
    whenReady(tier: Tier): Promise<boolean>;
    reset(): void;
  } = {
    ready: (tier, timeoutMs) => withTimeout(init(tier), timeoutMs, 'host ready'),
    discardCanvas() {
      initedFor = null;
      readyPromise = null;
      if (state !== 'failed') state = 'idle';
      discardCanvas();
    },
    warm(tier) {
      if (state === 'failed') return;
      init(tier).catch(() => {});
    },
    state: () => state,
    reset() {
      // The host was disposed under us (bfcache restore): everything cached about
      // it - the ready promise, the canvas it was initialised on, 'ready' - is dead.
      initedFor = null;
      readyPromise = null;
      failures = 0;
      state = 'idle';
      discardCanvas();
    },
    whenReady: (tier) =>
      state === 'failed'
        ? Promise.resolve(false)
        : init(tier).then(
            () => true,
            () => false,
          ),
  };
  return port;
}

/* ═════════════════════════════════════════════════════════════════════════════
   The controller
   ═════════════════════════════════════════════════════════════════════════════ */

export interface EversionControllerHandle extends EversionController {
  /** `start` with the entry point recorded on the `start` mark (S#25). */
  start(
    node: EversionNode,
    state: GlobeStartState,
    entry?: EntryPoint,
    options?: Pick<RunOptions, 'onCommit'>,
  ): Promise<EversionOutcome>;
  /** Hurry the run in flight: back/forward (T33). */
  abort(): void;
  /**
   * Start the host's init now (if it is not under way) and resolve when it is
   * ready - `false` if it failed. For callers with no hub open to do it for
   * them (the debug entry point, the e2e fixtures); the hub never waits on this.
   */
  warmHost(): Promise<boolean>;
  /** Observable state, for the debug slot and tests. */
  state: EversionRunner['state'];
  dispose(): void;
}

/** The last AFTER capture, for `window.__eversion.afterCapture` (debug flag only; see `recordAfterCapture`). */
let lastAfterCapture: {
  at: number;
  width: number;
  height: number;
  png: string;
  settle: unknown;
} | null = null;

/** Debug only: keep a PNG of the AFTER bitmap and what the readiness gate saw, for the late-content e2e. */
function recordAfterCapture(bitmap: ImageBitmap, settle: unknown): void {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  lastAfterCapture = {
    at: performance.now(),
    width: bitmap.width,
    height: bitmap.height,
    png: canvas.toDataURL('image/png'),
    settle,
  };
}

/** Test and e2e seams: replace any port. */
export type ControllerOverrides = Partial<RunnerDeps>;

/**
 * Build the controller. One per hub; cheap (it does nothing until the hub opens
 * or a run starts). `overrides` replaces ports for the e2e, which has no hub, no
 * BEFORE scheduler and, until T17 lands, no real capture.
 */
export function createEversionController(
  deps: EversionControllerDeps,
  overrides: ControllerOverrides = {},
): EversionControllerHandle {
  const hostPort = createHostPort();
  const bakedKeys = new Set<string>();
  let prepared: ProjectionId | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ownCaptures = new Set<CaptureApi>();

  const setting = (): NavTransition => useThemeStore.getState().navTransition;
  /**
   * "Always evert globe": read from the store the controller already reads (no
   * new import, nothing added to the shell's static closure). It only lengthens
   * the release's waits (the runner's `ALWAYS_EVERT_*` limits). Reduced motion is
   * decided by the hub's eligibility BEFORE this is ever consulted.
   */
  const alwaysEvert = (): boolean => useThemeStore.getState().alwaysEvertGlobe;

  const lutKey = (id: ProjectionId, v: Viewport) =>
    `${id}:${aspectBucket(Math.max(v.h, 1) / Math.max(v.w, 1))}`;

  /**
   * A capture session of the controller's own. It is forgotten the moment it is
   * disposed (by its user, or by `dispose()` below): a set that kept every
   * disposed session alive was a per-navigation heap leak (review R6 M4 / R5 m7).
   */
  const openCapture = async (): Promise<CaptureApi> => {
    const capture = createCapture();
    ownCaptures.add(capture);
    const dispose = capture.dispose.bind(capture);
    capture.dispose = () => {
      ownCaptures.delete(capture);
      dispose();
    };
    try {
      await capture.createSession();
    } catch (error) {
      capture.dispose();
      throw error;
    }
    return capture;
  };

  /**
   * Eligibility at the moment of release: the hub's own (flag, motion, WebGL2,
   * chunk) and then the host's. A host that has not finished initialising is not
   * a failure, it is "not yet", and the run waits for it (bounded); one that was
   * never started is started now so that wait has something to wait for.
   */
  const ineligibleReason = (): FallbackReason | null => {
    const base = deps.beforeCapture.ineligibleReason();
    if (base) return base;
    const state = hostPort.state();
    if (state === 'idle') hostPort.warm(detectTier());
    return evaluateHostEligibility(state);
  };

  /**
   * A BEFORE capture taken now, for callers with no hub scheduler result (a
   * Preview) and for a release the scheduler has nothing for.
   * Reuses the scheduler's session when there is one; otherwise opens one for
   * this capture ALONE and always disposes it - each session owns a worker and a
   * sandbox iframe, and this must not leave one behind.
   */
  const captureBeforeNow = async (timeoutMs?: number): Promise<ImageBitmap | null> => {
    let own: CaptureApi | null = null;
    try {
      const capture = deps.beforeCapture.getCapture() ?? (own = await openCapture());
      const result = await capture.captureViewport({
        phase: 'before',
        exclude: CAPTURE_EXCLUDE_SELECTORS,
        scaleCap: CAPTURE_DPR_CAP[detectTier()],
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
      return result.bitmap;
    } catch {
      return null;
    } finally {
      own?.dispose();
    }
  };

  /**
   * The hub's BEFORE bitmap, within `grace` (the runner's `BEFORE_WAIT_MS`, or
   * `ALWAYS_EVERT_BEFORE_WAIT_MS` with the preference on). The scheduler's held or
   * in-flight capture first; if it has nothing (the hub was released before its
   * post-morph idle capture, or that capture timed out on a slow device) one is
   * taken now, in what is left of the same budget. A miss used to be the end of the
   * effect for that navigation, which is why a quick visitor never saw it.
   *
   * A page that cannot be captured at all in that budget (a huge DOM on a slow
   * phone, a capture that throws) still plays: it starts from the instant 2D
   * stand-in of the page itself - the one the destination gets while it loads -
   * instead of being the one page the effect never plays on. The hub covers the
   * page while it is open, so the stand-in is never seen beside the real thing.
   */
  const awaitBefore = async (grace: number): Promise<ImageBitmap | null> => {
    const started = performance.now();
    const held = await deps.beforeCapture.awaitBefore(grace);
    if (held) return held;
    // One budget for both steps, not one each; never less than a capture needs to start.
    const left = Math.max(300, grace - (performance.now() - started));
    const taken = await withTimeout(
      captureBeforeNow(left),
      left + 50,
      'on-demand BEFORE capture',
    ).catch(() => null);
    if (taken) return taken;
    try {
      return await buildPlaceholder(
        { ...previewNode(), id: 'rmh-eversion-controller:before-standin' },
        viewportNow(),
        resolveThemeColours(),
        deps.translate,
        { tier: detectTier() },
      );
    } catch {
      return null;
    }
  };

  const page = createPagePort();
  const runner = new EversionRunner({
    host: hostPort,
    overlay: storeOverlay,
    page,
    router: createRouterPort(deps.router),
    ineligibleReason: () => ineligibleReason(),
    awaitBefore,
    alwaysEvert,
    capture: () => deps.beforeCapture.getCapture(),
    openCapture,
    placeholder: (node, viewport, colours, tier) =>
      buildPlaceholder(node, viewport, colours, deps.translate, { tier }),
    projection() {
      const id = prepared ?? resolveProjection(setting());
      prepared = null;
      return id;
    },
    lut(id, viewport) {
      return bakedKeys.has(lutKey(id, viewport)) ? getBakedLut(id, viewport).data : null;
    },
    requested: setting,
    mark(name, detail) {
      try {
        performance.mark(EVERSION_MARKS[name], detail === undefined ? undefined : { detail });
      } catch {
        /* marks are observability; never let one break a run */
      }
    },
    now: () => performance.now(),
    afterCaptured: isEversionDebugEnabled() ? recordAfterCapture : undefined,
    get maxRunMs() {
      // e2e harness only (testing/e2e/lib/eversion-session.mjs): a software-GL page
      // can stay silent far longer than any device, and is not hung.
      const v = (window as unknown as { __EVERSION_MAX_RUN_MS?: unknown }).__EVERSION_MAX_RUN_MS;
      return typeof v === 'number' && v > 0 ? v : undefined;
    },
    ...overrides,
  });

  function cancelPrep() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  const previewNode = (): EversionNode => ({
    // Also this module's build fingerprint (scripts/check-bundle-budget.ts): a
    // literal that appears in no shell source, unlike the event name
    // `rmh:eversion-preview` the hub and the settings panel both carry.
    id: 'rmh-eversion-controller:preview',
    href: page.currentHref(),
    tKey: 'feed:eversion.preview',
    label: document.title.split(/\s[|–-]\s/)[0] || 'Preview',
    icon: Globe,
  });

  const centredGlobe = (): GlobeStartState => {
    const v = viewportNow();
    return {
      yaw: 0,
      pitch: 0,
      yawVel: 0,
      pitchVel: 0,
      centre: [v.w / 2, v.h / 2],
      radius: Math.min(v.w, v.h) * 0.3,
    };
  };

  /**
   * bfcache restore (review R5 M5): `pagehide` disposed the render host, so the
   * cached 'ready' state points at a host that silently ignores `post()`. Drop it
   * (the next eligibility check re-warms a fresh one) and end any run that was in
   * flight when the page was frozen, with a fade.
   */
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    runner.restoreFromCache();
    hostPort.reset();
    resetEversionHost();
  };
  window.addEventListener('pageshow', onPageShow);

  const handle: EversionControllerHandle = {
    isEligible: () => ineligibleReason() === null,
    ineligibleReason,

    onHubOpened() {
      if (!isEversionEnabled() || !deps.beforeCapture.isEligible()) return;
      cancelPrep();
      const id = resolveProjection(setting());
      prepared = id;
      timer = setTimeout(() => {
        timer = null;
        try {
          const viewport = viewportNow();
          getBakedLut(id, viewport);
          bakedKeys.add(lutKey(id, viewport));
        } catch {
          /* the render side bakes it instead */
        }
        hostPort.warm(detectTier());
      }, IDLE_DELAY_MS);
    },

    onHubClosed() {
      cancelPrep();
    },

    start: (node, state, entry, options) => runner.run(node, state, entry, options),

    warmHost: () => hostPort.whenReady(detectTier()),

    async preview() {
      // No hub was open to warm the host, and a Preview is not time-critical: wait
      // for it (within the cold-init budget) rather than fall back on a cold click.
      if (!(await hostPort.whenReady(detectTier()))) return { fallback: 'host-error' };
      const before = () => captureBeforeNow();
      return runner.run(previewNode(), centredGlobe(), 'preview', {
        // The capture is its own work, not the hub's 250 ms grace: give it room.
        before: async () =>
          withTimeout(before(), BEFORE_GRACE_MS * 4, 'preview capture').catch(() => null),
      });
    },

    abort: () => runner.abort(),
    state: () => runner.state(),
    dispose() {
      cancelPrep();
      // Ends a run in flight outright (cover class, settle attribute, overlay) and
      // makes one still priming fall back: nothing is left to finish it.
      runner.dispose();
      for (const c of [...ownCaptures]) c.dispose();
      ownCaptures.clear();
      window.removeEventListener('pageshow', onPageShow);
    },
  };
  return handle;
}

/**
 * React convenience over {@link createEversionController}: one controller per
 * mount, disposed on unmount. For callers that already hold this module (the
 * debug harness, tests); the hub itself builds the controller from the dynamic
 * `import()` in an effect, because a hook cannot be imported lazily.
 */
export function useEversionController(deps: EversionControllerDeps): EversionControllerHandle {
  const [controller] = useState(() => createEversionController(deps));
  useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}

/* ═════════════════════════════════════════════════════════════════════════════
   Debug (`?eversion-debug=1`)
   ═════════════════════════════════════════════════════════════════════════════ */

if (typeof window !== 'undefined') {
  maybeLoadEversionDebug();
  let debugController: EversionControllerHandle | null = null;
  const ensure = (): EversionControllerHandle | null => {
    const router = (window as unknown as { __TSR_ROUTER__?: RouterLike }).__TSR_ROUTER__;
    if (!router) return null;
    debugController ??= createEversionController(
      {
        router,
        // No hub, so no BEFORE scheduler: capture on demand through a session of our own.
        beforeCapture: {
          isEligible: () => true,
          ineligibleReason: () => null,
          getCapture: () => null,
          awaitBefore: async () => {
            const capture = createCapture();
            try {
              await capture.createSession();
              const r = await capture.captureViewport({
                phase: 'before',
                exclude: CAPTURE_EXCLUDE_SELECTORS,
                scaleCap: CAPTURE_DPR_CAP[detectTier()],
              });
              return r.bitmap;
            } catch {
              return null;
            } finally {
              capture.dispose();
            }
          },
        },
        translate: (key, options) => options?.defaultValue ?? key,
      },
      { overlay: createDomOverlayPort() },
    );
    return debugController;
  };
  registerDebug('afterCapture', { last: () => lastAfterCapture });
  registerDebug('controller', {
    state() {
      const s = ensure()?.state();
      return s ?? { phase: 'idle', coverActive: false, beforeReady: false, afterReady: false };
    },
    ineligibleReason() {
      const c = ensure();
      return c ? c.ineligibleReason() : 'host-error';
    },
    warmHost: async () => (await ensure()?.warmHost()) ?? false,
    async startTo(href) {
      const c = ensure();
      if (!c) return { fallback: 'host-error' satisfies FallbackReason };
      await c.warmHost();
      const v = viewportNow();
      const node: EversionNode = {
        id: 'debug',
        href,
        tKey: 'feed:eversion.debug',
        label: href,
        icon: Globe,
      };
      return c.start(node, {
        yaw: 0,
        pitch: 0,
        yawVel: 0,
        pitchVel: 0,
        centre: [v.w / 2, v.h / 2],
        radius: Math.min(v.w, v.h) * 0.3,
      });
    },
  });
}
