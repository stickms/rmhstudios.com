/**
 * Liquid layer orchestrator (§16.1) — owns the single `#liquid-layer` canvas,
 * picks a backend, and runs the render loop within the §16.1.5 budgets.
 *
 * Lazy: `initLiquidGL()` is dynamic-imported from Providers after first paint, so
 * the WGSL/GLSL renderers + this module are a code-split chunk that never touches
 * the LCP path. When a tier initialises it sets `html.liquid-gl` (CSS then hides
 * the body::before/after aurora + `.lg-goo` underlays — never double-render); when
 * no tier is available it does nothing and the untouched CSS/SVG stack renders.
 *
 * Budgets: one canvas · DPR capped at 1.5 · paused on `visibilitychange` · 30fps
 * idle damping when no body animates and the parallax/light are quiet · zero
 * per-frame allocation (reused scene/live-input objects, preallocated uniform
 * staging in the renderers) · body cap 24 (registry).
 */

import type { LiquidRenderer, LiquidTier, SceneState } from './types';
import { liquidGlBlocked, liquidTierCandidates } from './detect';
import { anyActive, liveBodies, liveCount, onRegistryChange } from './registry';
import { setLiquidActive } from './active';
import { readSceneStatic, readLiveInputs, type LiveInputs, type SceneStatic } from './scene';
import {
  GL_TRUST_VERSION,
  WATCHDOG_INTERVAL_MS,
  clearFailure,
  initialVerify,
  isBlockedByPriorFailure,
  isGateFrame,
  recordFailure,
  stepVerify,
  watchdogFailed,
  type VerifyState,
} from './trust';

export { isLiquidActive, subscribeLiquidActive } from './active';

const DPR_CAP = 1.5;
const IDLE_INTERVAL = 1000 / 30; // 30fps idle damping

