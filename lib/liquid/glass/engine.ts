/**
 * The liquid glass engine: one document service that turns the site's glass roles into shader-drawn slabs.
 *
 * Eligible surfaces (`.glass-pane`, `.glass-chrome`, `.glass-overlay`, the app tier's `.app-glass`, `[data-liquid-glass]`) get a canvas as their
 * LAST child, painted behind their content (`z-index: -1` inside an isolated stacking context, `app/liquid-glass.css`).
 * One shared `GlassRenderer` draws every surface into its own canvas. The canvas is transparent inside the bevel and
 * opaque (the refracted page) on it, so the live DOM is what you see through the middle and the glass is what you see
 * at the edge. See `shader.ts` for the optics and `scene.ts` for the picture the rim refracts.
 *
 * ## What runs when
 *
 * Nothing runs at rest. There is no permanent frame loop: a frame is requested only while something is moving — the
 * cursor light easing toward a surface or away from it, a tap's ripple crossing it, the refracted rim fading in after
 * a new snapshot — or once, for a surface whose size, theme, tint, snapshot or (if it is anchored to the viewport) scroll
 * position changed. The loop is the one `requestAnimationFrame` here, allow-listed in `raf-loop-allowlist.test.ts`.
 *
 * ## What it never does
 *
 * - Touch layout: it reads rects in observer callbacks and frames, and writes only canvases and attributes.
 * - Move or animate a host element: taps ripple the SURFACE OF THE GLASS, not the text on it (the DOM push that used to
 *   rotate surfaces is a separate, translate-only service — `runtime.ts`).
 * - Depend on `backdrop-filter`, WebGL extensions, or `fwidth`: the look is the same in Chromium, WebKit and Gecko.
 * - Draw when it must not: reduced transparency, forced colours, high contrast, `perf-lite` and print all remove every
 *   canvas and leave the CSS material, which is the fallback tier and is always complete without this file.
 */
import { luminance, resolveColor, type RGBA } from './color';
import {
  RIPPLE_REACH,
  admit,
  approach,
  bevelFor,
  dprFor,
  innerRadius,
  lightTarget,
  rippleAmplitude,
  sceneCoverage,
  thicknessFor,
  type GlassRole,
} from './policy';
import { GlassRenderer, RIPPLE_SHAPE, GLASS_RIPPLES, type GlassDraw } from './renderer';
import { createSceneProvider, type SceneProvider, type SceneShot } from './scene';
import { clearScene, publishScene } from './scene-store';

const SELECTOR = '.glass-pane,.glass-chrome,.glass-overlay,.app-glass,[data-liquid-glass]';
const EXCLUDE =
  '[data-liquid-material="off"],[data-liquid-glass="off"],.glass-chrome--aside,.radial-globe__stage,.eversion-overlay,.evert-ghost';
const TAP_EXCLUDE =
  'input,textarea,select,[contenteditable="true"],[data-liquid-motion="off"],[disabled],[aria-disabled="true"]';
const LIGHT_HEIGHT = 96;
/**
 * How far past a surface's own edge the rim may read the snapshot, px. Refraction samples INWARD from the edge, so the
 * region read is the surface itself plus the dispersion spread; a surface flush with the viewport edge (a sticky header
 * at the top) is fully covered and must not be faded as if it read past the picture.
 */
const SCENE_EDGE_MARGIN = 3;
const MUTATION_SETTLE_MS = 1600;

interface Ripple {
  x: number;
  y: number;
  at: number;
  amp: number;
}

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
  lastTop: number;
  lastLeft: number;
  light: number;
  ripples: Ripple[];
}

/**
 * Which surfaces bend the page behind them. Floating glass does: its own subtree is hidden from the snapshot, so
 * what its rim shows really is what is behind it. A pane does not by default: it is a CONTENT block, its own text is
 * in the snapshot, and refracting that would draw the same words twice, live and bent, wherever they start inside the
 * bevel. A pane that sits over imagery (and has no text near its rim) can opt in with `data-liquid-glass="refract"`.
 * Every surface, refracting or not, still gets the full lit slab: bevel shading, Fresnel, specular, cursor light and
 * ripples.
 */
const refracts = (s: Surface): boolean =>
  s.role === 'chrome' ||
  s.role === 'overlay' ||
  s.el.getAttribute('data-liquid-glass') === 'refract';

