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
import { detectLiquidTier, liquidGlBlocked } from './detect';
import { anyActive, liveBodies, liveCount, onRegistryChange } from './registry';
import { setLiquidActive } from './active';
import {
  readSceneStatic,
  readLiveInputs,
  type LiveInputs,
  type SceneStatic,
} from './scene';

export { isLiquidActive, subscribeLiquidActive } from './active';

const DPR_CAP = 1.5;
const IDLE_INTERVAL = 1000 / 30; // 30fps idle damping

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
}

let rt: Runtime | null = null;
let tier: LiquidTier = 'none';
let initializing = false;
let forceCss = false;
let classObserver: MutationObserver | null = null;
let resizeHandler: (() => void) | null = null;
let visHandler: (() => void) | null = null;
let unsubRegistry: (() => void) | null = null;

// Integrating components subscribe to `subscribeLiquidActive` (from ./active) so
// they register bodies + skip their SVG-goo underlay only while a tier is live.
function notifyActive(): void {
  setLiquidActive(!!rt);
}

/** The active tier — for the design-lab indicator. */
export function getLiquidTier(): LiquidTier {
  return rt ? tier : 'none';
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

  if (idle && now - rt.lastFrame < IDLE_INTERVAL) {
    rt.raf = requestAnimationFrame(frame);
    return;
  }
  rt.lastFrame = now;

  rt.renderer.render(sc, liveBodies(), liveCount());
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

function teardown(): void {
  stop();
  if (rt) {
    rt.renderer.dispose();
    rt.canvas.remove();
    rt = null;
  }
  document.documentElement.classList.remove('liquid-gl');
  notifyActive();
}

async function boot(): Promise<void> {
  if (rt || initializing) return;
  if (forceCss || liquidGlBlocked()) {
    document.documentElement.classList.remove('liquid-gl');
    return;
  }
  initializing = true;
  try {
    tier = await detectLiquidTier();
    if (tier === 'none') return;

    const canvas = makeCanvas();
    let renderer: LiquidRenderer | null = null;
    if (tier === 'webgpu') {
      const { createWebGPURenderer } = await import('./renderer-webgpu');
      renderer = await createWebGPURenderer(canvas);
      if (!renderer) tier = 'webgl2'; // adapter/device failed after detect — degrade
    }
    if (!renderer) {
      const { createWebGL2Renderer } = await import('./renderer-webgl2');
      renderer = createWebGL2Renderer(canvas);
      tier = renderer ? 'webgl2' : 'none';
    }
    if (!renderer) {
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
    };
    refreshStatic();

    // Insert behind everything (first body child; z-index:-1 keeps it under the
    // transparent app content, which still composites over the shader material).
    document.body.insertBefore(canvas, document.body.firstChild);
    document.documentElement.classList.add('liquid-gl');
    applySize();
    start();
    notifyActive();
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
