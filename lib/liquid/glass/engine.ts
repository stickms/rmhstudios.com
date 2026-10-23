/**
 * The liquid glass engine: one document service that turns the site's glass roles into shader-drawn slabs.
 *
 * Eligible surfaces (`.glass-pane`, `.glass-chrome`, `.glass-overlay`, the app tier's `.app-glass`, `[data-liquid-glass]`) get a canvas as their
 * LAST child, painted behind their content (`z-index: -2` inside an isolated stacking context, `app/liquid-glass.css`).
 * One shared `GlassRenderer` draws every surface into its own canvas. The canvas is transparent inside the bevel and
 * opaque (the refracted page) on it, so the live DOM is what you see through the middle and the glass is what you see
 * at the edge. See `shader.ts` for the optics and `scene.ts` for the picture the rim refracts.
 *
 * ## What runs when
 *
 * Nothing runs at rest. There is no permanent frame loop: a frame is requested only while something is moving — the
 * cursor light easing toward a surface or away from it, the refracted rim fading in after
 * a new snapshot — or once, for a surface whose size, theme, tint, snapshot or (if it is anchored to the viewport) scroll
 * position changed. The loop is the one `requestAnimationFrame` here, allow-listed in `raf-loop-allowlist.test.ts`.
 *
 * ## What it never does
 *
 * - Touch layout: it reads rects in observer callbacks and frames, and writes only canvases and attributes.
 * - Move or animate a host element: text, hit areas and layout stay fixed. Taps never emit waves.
 * - Depend on `backdrop-filter`, WebGL extensions, or `fwidth`: the look is the same in Chromium, WebKit and Gecko.
 * - Draw when it must not: reduced transparency, forced colours, high contrast, `perf-lite` and print all remove every
 *   canvas and leave the CSS material, which is the fallback tier and is always complete without this file.
 *
 * ## Plasmatic Jelly (master plan R6/R7; 01 §2; 02 §1.3; 04 §3)
 *
 * The slab is jelly. Three things are added to the event-driven rim above, all inside the SAME frame:
 *
 * - **Haze.** The registry's ambient slots (`ambientSlots(governBudget(jellyBudget(), step))`, 8 / 6 / 4, never a
 *   control) that are also admitted slabs get a low-res `.jelly-haze-canvas` (≤ 256px long side) drawn by the haze
 *   program. Its host gets `data-jelly-haze="on"` after the first draw, which hides the CSS carrier, and `jellyBus`
 *   hears `haze:change`. Host knobs (`--jelly-haze-a`, `--jelly-haze-color`, `--jelly-plasma-*`, `--jelly-flow-*`, with
 *   `--site-jelly-*` fallbacks) are read once per surface on admission and on a theme change, never per frame.
 * - **The ambient clock.** While a haze canvas is on screen the frame ticks at the tier's clock (30 Hz; 12 Hz after
 *   `IDLE_AFTER_MS` without input; capped under `calm` and by the governor). It is 0 — no loop at all — while the tab
 *   is hidden, the window unfocused, a scroll in flight, nothing hazy on screen, the tier degraded or `jellyMotion`
 *   `still` (R7). Between ticks it sleeps on a timer, not on a spinning rAF. Each tick draws at most six due surfaces
 *   (oldest first) with one shared `uTime`, then feeds its cost to the `JellyGovernor`, which only ever turns knobs
 *   down and is reset on route change.
 * - **Squish and charge.** A Tier L lattice (`lib/jelly/lattice.ts`) is created for an admitted slab when the physics
 *   service drives it or queues an impulse (`lib/jelly/lattice-inputs.ts`), stepped here, uploaded as `uJelly[8]`, and
 *   dropped when it sleeps or the slab leaves the budget (at most `jellyBudget().lattices` at once). `pulse(el, k)`
 *   raises a rim's plasma for ~300ms; arc strikes and strong releases on the bus pulse automatically.
 */
import { jellyBus } from '@/lib/jelly/bus';
import { JellyGovernor, governBudget, knobsAt } from '@/lib/jelly/governor';
import {
  LATTICE,
  createLattice,
  impulseLattice,
  latticeUniform,
  setLatticeInput,
  stepLattice,
  type Lattice,
  type LatticeInput,
} from '@/lib/jelly/lattice';
import { drainLatticeImpulses, latticeDrive, onLatticeWake } from '@/lib/jelly/lattice-inputs';
import { jellyRegistry, type JellyRegistry } from '@/lib/jelly/registry';
import {
  APP_HIGH_CONTRAST_SELECTOR,
  CALM,
  DEGRADED_ROOT_SELECTOR,
  jellyBudget,
  jellyMode,
  jellyMotionLevel,
  jellyOptedOut,
  jellyTier,
  onJellyEnvChange,
  type JellyBudget,
  type JellyModeState,
  type JellyTier,
} from '@/lib/jelly/tiers';
import { luminance, resolveColor, type RGBA } from './color';
import {
  admit,
  ambientHz,
  approach,
  bevelFor,
  cursorTilt,
  dprFor,
  dueHaze,
  hazeEligible,
  hazeScaleFor,
  hazeSlots,
  innerRadius,
  latticeAmplitude,
  lightTarget,
  nextDue,
  overdrawMargin,
  pulseLevel,
  sceneCoverage,
  seedFor,
  thicknessFor,
  type GlassRole,
} from './policy';
import { GlassRenderer, type GlassDraw, type JellyLook } from './renderer';
import { createSceneProvider, type SceneProvider, type SceneShot } from './scene';
import { clearScene, publishScene } from './scene-store';

/**
 * What becomes a slab. The five glass roles, plus the CONTROLS that carry the material without a role class: solid
 * buttons (ghost and link buttons have no body to give an edge to) and fields. Controls are admitted last, so a screen
 * full of them never starves a card or a menu.
 */