const roleOf = (el: Element): GlassRole =>
  el.classList.contains('glass-overlay')
    ? 'overlay'
    : el.classList.contains('glass-chrome')
      ? 'chrome'
      : el.classList.contains('glass-pane') || el.classList.contains('app-glass')
        ? 'pane'
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
    motion: win.matchMedia('(prefers-reduced-motion: reduce)'),
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
  let scrollDirty = false;
  let pointerMoved = false;
  const rippleBuffer = new Float32Array(GLASS_RIPPLES * 4);

  const off = () =>
    queries.transparency.matches ||
    queries.forced.matches ||
    queries.print.matches ||
    root.matches('.reduce-transparency,.style-high-contrast,.perf-lite') ||
    !!doc.querySelector('.app-high-contrast');
  const motionOk = () => !queries.motion.matches && !root.matches('.reduce-motion');
  // While the hub is open the page behind it is blurred and covered, and the picture taken BEFORE it opened is the one
  // the globe is refracting; a new one now would be of the wrong thing.
  const hubOpen = () => !!doc.querySelector('.radial-hub:not([data-phase="closed"])');
  const sceneAllowed = () => !lowEnd && !doc.hidden && !off() && !hubOpen();

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
      markAllDirty();
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
      lastTop: NaN,
      lastLeft: NaN,
      light: 0,
      ripples: [],
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

  const measure = (s: Surface) => {
    const style = win.getComputedStyle(s.el);
    s.width = s.el.clientWidth;
    s.height = s.el.clientHeight;
    const border = parseFloat(style.borderTopWidth) || 0;
    s.radius = innerRadius(style.borderTopLeftRadius, border, s.width, s.height);
    s.tint = resolveColor(style.backgroundColor, [1, 1, 1, 0], doc);
    if (style.position === 'static') s.el.setAttribute('data-liquid-static', '');
    else s.el.removeAttribute('data-liquid-static');
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
    s.el.setAttribute('data-liquid-canvas', 'on');
    s.el.append(canvas);
    s.dirty = true;
    if (!scene) provider.request('activate');
  };
  const deactivate = (s: Surface) => {
    if (!s.canvas) return;
    s.canvas.remove();
    s.canvas = null;
    s.el.removeAttribute('data-liquid-canvas');
    s.el.removeAttribute('data-liquid-static');
    s.ripples.length = 0;
    s.light = 0;
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
      ).map((c) => c.s),
    );
    for (const s of surfaces.values()) {
      if (!want.has(s)) deactivate(s);
    }
    for (const s of want) activate(s);
    requestFrame();
  };

  // ── Drawing ───────────────────────────────────────────────────────────────
  const drawSurface = (s: Surface, now: number): boolean => {
    const r = renderer;
    if (!r?.ready || !s.canvas || !s.el.isConnected) return false;
    const rect = s.el.getBoundingClientRect();
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
    const ripples = rippleBuffer;
    ripples.fill(0);
    for (let i = 0; i < GLASS_RIPPLES; i++) ripples[i * 4 + 2] = -1;
    let n = 0;
    for (const rp of s.ripples) {
      const age = (now - rp.at) / 1000;
      if (age < 0 || age >= RIPPLE_SHAPE.life || n >= GLASS_RIPPLES) continue;
      ripples[n * 4] = rp.x;
      ripples[n * 4 + 1] = rp.y;
      ripples[n * 4 + 2] = age;
      ripples[n * 4 + 3] = rp.amp;
      n++;
    }

    const o: GlassDraw = {
      width: w,
      height: h,
      dpr,
      radius: s.radius,
      bezel,
      thickness,
      disperse: 0.07,
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
      ripples,
      press: 0,
    };
    return r.draw(o, s.canvas);
  };

  const frame = () => {
    raf = 0;
    if (disposed || !renderer?.ready) return;
    const now = win.performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000 || 0.016));
    lastFrame = now;
    let again = false;

    if (sceneFade !== sceneFadeTarget) {
      sceneFade = approach(sceneFade, sceneFadeTarget, 8, dt);
      markAllDirty();
      again = sceneFade !== sceneFadeTarget;
    }

    const lightOk = pointerLive && queries.fine.matches && motionOk();
    for (const s of surfaces.values()) {
      if (!s.canvas || !s.visible) continue;
      let render = s.dirty;

      if (scrollDirty) {
        // A surface pinned to the viewport sees different page behind it every time the page scrolls; one that scrolls
        // with the page does not (the picture moves with it).
        const rect = s.el.getBoundingClientRect();
        if (Math.abs(rect.top - s.lastTop) < 0.5 && Math.abs(rect.left - s.lastLeft) < 0.5)
          render = true;
        s.lastTop = rect.top;
        s.lastLeft = rect.left;
      }

      // Cursor light eases toward its target for this surface.
      let goal = 0;
      if (lightOk) {
        const rect = s.el.getBoundingClientRect();
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

      // Ripples live for a fixed time; drop the dead ones and keep drawing while any is alive.
      if (s.ripples.length) {
        s.ripples = s.ripples.filter((rp) => now - rp.at < RIPPLE_SHAPE.life * 1000);
        render = true;
        if (s.ripples.length) again = true;
      }

      if (render) {
        drawSurface(s, now);
        s.dirty = false;
      }
    }
    scrollDirty = false;
    pointerMoved = false;
    if (again) requestFrame();
  };

  const requestFrame = () => {
    if (raf || disposed || !renderer?.ready) return;
    raf = win.requestAnimationFrame(frame);
  };
  const stopFrames = () => {
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
  };

  // ── Input ─────────────────────────────────────────────────────────────────
  const onMove = (e: PointerEvent) => {
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
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary || off() || !motionOk()) return;
    const target = e.target instanceof win.Element ? e.target : null;
    if (!target || target.closest(TAP_EXCLUDE)) return;
    const now = win.performance.now();
    let any = false;
    for (const s of surfaces.values()) {
      if (!s.canvas || !s.visible) continue;
      const rect = s.el.getBoundingClientRect();
      const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      const amp = rippleAmplitude(Math.hypot(dx, dy), e.pointerType === 'touch' ? 0.8 : 1);
      if (amp < 0.03 || Math.hypot(dx, dy) >= RIPPLE_REACH) continue;
      s.ripples.push({
        x: e.clientX - (rect.left + s.el.clientLeft),
        y: e.clientY - (rect.top + s.el.clientTop),
        at: now,
        amp,
      });
      if (s.ripples.length > GLASS_RIPPLES) s.ripples.shift();
      any = true;
    }
    if (any) requestFrame();
  };
  const onScroll = () => {
    scrollDirty = true;
    requestFrame();
    provider.request('scroll');
    // Far enough from where the picture was taken that it no longer describes what is behind the surface.
    if (scene && Math.abs(win.scrollY - scene.scrollY) > win.innerHeight * 0.7) {
      sceneFadeTarget = 0;
    }
  };
  const onResize = () => {
    markAllDirty();
    if (scene) sceneFadeTarget = 0;
    provider.request('resize');
    scheduleReconcile();
  };

  // ── Page changes ──────────────────────────────────────────────────────────
  let mutationTimer = 0;
  const checkRoute = () => {
    const next = win.location.pathname + win.location.search;
    if (next === route) return;
    route = next;
    // The picture is of the previous page: stop refracting it until a new one lands.
    sceneFadeTarget = 0;
    root.removeAttribute('data-liquid-scene');
    clearScene();
    provider.reset();
    provider.request('route');
  };
  const tree = new win.MutationObserver((records) => {
    let content = false;
    for (const r of records) {
      r.removedNodes.forEach((n) => {
        if (!(n instanceof win.HTMLElement) || !n.isConnected) untrackTree(n);
      });
      r.addedNodes.forEach((n) => {
        if (n instanceof win.HTMLElement && n.hasAttribute('data-liquid-glass')) return;
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
      provider.request('visible');
      requestFrame();
    }
  };
  const onPreference = () => scheduleReconcile();

  // ── Install ───────────────────────────────────────────────────────────────
  readTheme();
  trackTree(doc.body);
  tree.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-liquid-glass', 'data-liquid-material'],
  });
  themeObserver.observe(root, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  Object.values(queries).forEach((q) => q.addEventListener('change', onPreference));
  doc.addEventListener('pointermove', onMove, { passive: true });
  doc.addEventListener('pointerdown', onDown, { passive: true, capture: true });
  doc.addEventListener('pointerout', onLeave, { passive: true });
  doc.addEventListener('scroll', onScroll, { passive: true, capture: true });
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('resize', onResize, { passive: true });
  win.addEventListener('popstate', checkRoute);
  win.addEventListener('blur', () => {
    pointerLive = false;
  });
  scheduleReconcile();

  return () => {
    disposed = true;
    stopFrames();
    win.clearTimeout(mutationTimer);
    tree.disconnect();
    themeObserver.disconnect();
    visibility.disconnect();
    sizes.disconnect();
    Object.values(queries).forEach((q) => q.removeEventListener('change', onPreference));
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerdown', onDown, true);
    doc.removeEventListener('pointerout', onLeave);
    doc.removeEventListener('scroll', onScroll, true);
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('resize', onResize);
    win.removeEventListener('popstate', checkRoute);
    for (const s of surfaces.values()) deactivate(s);
    surfaces.clear();
    provider.dispose();
    clearScene();
    root.removeAttribute('data-liquid-scene');
    renderer?.dispose();
    renderer = null;
  };
}