// §16.4b storage adapters — best-effort, SSR/private-mode safe.
function lsGet(k: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
function lsRemove(k: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

interface Runtime {
  canvas: HTMLCanvasElement;
  renderer: LiquidRenderer;
  raf: number;
  running: boolean;
  startTime: number;
  lastFrame: number;
  // Reused per-frame state (zero allocation).
  scene: SceneState;
  live: LiveInputs;
  static: SceneStatic;
  inlineSig: string;
  // Idle detection.
  lastMx: number;
  lastMy: number;
  lastLx: number;
  lastLy: number;
  // §16.4b trust management.
  verify: VerifyState;
  lastRenderTs: number;
  contextLost: boolean;
  onContextLost: ((e: Event) => void) | null;
}

let rt: Runtime | null = null;
let tier: LiquidTier = 'none';
let initializing = false;
let forceCss = false;
// If WebGPU passes capability detection but fails verification or loses its
// device, retry the independent WebGL2 backend instead of disabling all GL.
let skipWebGPUThisSession = false;
// §16.4b: once WebGL2 proves untrustworthy this session, never re-attempt it.
// Reloads honor a short persisted cooldown; WebGPU failures get one independent
// WebGL2 attempt first (the canvas remains hidden behind CSS during both gates).
let failedThisSession = false;
let watchdog: ReturnType<typeof setInterval> | null = null;
let classObserver: MutationObserver | null = null;
let resizeHandler: (() => void) | null = null;
let visHandler: (() => void) | null = null;
let unsubRegistry: (() => void) | null = null;

// Integrating components subscribe to `subscribeLiquidActive` (from ./active) so
// they register bodies + skip their SVG-goo underlay only while a tier is live.
// §16.4b: "live" means VERIFIED — during the probation window the canvas is still
// hidden behind the CSS aurora, so components must keep rendering the CSS/SVG goo.
function notifyActive(): void {
  setLiquidActive(!!rt && rt.verify.verified);
}

/** The active (verified) tier — for the design-lab indicator. */
export function getLiquidTier(): LiquidTier {
  return rt && rt.verify.verified ? tier : 'none';
}

function dpr(): number {
  return Math.min(window.devicePixelRatio || 1, DPR_CAP);
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.id = 'liquid-layer';
  c.setAttribute('aria-hidden', 'true');
  const s = c.style;
  s.position = 'fixed';
  s.inset = '0';
  s.width = '100%';
  s.height = '100%';
  s.zIndex = '-1';
  s.pointerEvents = 'none';
  s.display = 'block';
  return c;
}

function applySize(): void {
  if (!rt) return;
  const d = dpr();
  const w = Math.round((window.innerWidth || 1) * d);
  const h = Math.round((window.innerHeight || 1) * d);
  rt.renderer.resize(w, h, d);
}

function buildInlineSig(): string {
  // Cheap inline-style reads (no layout flush) — user themes / accents set these
  // inline, so a change here means the scene colours changed without a class swap.
  const st = document.documentElement.style;
  return (
    st.getPropertyValue('--site-canvas') +
    '|' +
    st.getPropertyValue('--site-accent') +
    '|' +
    st.getPropertyValue('--site-glass-glint')
  );
}

function refreshStatic(): void {
  if (!rt) return;
  rt.static = readSceneStatic();
  rt.scene.baseTop = rt.static.baseTop;
  rt.scene.baseMid = rt.static.baseMid;
  rt.scene.baseBot = rt.static.baseBot;
  rt.scene.glows = rt.static.glows;
  rt.scene.accent = rt.static.accent;
  rt.scene.rim = rt.static.rim;
  rt.inlineSig = buildInlineSig();
}

function frame(now: number): void {
  if (!rt || !rt.running) return;

  // Detect a user-theme / accent change via cheap inline reads; re-parse only then.
  const sig = buildInlineSig();
  if (sig !== rt.inlineSig) refreshStatic();

  readLiveInputs(rt.live);
  const sc = rt.scene;
  sc.mx = rt.live.mx;
  sc.my = rt.live.my;
  sc.lightX = rt.live.lightX;
  sc.lightY = rt.live.lightY;
  sc.time = (now - rt.startTime) / 1000;

  // Idle damping: throttle to 30fps when nothing animates and the parallax/light
  // are quiet. The ambient drift keeps advancing (time), just at the idle rate.
  // §16.4b: never idle-damp during probation — render every frame so the gate's N
  // clean frames accumulate promptly (the canvas is still hidden behind the CSS).
  const probation = !rt.verify.verified && !rt.verify.aborted;
  const active = anyActive();
  const moved =
    Math.abs(rt.live.mx - rt.lastMx) > 0.1 ||
    Math.abs(rt.live.my - rt.lastMy) > 0.1 ||
    Math.abs(rt.live.lightX - rt.lastLx) > 0.0005 ||
    Math.abs(rt.live.lightY - rt.lastLy) > 0.0005;
  rt.lastMx = rt.live.mx;
  rt.lastMy = rt.live.my;
  rt.lastLx = rt.live.lightX;
  rt.lastLy = rt.live.lightY;
  const idle = !active && !moved;

  if (!probation && idle && now - rt.lastFrame < IDLE_INTERVAL) {
    rt.raf = requestAnimationFrame(frame);
    return;
  }
  rt.lastFrame = now;

  rt.renderer.render(sc, liveBodies(), liveCount());
  rt.lastRenderTs = now; // §16.4b heartbeat

  // §16.4b verified-frame gating: keep the CSS stack painting until the renderer
  // has produced N clean, non-blank frames — only THEN reveal the canvas. A GL
  // error / lost context / blank readback during probation aborts to CSS for good.
  if (probation) {
    const deep = isGateFrame(rt.verify);
    const { ok, nonBlank } = rt.renderer.checkFrame(deep);
    const lost = rt.contextLost || rt.renderer.isLost();
    rt.verify = stepVerify(rt.verify, { ok, nonBlank, lost });
    if (rt.verify.verified) {
      // Reveal: hide the CSS aurora/goo, tell components the shader is live.
      clearFailure(lsRemove);
      document.documentElement.classList.add('liquid-gl');
      notifyActive();
      startWatchdog();
    } else if (rt.verify.aborted) {
      abortToCss();
      return;
    }
  }

  rt.raf = requestAnimationFrame(frame);
}

function start(): void {
  if (!rt || rt.running) return;
  rt.running = true;
  rt.lastFrame = 0;
  rt.raf = requestAnimationFrame(frame);
}

function stop(): void {
  if (!rt) return;
  rt.running = false;
  if (rt.raf) cancelAnimationFrame(rt.raf);
  rt.raf = 0;
}

// §16.4b runtime watchdog — after activation, a stalled heartbeat or a lost
// context tears the layer down and returns to CSS. Cheap: one 1s interval reading
// timestamps + a flag (no layout, no GL work).
function startWatchdog(): void {
  if (watchdog) return;
  watchdog = setInterval(() => {
    if (!rt) return;
    const failed = watchdogFailed({
      now: performance.now(),
      lastRenderTs: rt.lastRenderTs,
      running: rt.running,
      visible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
      contextLost: rt.contextLost || rt.renderer.isLost(),
    });
    if (failed) abortToCss();
  }, WATCHDOG_INTERVAL_MS);
}

function stopWatchdog(): void {
  if (watchdog) {
    clearInterval(watchdog);
    watchdog = null;
  }
}

/**
 * §16.4b: degrade a failed WebGPU tier to WebGL2, or abandon a failed WebGL2 tier
 * for the rest of the session and persist a short retry cooldown. Removes
 * `html.liquid-gl` so the CSS aurora/goo return, and tells components GL is off.
 */
function abortToCss(): void {
  const failedTier = tier;
  teardown();
  if (failedTier === 'webgpu' && !forceCss && !liquidGlBlocked()) {
    skipWebGPUThisSession = true;
    // The WebGPU canvas/device is fully disposed before the independent WebGL2
    // attempt starts. CSS remains visible throughout both probation windows.
    void boot();
    return;
  }
  failedThisSession = true;
  recordFailure(GL_TRUST_VERSION, lsSet);
}

function teardown(): void {
  stop();
  stopWatchdog();
  if (rt) {
    if (rt.onContextLost) rt.canvas.removeEventListener('webglcontextlost', rt.onContextLost);
    rt.renderer.dispose();
    rt.canvas.remove();
    rt = null;
  }
  document.documentElement.classList.remove('liquid-gl');
  notifyActive();
}

async function boot(): Promise<void> {
  if (rt || initializing || failedThisSession) return;
  if (forceCss || liquidGlBlocked()) {
    document.documentElement.classList.remove('liquid-gl');
    return;
  }
  // §16.4b: pause attempts briefly after a verified-frame/watchdog failure. Old
  // versions and expired cooldowns retry invisibly behind the CSS fallback.
  if (isBlockedByPriorFailure(GL_TRUST_VERSION, lsGet)) {
    document.documentElement.classList.remove('liquid-gl');
    return;
  }
  initializing = true;
  try {
    let canvas: HTMLCanvasElement | null = null;
    let renderer: LiquidRenderer | null = null;
    const candidates = liquidTierCandidates().filter(
      (candidate) => candidate !== 'webgpu' || !skipWebGPUThisSession,
    );
    for (const candidate of candidates) {
      // A canvas is permanently bound to the first context mode requested from
      // it. Use a fresh one per candidate so a failed WebGPU setup cannot make
      // the subsequent WebGL2 getContext() silently return null.
      const candidateCanvas = makeCanvas();
      try {
        if (candidate === 'webgpu') {
          const { createWebGPURenderer } = await import('./renderer-webgpu');
          renderer = await createWebGPURenderer(candidateCanvas);
        } else {
          const { createWebGL2Renderer } = await import('./renderer-webgl2');
          renderer = await createWebGL2Renderer(candidateCanvas);
        }
      } catch {
        renderer = null;
      }
      if (renderer) {
        tier = candidate;
        canvas = candidateCanvas;
        break;
      }
    }
    if (!renderer || !canvas) {
      tier = 'none';
      return;
    }

    // Re-check the gate: a slow async device request could have raced a runtime
    // toggle into a blocked state (or a forceCss).
    if (forceCss || liquidGlBlocked()) {
      renderer.dispose();
      return;
    }

    const scene: SceneState = {
      baseTop: [0, 0, 0],
      baseMid: [0, 0, 0],
      baseBot: [0, 0, 0],
      glows: [],
      accent: [0, 0, 0],
      rim: [1, 1, 1],
      mx: 0,
      my: 0,
      lightX: 0.5,
      lightY: -0.08,
      time: 0,
    };
    const live: LiveInputs = { mx: 0, my: 0, lightX: 0.5, lightY: -0.08, hasLight: false };
    rt = {
      canvas,
      renderer,
      raf: 0,
      running: false,
      startTime: performance.now(),
      lastFrame: 0,
      scene,
      live,
      static: readSceneStatic(),
      inlineSig: '',
      lastMx: 0,
      lastMy: 0,
      lastLx: 0.5,
      lastLy: -0.08,
      verify: initialVerify(),
      lastRenderTs: 0,
      contextLost: false,
      onContextLost: null,
    };
    refreshStatic();

    // §16.4b: a WebGL context-loss event fails the layer immediately (preventing
    // the default also lets nothing try to restore a canvas we're abandoning).
    const onLost = (e: Event) => {
      e.preventDefault();
      if (rt) rt.contextLost = true;
      abortToCss();
    };
    rt.onContextLost = onLost;
    canvas.addEventListener('webglcontextlost', onLost);

    // Insert behind everything (first body child; z-index:-1 keeps it under the
    // transparent app content, which still composites over the shader material).
    // §16.4b VERIFIED-FRAME GATING: do NOT set `html.liquid-gl` yet. The canvas
    // renders behind the still-visible, opaque CSS aurora; only after the frame
    // loop confirms N clean, non-blank frames is the class set (revealing the
    // canvas + hiding the CSS). Until then components keep their CSS/SVG goo, so a
    // canvas that fails/stalls/blanks on WebKit never leaves the site motion-dead.
    document.body.insertBefore(canvas, document.body.firstChild);
    applySize();
    start();
  } finally {
    initializing = false;
  }
}

/**
 * Initialise the liquid layer. Idempotent, safe to call once from Providers after
 * first paint. Returns a disposer that fully tears the layer down.
 */
export function initLiquidGL(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  void boot();

  // Theme / degradation swaps flip the `class` on <html> (style-*, reduce-motion,
  // reduce-transparency, high-contrast, perf-lite). Re-gate + re-parse on those —
  // NOT on `style` mutations (those churn every pointer move via --light-x/y; the
  // inline-signature check in the frame loop catches user-theme colour changes).
  classObserver = new MutationObserver(() => {
    if (!rt) {
      void boot(); // was blocked / not yet up → maybe unblocked now
      return;
    }
    if (forceCss || liquidGlBlocked()) {
      teardown();
      return;
    }
    refreshStatic();
  });
  classObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  resizeHandler = () => applySize();
  window.addEventListener('resize', resizeHandler, { passive: true });

  // Pause on tab hide (budget §16.1.5) — no wasted GPU while backgrounded.
  visHandler = () => {
    if (!rt) return;
    if (document.visibilityState === 'hidden') stop();
    else start();
  };
  document.addEventListener('visibilitychange', visHandler);

  // Wake the loop out of idle the instant a body (de)registers.
  unsubRegistry = onRegistryChange(() => {
    if (rt) rt.lastFrame = 0;
  });

  return () => {
    if (classObserver) classObserver.disconnect();
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    if (visHandler) document.removeEventListener('visibilitychange', visHandler);
    if (unsubRegistry) unsubRegistry();
    classObserver = null;
    resizeHandler = null;
    visHandler = null;
    unsubRegistry = null;
    teardown();
  };
}

/**
 * Force the CSS/SVG fallback (design-lab comparison toggle). When forced on, the
 * GL layer tears down and `html.liquid-gl` is removed so the CSS aurora + goo
 * return; toggling off re-initialises the best tier.
 */
export function setForceCss(on: boolean): void {
  if (forceCss === on) return;
  forceCss = on;
  if (on) teardown();
  else void boot();
}

export function isForcingCss(): boolean {
  return forceCss;
}