const SELECTOR =
  '.glass-pane,.glass-fill,.glass-chrome,.glass-overlay,.app-glass,[data-liquid-glass],.glass-inset,[data-evert],[data-slot="button"],[data-slot="input"],[data-slot="textarea"]';
const EXCLUDE =
  '[data-jelly="off"],[data-liquid-material="off"],[data-liquid-glass="off"],.glass-chrome--aside,.radial-globe__stage,.radial-hub__orb,.eversion-overlay,canvas,input,textarea,select';
/** Nodes this engine and the other jelly services insert: never surfaces, never "content changed". */
const OWN_LAYERS = 'canvas[data-liquid-glass],.jelly-haze-canvas,.jelly-flow,.jelly-arc-layer';
/** Rim dispersion relative to crown glass (01 §2.7). */
const JELLY_DISPERSION = 0.8;
/** Release energy → pulse strength. Strikes pulse at their full energy. */
const RELEASE_PULSE = 0.6;
const LIGHT_HEIGHT = 96;
/**
 * How far past a surface's own edge the rim may read the snapshot, px. Refraction samples INWARD from the edge, so the
 * region read is the surface itself plus the dispersion spread; a surface flush with the viewport edge (a sticky header
 * at the top) is fully covered and must not be faded as if it read past the picture.
 */
const SCENE_EDGE_MARGIN = 3;
const MUTATION_SETTLE_MS = 1600;

interface Surface {
  el: HTMLElement;
  id: number;
  order: number;
  role: GlassRole;
  visible: boolean;
  /** Padding-box size, CSS px — what the canvas covers. */
  width: number;
  height: number;
  canvas: HTMLCanvasElement | null;
  radius: number;
  tint: RGBA;
  dirty: boolean;
  light: number;
  tiltX: number;
  tiltY: number;
  // ── Jelly ──
  /** Opted out of jelly motion (`jellyOptedOut`): rim only, no haze, no lattice. */
  still: boolean;
  /** Host knobs, read on admission and theme change. */
  look: JellyLook;
  flow: [number, number, number];
  quiet: number;
  /** `--site-jelly-on` > 0. */
  jellyOn: boolean;
  /** Rim canvas overdraw past the host, px (fixed at activation). */
  margin: number;
  haze: HTMLCanvasElement | null;
  /** Haze drawn at least once since (re)creation / a look change; `data-jelly-haze` is set. */
  hazeOn: boolean;
  /** Needs a draw regardless of the clock (new canvas, new look). */
  hazeFresh: boolean;
  /** `performance.now()` the haze is next due (the scheduler's ticket). */
  due: number;
  lattice: Lattice | null;
  latticeInput: LatticeInput | null;
  /** Driven and settled: hold the pose until the drive changes. */
  latticeParked: boolean;
  latticeBuf: Float32Array;
  pulseK: number;
  pulseAt: number;
  pulse: number;
}

const pulseSinks = new Set<(el: Element, k: number) => void>();
let liveGovernorStep = 0;

/**
 * The installed engine's current `JellyGovernor` step (0 … 6; 0 when no engine is installed or after a route change).
 * Other jelly services apply the same ladder to their own budgets with
 * `governBudget(jellyBudget(), jellyGovernorStep())`, so carriers and arcs step down with the haze.
 */
export function jellyGovernorStep(): number {
  return liveGovernorStep;
}

/**
 * Charge a slab: raise its rim's plasma by `k` (0..1) for ~300ms (`policy.ts` `PULSE`). Arcs and physics normally reach
 * this through the bus (`arc:strike`, `body:release`); it is exported for anything else that discharges into a
 * surface. A no-op for an element that is not a drawn slab, or before the engine is installed.
 */
export function pulse(el: Element, k: number): void {
  for (const fn of pulseSinks) fn(el, k);
}

const NO_LOOK: JellyLook = {
  seed: 0,
  haze: [0, 0, 0],
  hazeA: 0,
  plasmaA: [0, 0, 0],
  plasmaB: [0, 0, 0],
  plasma: 0,
};

/** Content must stay live. Sampling a card's own text/hover paints a stale second copy over it. */
const refracts = (s: Surface): boolean => {
  const mode = s.el.getAttribute('data-liquid-glass');
  return mode !== 'lit' && (mode === 'refract' || s.role === 'chrome' || s.role === 'overlay');
};

const roleOf = (el: Element): GlassRole =>
  el.classList.contains('glass-overlay') || el.classList.contains('evert-ghost')
    ? 'overlay'
    : el.classList.contains('glass-chrome')
      ? 'chrome'
      : el.classList.contains('glass-pane') || el.classList.contains('app-glass')
        ? 'pane'
        : el.classList.contains('glass-fill')
          ? 'fill'
          : el.matches(
                '.glass-inset,[data-evert],[data-slot="button"],[data-slot="input"],[data-slot="textarea"]',
              )
            ? 'control'
            : 'other';

interface NavigatorHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function installLiquidGlass(doc: Document = document): () => void {
  const win = doc.defaultView;
  if (!win || typeof win.WebGL2RenderingContext === 'undefined') return () => {};
  const root = doc.documentElement;
  const nav = win.navigator as NavigatorHints;
  const lowEnd =
    (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) ||
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    nav.connection?.saveData === true;

  const queries = {
    transparency: win.matchMedia('(prefers-reduced-transparency: reduce)'),
    forced: win.matchMedia('(forced-colors: active)'),
    fine: win.matchMedia('(hover: hover) and (pointer: fine)'),
    print: win.matchMedia('print'),
  };

  const surfaces = new Map<HTMLElement, Surface>();
  let nextId = 0;
  let renderer: GlassRenderer | null = null;
  let rendererFailed = false;
  let disposed = false;

  // Page snapshot state.
  let scene: { width: number; height: number; scrollX: number; scrollY: number } | null = null;
  let sceneFade = 0;
  let sceneFadeTarget = 0;
  let route = win.location.pathname + win.location.search;

  // Theme state (re-read on theme change).
  let dark = 0;
  let rim: [number, number, number] = [1, 1, 1];
  let ink: [number, number, number] = [0.06, 0.08, 0.12];

  // Pointer state.
  let pointerX = 0;
  let pointerY = 0;
  let pointerLive = false;

  // The frame loop.
  let raf = 0;
  let lastFrame = 0;
  let scrolling = false;
  let scrollTimer = 0;
  let pointerMoved = false;
  /** The rim pass (rect reads, light, tilt, lattices, pulses) is needed this frame. Ambient ticks alone skip it. */
  let rimWanted = true;
  /** Sleeps between ambient ticks so the clock costs nothing between them. */
  let ambientTimer = 0;

  // Jelly state.
  const env = { doc, win };
  let tier: JellyTier = jellyTier(env);
  let budget: JellyBudget = jellyBudget(env);
  let mode: JellyModeState = jellyMode(env);
  let governorBase = budget.clockHz;
  let governor = new JellyGovernor(tier, governorBase);
  let governed: JellyBudget = governBudget(budget, governor.step);
  let amp = 1;
  let focused = doc.hasFocus();
  let lastInput = win.performance.now();
  let lastTick = 0;
  let registry: JellyRegistry | null = null;
  let unRegistry = () => {};
  const hazeSet = new Set<Surface>();
  const wakeQueue = new Set<Element>();

  const readEnv = () => {
    const nextTier = jellyTier(env);
    budget = jellyBudget(env);
    mode = jellyMode(env);
    if (nextTier !== tier || budget.clockHz !== governorBase) {
      tier = nextTier;
      governorBase = budget.clockHz;
      governor = new JellyGovernor(tier, governorBase);
    }
    governed = governBudget(budget, governor.step);
    liveGovernorStep = governor.step;
    const nextAmp = jellyMotionLevel(doc) === 'calm' ? CALM.amplitude : 1;
    if (nextAmp !== amp) {
      amp = nextAmp;
      for (const s of hazeSet) s.hazeFresh = true;
    }
  };
  readEnv();

  const off = () =>
    queries.transparency.matches ||
    queries.forced.matches ||
    queries.print.matches ||
    root.matches(DEGRADED_ROOT_SELECTOR) ||
    !!doc.querySelector(APP_HIGH_CONTRAST_SELECTOR);
  // While the hub is open the page behind it is blurred and covered, and the picture taken BEFORE it opened is the one
  // the globe is refracting; a new one now would be of the wrong thing.
  const hubOpen = () => !!doc.querySelector('.radial-hub:not([data-phase="closed"])');
  const sceneAllowed = () => !scrolling && !lowEnd && !doc.hidden && !off() && !hubOpen();

  const readTheme = () => {
    const style = win.getComputedStyle(root);
    const bg = resolveColor(style.getPropertyValue('--site-bg').trim(), [0.95, 0.96, 0.98, 1], doc);
    dark = luminance(bg) < 0.5 ? 1 : 0;
    const glass = resolveColor(
      style.getPropertyValue('--site-glass-light').trim(),
      [1, 1, 1, 1],
      doc,
    );
    rim = [glass[0], glass[1], glass[2]];
    const text = resolveColor(
      style.getPropertyValue('--site-text').trim(),
      [0.06, 0.08, 0.12, 1],
      doc,
    );
    ink = [text[0], text[1], text[2]];
  };

  const provider: SceneProvider = createSceneProvider({
    doc,
    canCapture: sceneAllowed,
    onShot: (shot: SceneShot) => {
      if (disposed || !renderer?.ready) {
        shot.bitmap.close();
        return;
      }
      const ok = renderer.setScene(shot.bitmap);
      // Share a clone with readers that live in another GL context (the globe's coat), then release ours.
      void publishScene(shot.bitmap, {
        width: shot.width,
        height: shot.height,
        scrollX: shot.scrollX,
        scrollY: shot.scrollY,
      }).finally(() => shot.bitmap.close());
      if (!ok) return;
      scene = {
        width: shot.width,
        height: shot.height,
        scrollX: shot.scrollX,
        scrollY: shot.scrollY,
      };
      sceneFadeTarget = 1;
      // Observable by tests and by anyone debugging a surface that "does not refract": is there a picture at all?
      root.setAttribute('data-liquid-scene', 'on');
      markRefractionDirty();
      requestFrame();
    },
  });

  const ensureRenderer = (): GlassRenderer | null => {
    if (renderer?.ready) return renderer;
    if (rendererFailed) return null;
    renderer = GlassRenderer.create(doc);
    if (!renderer) {
      rendererFailed = true;
      return null;
    }
    renderer.onChange = () => {
      if (!renderer?.ready) {
        // Context lost: put the CSS material back until it is restored.
        for (const s of surfaces.values()) deactivate(s);
        scene = null;
        sceneFade = sceneFadeTarget = 0;
      } else {
        provider.reset();
        provider.request('restore');
        reconcile();
      }
    };
    return renderer;
  };

  const markAllDirty = () => {
    for (const s of surfaces.values()) s.dirty = true;
  };
  const markRefractionDirty = () => {
    for (const s of surfaces.values()) if (refracts(s)) s.dirty = true;
  };

  // ── Surfaces ──────────────────────────────────────────────────────────────
  const visibility = new win.IntersectionObserver(
    (records) => {
      for (const r of records) {
        const s = surfaces.get(r.target as HTMLElement);
        if (s) s.visible = r.isIntersecting;
      }
      scheduleReconcile();
    },
    { rootMargin: '120px' },
  );
  const sizes = new win.ResizeObserver((records) => {
    for (const r of records) {
      const s = surfaces.get(r.target as HTMLElement);
      if (!s) continue;
      s.width = s.el.clientWidth;
      s.height = s.el.clientHeight;
      s.dirty = true;
      if (s.haze) s.hazeFresh = true;
    }
    scheduleReconcile();
    requestFrame();
  });

  const track = (el: HTMLElement) => {
    if (!el.matches(SELECTOR) || el.matches(EXCLUDE)) {
      untrack(el);
      return;
    }
    if (surfaces.has(el)) return;
    surfaces.set(el, {
      el,
      id: nextId++,
      order: nextId,
      role: roleOf(el),
      visible: false,
      width: 0,
      height: 0,
      canvas: null,
      radius: 0,
      tint: [1, 1, 1, 0],
      dirty: true,
      light: 0,
      tiltX: 0,
      tiltY: 0,
      still: false,
      look: { ...NO_LOOK, seed: seedFor(nextId) },
      flow: [1, 1, 0],
      quiet: 0.35,
      jellyOn: true,
      margin: 0,
      haze: null,
      hazeOn: false,
      hazeFresh: false,
      due: 0,
      lattice: null,
      latticeInput: null,
      latticeParked: false,
      latticeBuf: new Float32Array(16),
      pulseK: 0,
      pulseAt: 0,
      pulse: 0,
    });
    visibility.observe(el);
    sizes.observe(el);
  };
  const untrack = (el: HTMLElement) => {
    const s = surfaces.get(el);
    if (!s) return;
    deactivate(s);
    visibility.unobserve(el);
    sizes.unobserve(el);
    surfaces.delete(el);
  };
  const trackTree = (node: Node) => {
    if (!(node instanceof win.HTMLElement)) return;
    track(node);
    node.querySelectorAll<HTMLElement>(SELECTOR).forEach(track);
  };
  const untrackTree = (node: Node) => {
    if (!(node instanceof win.HTMLElement)) return;
    for (const el of [...surfaces.keys()]) if (node === el || node.contains(el)) untrack(el);
  };

  /**
   * The host's jelly knobs (01 §2.4, §3.3): the CSS sets them per role, so the engine holds no role table. Custom
   * properties inherit, so the `--site-jelly-*` fallbacks resolve on the host too.
   */
  const readJelly = (s: Surface, style: CSSStyleDeclaration) => {
    const raw = (name: string) => style.getPropertyValue(name).trim();
    const num = (name: string, fallback: number) => {
      const v = parseFloat(raw(name));
      return Number.isFinite(v) ? v : fallback;
    };
    const rgb = (name: string, site: string, fallback: RGBA): [number, number, number] => {
      const css = raw(name) || raw(site);
      const c = css ? resolveColor(css, fallback, doc) : fallback;
      return [c[0], c[1], c[2]];
    };
    const gain = num('--jelly-plasma-gain', num('--site-jelly-plasma', 1));
    const speed =
      num('--jelly-flow-speed', 1) * num('--jelly-flow-gain', num('--site-jelly-flow-speed', 1));
    // CSS gives the current as a gradient angle (90deg = a band sliding horizontally); the shader wants the axis.
    const axis = ((num('--jelly-flow-axis-deg', 100) - 90) * Math.PI) / 180;
    s.look = {
      seed: s.look.seed,
      haze: rgb('--jelly-haze-color', '--site-jelly-haze', [0.92, 0.93, 0.96, 1]),
      hazeA: Math.max(0, Math.min(0.6, num('--jelly-haze-a', 0))),
      plasmaA: rgb('--jelly-plasma-a', '--site-jelly-plasma-a', [0.7, 0.66, 1, 1]),
      plasmaB: rgb('--jelly-plasma-b', '--site-jelly-plasma-b', [0.56, 0.88, 0.93, 1]),
      plasma: Math.max(0, Math.min(1, num('--jelly-plasma-k', 0) * gain)),
    };
    s.flow = [
      Math.max(0, speed),
      Math.max(0, num('--jelly-flow-eddy', s.role === 'chrome' ? 0 : 1)),
      axis,
    ];
    s.quiet = Math.max(0, Math.min(1, num('--site-jelly-quiet', 0.35)));
    s.jellyOn = num('--site-jelly-on', 1) > 0;
    s.still = jellyOptedOut(s.el);
    s.hazeFresh = true;
  };

  const measure = (s: Surface) => {
    const style = win.getComputedStyle(s.el);
    s.width = s.el.clientWidth;
    s.height = s.el.clientHeight;
    const border = parseFloat(style.borderTopWidth) || 0;
    s.radius = innerRadius(style.borderTopLeftRadius, border, s.width, s.height);
    s.tint = resolveColor(style.backgroundColor, [1, 1, 1, 0], doc);
    if (style.position === 'static') s.el.setAttribute('data-liquid-static', '');
    else s.el.removeAttribute('data-liquid-static');
    readJelly(s, style);
  };

  const activate = (s: Surface) => {
    if (s.canvas) return;
    if (!ensureRenderer()) return;
    const canvas = doc.createElement('canvas');
    canvas.className = 'liquid-glass-canvas';
    canvas.setAttribute('data-liquid-glass', '');
    canvas.setAttribute('aria-hidden', 'true');
    s.canvas = canvas;
    measure(s);
    // Static, never animated: room for an outward lattice bulge on cards and controls (≤ 2px, 02 §1.3).
    s.margin = overdrawMargin(s.role, budget.lattices > 0 && !s.still);
    if (s.margin > 0) {
      const m = s.margin;
      canvas.style.cssText = `left:${-m}px;top:${-m}px;width:calc(100% + ${2 * m}px);height:calc(100% + ${2 * m}px)`;
    }
    s.el.setAttribute('data-liquid-canvas', 'on');
    s.el.append(canvas);
    s.dirty = true;
    if (!scene) provider.request('activate');
  };
  const deactivate = (s: Surface) => {
    removeHaze(s);
    dropLattice(s);
    if (!s.canvas) return;
    s.canvas.remove();
    s.canvas = null;
    s.el.removeAttribute('data-liquid-canvas');
    s.el.removeAttribute('data-liquid-static');
    s.light = 0;
    s.tiltX = s.tiltY = 0;
    s.pulseK = s.pulse = 0;
  };

  // ── Haze canvases ─────────────────────────────────────────────────────────
  const addHaze = (s: Surface) => {
    if (s.haze || !s.canvas) return;
    const c = doc.createElement('canvas');
    c.className = 'jelly-haze-canvas';
    c.setAttribute('aria-hidden', 'true');
    // Just before the rim canvas: the rim stays the host's last child and content keeps its first child.
    s.el.insertBefore(c, s.canvas);
    s.haze = c;
    s.hazeOn = false;
    s.hazeFresh = true;
    s.due = 0;
    hazeSet.add(s);
  };
  function removeHaze(s: Surface) {
    hazeSet.delete(s);
    if (!s.haze) return;
    s.haze.remove();
    s.haze = null;
    s.hazeFresh = false;
    if (s.hazeOn) {
      s.hazeOn = false;
      s.el.removeAttribute('data-jelly-haze');
      jellyBus.emit('haze:change', { el: s.el, on: false });
    }
  }
  function dropLattice(s: Surface) {
    if (!s.lattice) return;
    s.lattice = null;
    s.latticeInput = null;
    s.latticeParked = false;
    s.dirty = true;
  }

  const bindRegistry = () => {
    const next = jellyRegistry(doc);
    if (next === registry) return;
    unRegistry();
    registry = next;
    unRegistry = next ? next.onChange(scheduleReconcile) : () => {};
  };

  /** Which admitted slabs hold a haze canvas: the registry's ambient slots, minus controls and opt-outs. */
  const reconcileHaze = () => {
    bindRegistry();
    // A hidden tab keeps its canvases (the clock is already 0); dropping them would only rebuild them on return.
    if (doc.hidden) return;
    const want = new Set<Surface>();
    if (registry && renderer?.hazeReady && mode.ambient && governed.hazeSlots > 0) {
      const focus = pointerLive && queries.fine.matches ? { x: pointerX, y: pointerY } : null;
      for (const e of hazeSlots(registry.ambientSlots(governed, focus))) {
        const s = surfaces.get(e.el as HTMLElement);
        if (
          s?.canvas &&
          s.visible &&
          hazeEligible(s.role) &&
          !s.still &&
          s.jellyOn &&
          s.look.hazeA + s.look.plasma > 0
        )
          want.add(s);
      }
    }
    for (const s of [...hazeSet]) if (!want.has(s)) removeHaze(s);
    for (const s of want) addHaze(s);
    // Lattices: none while the budget allows none, never more than it allows.
    let live = 0;
    for (const s of surfaces.values()) {
      if (!s.lattice) continue;
      if (++live > budget.lattices || s.still || !s.canvas) dropLattice(s);
    }
    if (hazeSet.size) wakeAmbient();
  };

  let reconcileQueued = false;
  const scheduleReconcile = () => {
    if (reconcileQueued || disposed) return;
    reconcileQueued = true;
    queueMicrotask(() => {
      reconcileQueued = false;
      reconcile();
    });
  };
  const reconcile = () => {
    if (disposed) return;
    if (off()) {
      for (const s of surfaces.values()) deactivate(s);
      stopFrames();
      return;
    }
    const want = new Set(
      admit(
        [...surfaces.values()].map((s) => ({
          id: s.id,
          s,
          role: s.role,
          order: s.order,
          visible: s.visible && s.el.isConnected,
          width: s.width,
          height: s.height,
        })),
        budget.rims,
      ).map((c) => c.s),
    );
    for (const s of surfaces.values()) {
      if (!want.has(s)) deactivate(s);
    }
    for (const s of want) activate(s);
    reconcileHaze();
    requestFrame();
  };

  // ── Drawing ───────────────────────────────────────────────────────────────
  const drawSurface = (s: Surface, rect: DOMRect): boolean => {
    const r = renderer;
    if (!r?.ready || !s.canvas || !s.el.isConnected) return false;
    const padLeft = s.el.clientLeft;
    const padTop = s.el.clientTop;
    const w = s.width;
    const h = s.height;
    if (w < 1 || h < 1) return false;
    const bezel = bevelFor(w, h, s.radius);
    const thickness = thicknessFor(bezel);
    const dpr = dprFor(win.devicePixelRatio || 1, w, h);

    // Where this surface's top-left sits in the snapshot, with the scroll since it was taken applied.
    let sceneX = 0;
    let sceneY = 0;
    let sceneOn = 0;
    if (scene && sceneFade > 0 && refracts(s)) {
      sceneX = rect.left + padLeft + (win.scrollX - scene.scrollX);
      sceneY = rect.top + padTop + (win.scrollY - scene.scrollY);
      sceneOn =
        sceneFade *
        sceneCoverage(sceneX, sceneY, w, h, scene.width, scene.height, SCENE_EDGE_MARGIN);
    }

    // The cursor light, in this surface's pixels.
    const ox = rect.left + padLeft;
    const oy = rect.top + padTop;
    const o: GlassDraw = {
      width: w,
      height: h,
      dpr,
      radius: s.radius,
      bezel,
      thickness,
      sceneX,
      sceneY,
      sceneW: scene?.width ?? 1,
      sceneH: scene?.height ?? 1,
      sceneOn,
      tint: s.tint,
      rim,
      ink,
      dark,
      lightX: pointerX - ox,
      lightY: pointerY - oy,
      lightZ: LIGHT_HEIGHT,
      lightOn: s.light,
      tilt: [s.tiltX, s.tiltY],
      jelly: s.pulse > 0 ? { ...s.look, plasma: Math.min(1, s.look.plasma + s.pulse) } : s.look,
      dispersion: JELLY_DISPERSION,
      margin: s.margin,
      lattice: s.lattice && !s.lattice.asleep ? latticeUniform(s.lattice, s.latticeBuf) : null,
    };
    return r.draw(o, s.canvas);
  };

  // ── The ambient clock (R7) ────────────────────────────────────────────────
  const clockHz = (now: number) =>
    ambientHz({
      hidden: doc.hidden,
      focused,
      scrolling,
      hazeSurfaces: hazeSet.size,
      ambient: mode.ambient,
      msSinceInput: now - lastInput,
      clockHz: governed.clockHz,
      idleClockHz: governed.idleClockHz,
    });

  const drawHaze = (s: Surface, time: number): boolean => {
    const r = renderer;
    if (!r?.hazeReady || !s.haze || !s.el.isConnected) return false;
    const w = s.width;
    const h = s.height;
    if (w < 1 || h < 1) return false;
    const ok = r.drawHaze(
      {
        width: w,
        height: h,
        scale: hazeScaleFor(w, h, s.role, knobsAt(governor.step).hazeScale),
        radius: s.radius,
        bezel: bevelFor(w, h, s.radius),
        look: s.look,
        flow: s.flow,
        quiet: s.quiet,
        amp,
      },
      time,
      s.haze,
    );
    if (ok && !s.hazeOn) {
      s.hazeOn = true;
      s.el.setAttribute('data-jelly-haze', 'on');
      jellyBus.emit('haze:change', { el: s.el, on: true });
    }
    return ok;
  };

  /**
   * One ambient tick: the due haze surfaces (≤ 6, oldest first), one shared `uTime`, all before any rim draw so the
   * frame switches program at most twice. Fresh canvases draw even with the clock at 0, so a frozen field is never a
   * blank one. The batch's cost feeds the governor.
   */
  const tickHaze = (now: number, hz: number) => {
    if (hazeSet.size === 0) {
      lastTick = 0;
      return;
    }
    const ticking = hz > 0 && now - lastTick >= 1000 / hz - 2;
    const batch = ticking
      ? dueHaze([...hazeSet], now)
      : dueHaze(
          [...hazeSet].filter((s) => s.hazeFresh),
          Infinity,
        );
    if (!ticking && batch.length === 0) {
      if (hz <= 0) lastTick = 0;
      return;
    }
    const t0 = win.performance.now();
    const time = (now / 1000) % 3600;
    for (const s of batch) {
      drawHaze(s, time);
      s.hazeFresh = false;
      s.due = hz > 0 ? nextDue(now, hz, s.role) : now;
    }
    if (!ticking) return;
    const interval = lastTick ? now - lastTick : 0;
    lastTick = now;
    if (interval > 0) {
      const step = governor.record(win.performance.now() - t0, interval);
      if (step !== null) {
        governed = governBudget(budget, step);
        liveGovernorStep = step;
        for (const s of hazeSet) s.hazeFresh = true;
        scheduleReconcile();
      }
    }
  };

  /** Sleep until the next tick is due: a timer, then one rAF, so the 12 Hz idle clock really is 12 callbacks a second. */
  const scheduleAmbient = (now: number, hz: number) => {
    if (hz <= 0 || hazeSet.size === 0 || raf || disposed) return;
    const wait = lastTick + 1000 / hz - now;
    if (wait <= 12) {
      raf = win.requestAnimationFrame(frame);
      return;
    }
    win.clearTimeout(ambientTimer);
    ambientTimer = win.setTimeout(() => {
      ambientTimer = 0;
      if (!raf && !disposed && renderer?.ready) raf = win.requestAnimationFrame(frame);
    }, wait - 8);
  };

  // ── Lattices and pulses ───────────────────────────────────────────────────
  const latticeCount = () => {
    let n = 0;
    for (const s of surfaces.values()) if (s.lattice) n++;
    return n;
  };
  /** Turn queued wakes into lattices (capped), and apply their impulses. */
  const drainWakes = () => {
    if (wakeQueue.size === 0) return;
    for (const el of wakeQueue) {
      const impulses = drainLatticeImpulses(el);
      const drive = latticeDrive(el);
      const s = surfaces.get(el as HTMLElement);
      if (!s?.canvas || !s.visible || s.still || budget.lattices <= 0) continue;
      if (!s.lattice) {
        if (!drive && impulses.length === 0) continue;
        if (latticeCount() >= budget.lattices) continue;
        s.lattice = createLattice({
          w: s.width,
          h: s.height,
          bevel: bevelFor(s.width, s.height, s.radius),
          amplitude: latticeAmplitude(s.width, s.height),
        });
        s.latticeInput = null;
      }
      for (const i of impulses) impulseLattice(s.lattice, i.dx, i.dy, i.peak);
      s.latticeParked = false;
    }
    wakeQueue.clear();
  };
  /** Step a surface's lattice. Returns [render, again]. */
  const stepSurfaceLattice = (s: Surface, dt: number): [boolean, boolean] => {
    const l = s.lattice;
    if (!l) return [false, false];
    if (l.w !== Math.max(1, s.width) || l.h !== Math.max(1, s.height)) {
      dropLattice(s);
      return [true, false];
    }
    const drive = latticeDrive(s.el);
    if (drive !== s.latticeInput) {
      setLatticeInput(l, drive);
      s.latticeInput = drive;
      s.latticeParked = false;
    }
    if (s.latticeParked) return [false, false];
    if (!stepLattice(l, dt)) {
      dropLattice(s);
      return [true, false];
    }
    if (l.input) {
      let v = 0;
      for (let i = 0; i < l.vx.length; i++) v = Math.max(v, Math.hypot(l.vx[i]!, l.vy[i]!));
      if (v < LATTICE.sleepVelocity) {
        s.latticeParked = true;
        return [true, false];
      }
    }
    return [true, true];
  };

  const onPulse = (el: Element, k: number) => {
    const s = surfaces.get(el as HTMLElement);
    if (!s?.canvas || s.still || !(k > 0)) return;
    s.pulseK = Math.min(1, k);
    s.pulseAt = win.performance.now();
    requestFrame();
  };

  const frame = () => {
    raf = 0;
    if (ambientTimer) {
      win.clearTimeout(ambientTimer);
      ambientTimer = 0;
    }
    if (disposed || !renderer?.ready) return;
    const now = win.performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000 || 0.016));
    lastFrame = now;
    let again = false;

    const hz = clockHz(now);
    tickHaze(now, hz);

    if (rimWanted) {
      rimWanted = false;
      again = rimPass(now, dt);
      rimWanted = again;
    }
    pointerMoved = false;
    if (again) requestFrame();
    else scheduleAmbient(now, hz);
  };

  /** The event-driven rim: light, tilt, refraction fade, lattices, pulses. Returns whether it is still moving. */
  const rimPass = (now: number, dt: number): boolean => {
    let again = false;

    if (sceneFade !== sceneFadeTarget) {
      sceneFade = approach(sceneFade, sceneFadeTarget, 8, dt);
      markRefractionDirty();
      again = sceneFade !== sceneFadeTarget;
    }

    drainWakes();
    const lightOk = !scrolling && pointerLive && queries.fine.matches;
    // Read all geometry before any canvas/attribute writes. Interleaving these
    // phases forced synchronous layout once per slab in Firefox.
    const active = [...surfaces.values()]
      .filter((s) => s.canvas && s.visible && s.el.isConnected)
      .map((s) => ({ s, rect: s.el.getBoundingClientRect() }));
    for (const { s, rect } of active) {
      let render = s.dirty;
      const surfaceLightOk =
        lightOk && !s.el.matches(':disabled,[aria-disabled="true"],[data-disabled]');

      // Cursor light eases toward its target for this surface.
      let goal = 0;
      if (surfaceLightOk) {
        const dx = Math.max(rect.left - pointerX, 0, pointerX - rect.right);
        const dy = Math.max(rect.top - pointerY, 0, pointerY - rect.bottom);
        goal = lightTarget(Math.hypot(dx, dy));
      }
      if (s.light !== goal) {
        s.light = approach(s.light, goal, 14, dt);
        render = true;
        again = true;
      } else if (goal > 0 && pointerMoved) {
        render = true;
      }

      // Ease the material's pose through the shared frame loop. Only the shader
      // tilts; native scroll geometry, text and controls stay fixed.
      const [tx, ty] = surfaceLightOk
        ? cursorTilt(pointerX - rect.left, pointerY - rect.top, rect.width, rect.height)
        : [0, 0];
      if (s.tiltX !== tx || s.tiltY !== ty) {
        s.tiltX = approach(s.tiltX, tx, 14, dt);
        s.tiltY = approach(s.tiltY, ty, 14, dt);
        render = true;
        again = true;
      }

      // Tier L squish.
      const [squished, squishing] = stepSurfaceLattice(s, dt);
      if (squished) render = true;
      if (squishing) again = true;

      // Charge pulse.
      if (s.pulseK > 0) {
        const level = pulseLevel(s.pulseK, now - s.pulseAt);
        if (level !== s.pulse) {
          s.pulse = level;
          render = true;
        }
        if (level > 0) again = true;
        else s.pulseK = 0;
      }

      if (render) {
        drawSurface(s, rect);
        s.dirty = false;
      }
    }
    // Lattices on surfaces that scrolled out of view are dropped: their rim is not being drawn.
    for (const s of surfaces.values()) if (s.lattice && !s.visible) dropLattice(s);
    return again;
  };

  /** A rim frame (pointer, size, theme, scroll, snapshot, lattice, pulse): reads rects and redraws what changed. */
  const requestFrame = () => {
    rimWanted = true;
    if (raf || disposed || !renderer?.ready) return;
    raf = win.requestAnimationFrame(frame);
  };
  /** A frame for the ambient clock only (no rect reads unless the rim also wants one). */
  const wakeAmbient = () => {
    if (raf || disposed || !renderer?.ready) return;
    raf = win.requestAnimationFrame(frame);
  };
  const stopFrames = () => {
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    win.clearTimeout(ambientTimer);
    ambientTimer = 0;
  };

  // ── Input ─────────────────────────────────────────────────────────────────
  const onInput = () => {
    const wasIdle = clockHz(win.performance.now()) < governed.clockHz;
    lastInput = win.performance.now();
    if (wasIdle) wakeAmbient();
  };
  const onMove = (e: PointerEvent) => {
    lastInput = win.performance.now();
    if (e.pointerType === 'touch') return;
    pointerX = e.clientX;
    pointerY = e.clientY;
    pointerLive = true;
    pointerMoved = true;
    requestFrame();
  };
  const onLeave = (e: PointerEvent) => {
    if (e.relatedTarget) return;
    pointerLive = false;
    requestFrame();
  };
  const onScroll = () => {
    lastInput = win.performance.now();
    if (!scrolling) {
      scrolling = true;
      // A viewport capture cannot follow compositor scrolling. Keep the lit rim
      // attached to its DOM host, and stop displaying stale text at its edge.
      sceneFade = sceneFadeTarget = 0;
      root.removeAttribute('data-liquid-scene');
      for (const s of surfaces.values()) {
        if (refracts(s) || s.light > 0 || s.tiltX || s.tiltY) s.dirty = true;
        s.light = 0;
        s.tiltX = s.tiltY = 0;
      }
      requestFrame();
    }
    win.clearTimeout(scrollTimer);
    scrollTimer = win.setTimeout(() => {
      scrolling = false;
      requestFrame();
    }, 160);
    provider.request('scroll');
  };
  const onResize = () => {
    markAllDirty();
    sceneFade = sceneFadeTarget = 0;
    root.removeAttribute('data-liquid-scene');
    provider.request('resize');
    scheduleReconcile();
    requestFrame();
  };

  // ── Page changes ──────────────────────────────────────────────────────────
  let mutationTimer = 0;
  const checkRoute = () => {
    const next = win.location.pathname + win.location.search;
    if (next === route) return;
    route = next;
    // The picture is of the previous page: stop refracting it until a new one lands.
    sceneFade = sceneFadeTarget = 0;
    scene = null;
    markRefractionDirty();
    requestFrame();
    root.removeAttribute('data-liquid-scene');
    clearScene();
    provider.reset();
    provider.request('route');
    // A new route starts with an untouched governor (04 §3.3: never back up WITHIN a route).
    governor.reset();
    governed = governBudget(budget, governor.step);
    liveGovernorStep = 0;
    scheduleReconcile();
  };
  const tree = new win.MutationObserver((records) => {
    let content = false;
    for (const r of records) {
      r.removedNodes.forEach((n) => {
        if (n instanceof win.HTMLElement && n.matches(OWN_LAYERS)) return;
        if (!(n instanceof win.HTMLElement) || !n.isConnected) untrackTree(n);
      });
      r.addedNodes.forEach((n) => {
        // Our canvases and the other jelly layers are not content: they must not trigger a new snapshot.
        if (n instanceof win.HTMLElement && n.matches(OWN_LAYERS)) return;
        trackTree(n);
        content = true;
      });
      if (r.type === 'attributes') {
        if (r.target instanceof win.HTMLElement) trackTree(r.target);
      }
    }
    checkRoute();
    if (content) {
      // Content changed somewhere: refresh the picture once things stop changing.
      win.clearTimeout(mutationTimer);
      mutationTimer = win.setTimeout(() => provider.request('mutation'), MUTATION_SETTLE_MS);
    }
    scheduleReconcile();
  });
  const themeObserver = new win.MutationObserver(() => {
    readTheme();
    for (const s of surfaces.values()) if (s.canvas) measure(s);
    markAllDirty();
    provider.request('theme');
    scheduleReconcile();
    requestFrame();
  });
  const onVisibility = () => {
    if (!doc.hidden) {
      lastInput = win.performance.now();
      provider.request('visible');
      requestFrame();
    }
  };
  const onBlur = () => {
    pointerLive = false;
    focused = false;
    requestFrame();
  };
  const onFocus = () => {
    focused = true;
    lastInput = win.performance.now();
    wakeAmbient();
  };
  const onPreference = () => scheduleReconcile();
  const onEnv = () => {
    readEnv();
    scheduleReconcile();
    requestFrame();
  };

  // ── Install ───────────────────────────────────────────────────────────────
  readTheme();
  trackTree(doc.body);
  tree.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-liquid-glass', 'data-liquid-material', 'data-evert', 'data-jelly'],
  });
  themeObserver.observe(root, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  Object.values(queries).forEach((q) => q.addEventListener('change', onPreference));
  doc.addEventListener('pointermove', onMove, { passive: true });
  doc.addEventListener('pointerout', onLeave, { passive: true });
  doc.addEventListener('scroll', onScroll, { passive: true, capture: true });
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('resize', onResize, { passive: true });
  win.addEventListener('popstate', checkRoute);
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocus);
  doc.addEventListener('keydown', onInput, { passive: true, capture: true });
  doc.addEventListener('pointerdown', onInput, { passive: true, capture: true });
  doc.addEventListener('wheel', onInput, { passive: true, capture: true });
  const unsubscribe = [
    onJellyEnvChange(onEnv, doc),
    onLatticeWake((el) => {
      wakeQueue.add(el);
      requestFrame();
    }),
    jellyBus.on('arc:strike', (p) => onPulse(p.el, Math.min(1, p.energy))),
    jellyBus.on('body:release', (p) => onPulse(p.el, Math.min(1, p.energy * RELEASE_PULSE))),
  ];
  pulseSinks.add(onPulse);
  scheduleReconcile();

  return () => {
    disposed = true;
    stopFrames();
    for (const u of unsubscribe) u();
    unRegistry();
    pulseSinks.delete(onPulse);
    liveGovernorStep = 0;
    wakeQueue.clear();
    win.removeEventListener('focus', onFocus);
    doc.removeEventListener('keydown', onInput, true);
    doc.removeEventListener('pointerdown', onInput, true);
    doc.removeEventListener('wheel', onInput, true);
    win.clearTimeout(mutationTimer);
    win.clearTimeout(scrollTimer);
    tree.disconnect();
    themeObserver.disconnect();
    visibility.disconnect();
    sizes.disconnect();
    Object.values(queries).forEach((q) => q.removeEventListener('change', onPreference));
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerout', onLeave);
    doc.removeEventListener('scroll', onScroll, true);
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('resize', onResize);
    win.removeEventListener('popstate', checkRoute);
    win.removeEventListener('blur', onBlur);
    for (const s of surfaces.values()) deactivate(s);
    surfaces.clear();
    provider.dispose();
    clearScene();
    root.removeAttribute('data-liquid-scene');
    renderer?.dispose();
    renderer = null;
  };
}
