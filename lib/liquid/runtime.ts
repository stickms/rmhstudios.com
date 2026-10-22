/**
 * One document interaction field. No observer per card, capture loop, shader
 * context or React update. Bounds are read only on input; finite additive native animations own
 * surface motion, and the light updates one leaf carrier.
 */
import { LIQUID_FIELD, distanceToSurface, liquidWave, liquidRecovery } from './interaction';

const SURFACES =
  '.glass-fill,.glass-pane,.glass-chrome,.glass-overlay,.glass-interactive,.app-glass,[data-liquid-surface],.app-theme [class~="bg-(--app-surface)"]';
const EXCLUDE =
  '[data-liquid-motion="off"],[data-fluid-press="none"],[data-fluid-press="off"],.eversion-overlay,.evert-ghost,.radial-globe__stage,canvas,input,textarea,select,[contenteditable="true"],[disabled],[aria-disabled="true"]';
interface Pulse {
  x: number;
  y: number;
  distance: number;
  at: number;
  strength: number;
}
interface Body {
  el: HTMLElement;
  pulses: Pulse[];
  animation?: Animation;
  planAt?: number;
  recovery?: { at: number; x: number; y: number; vx: number; vy: number; ax: number; ay: number };
}

export function installLiquidInteractions(doc: Document = document): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};
  const root = doc.documentElement;
  const queries = [
    win.matchMedia('(prefers-reduced-motion: reduce)'),
    win.matchMedia('(prefers-reduced-transparency: reduce)'),
    win.matchMedia('(forced-colors: active)'),
  ];
  const fine = win.matchMedia('(hover: hover) and (pointer: fine)');
  let appContrast = !!doc.querySelector('.app-high-contrast');
  const active = new Map<HTMLElement, Body>();
  const visible = new Set<HTMLElement>();
  const registered = new Set<HTMLElement>();
  const visibility = new win.IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      if (entry.isIntersecting) visible.add(el);
      else visible.delete(el);
    }
  });
  const unregister = (el: HTMLElement) => {
    visibility.unobserve(el);
    registered.delete(el);
    visible.delete(el);
    active.get(el)?.animation?.cancel();
    active.delete(el);
  };
  const registerTree = (node: Node, remove = false) => {
    if (!(node instanceof win.HTMLElement)) return;
    if (remove) {
      for (const el of registered) {
        if (node === el || node.contains(el)) {
          unregister(el);
        }
      }
      return;
    }
    const elements = [node, ...node.querySelectorAll<HTMLElement>(SURFACES)];
    for (const el of elements) {
      if (!el.matches(SURFACES)) {
        unregister(el);
      } else if (!registered.has(el)) {
        registered.add(el);
        visibility.observe(el);
      }
    }
  };
  registerTree(doc.body);
  let lightRaf = 0;
  let lightHost: HTMLElement | null = null;
  let light: HTMLSpanElement | null = null;
  let beam: HTMLSpanElement | null = null;
  const fadingLights = new Set<HTMLElement>();
  let pointerX = 0;
  let pointerY = 0;
  let lightBounds: DOMRect | null = null;
  let gesture: { id: number; x: number; y: number } | null = null;

  const disabled = () =>
    doc.hidden ||
    queries.some((q) => q.matches) ||
    root.matches('.reduce-motion,.reduce-transparency,.style-high-contrast,.perf-lite') ||
    appContrast;

  const restore = (body: Body) => {
    body.animation?.cancel();
  };
  const clearLight = (smooth = false) => {
    win.cancelAnimationFrame(lightRaf);
    lightRaf = 0;
    if (smooth && !light && !disabled()) return;
    for (const retiring of fadingLights) {
      retiring.getAnimations().forEach((a) => a.cancel());
      retiring.remove();
    }
    fadingLights.clear();
    const previous = light;
    if (smooth && previous?.isConnected && !disabled()) {
      const opacity = win.getComputedStyle(previous).opacity;
      previous.getAnimations().forEach((a) => a.cancel());
      const fade = previous.animate([{ opacity }, { opacity: 0 }], {
        duration: 100,
        easing: 'ease-out',
        fill: 'forwards',
      });
      fadingLights.add(previous);
      const finish = () => {
        previous.remove();
        fadingLights.delete(previous);
      };
      void fade.finished.then(finish, finish);
    } else previous?.remove();
    lightHost = light = beam = null;
    lightBounds = null;
  };
  const clearBodies = (smooth = false) => {
    if (smooth && !disabled()) {
      for (const body of active.values()) {
        if (!body.pulses.length) continue;
        const at =
          (body.planAt ?? win.performance.now()) +
          (typeof body.animation?.currentTime === 'number' ? body.animation.currentTime : 0);
        const b = sample(body, at - 1),
          c = sample(body, at),
          a = sample(body, at + 1);
        const now = win.performance.now();
        body.pulses.length = 0;
        body.recovery = {
          at: now,
          x: c[0],
          y: c[1],
          vx: (a[0] - b[0]) * 500,
          vy: (a[1] - b[1]) * 500,
          ax: (a[0] - 2 * c[0] + b[0]) * 1e6,
          ay: (a[1] - 2 * c[1] + b[1]) * 1e6,
        };
        animate(body, now);
      }
      return;
    }
    active.forEach(restore);
    active.clear();
  };
  const clear = () => {
    clearBodies();
    clearLight();
    gesture = null;
  };

  // Sample the finite wave once per input, then let the browser's native
  // animation engine composite it. No JS frame loop is needed for neighbours.
  const sample = (body: Body, at: number): [number, number] => {
    let x = 0,
      y = 0;
    for (const p of body.pulses) {
      const wave =
        liquidWave((at - p.at) / 1000, p.distance, p.strength) * LIQUID_FIELD.displacement;
      x += p.x * wave;
      y += p.y * wave;
    }
    const r = body.recovery;
    if (r) {
      x += liquidRecovery((at - r.at) / 1000, r.x, r.vx, r.ax);
      y += liquidRecovery((at - r.at) / 1000, r.y, r.vy, r.ay);
    }
    return [x, y];
  };
  const animate = (body: Body, now: number) => {
    body.pulses = body.pulses.filter(
      (p) => now < p.at + (LIQUID_FIELD.lifetime + p.distance / LIQUID_FIELD.speed) * 1000,
    );
    const end = Math.max(
      body.recovery ? body.recovery.at + LIQUID_FIELD.recovery * 1000 : now,
      ...body.pulses.map(
        (p) => p.at + (LIQUID_FIELD.lifetime + p.distance / LIQUID_FIELD.speed) * 1000,
      ),
    );
    const duration = Math.max(1, end - now);
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 96; i++) {
      const at = now + (duration * i) / 96;
      const [x, y] = sample(body, at);
      frames.push({
        offset: i / 96,
        // Translate only, and bounded to the same ±6px as before. Rotating a surface rotates its TEXT, which every engine
        // re-rasterises (and Gecko snaps to the pixel grid again when the animation ends), and that reads as shimmer.
        // The model above stays LINEAR on purpose: retargeting folds old waves into a recovery by subtraction, which
        // only reproduces the pose if the sum is linear, so the clamp lives here, at display, and is rarely reached.
        transform: `translate3d(${Math.max(-6, Math.min(6, x)).toFixed(3)}px, ${Math.max(-6, Math.min(6, y)).toFixed(3)}px, 0)`,
      });
    }
    body.animation?.cancel();
    const animation = body.el.animate(frames, { duration, easing: 'linear', composite: 'add' });
    // Anchor the effect to this timeline sample so a pending first paint cannot
    // shift its phase away from the input plan during rapid retargeting.
    if (typeof doc.timeline.currentTime === 'number')
      animation.startTime = doc.timeline.currentTime;
    body.animation = animation;
    body.planAt = now;
    void animation.finished
      .then(() => {
        if (body.animation !== animation) return;
        restore(body);
        active.delete(body.el);
      })
      .catch(() => {
        /* Cancellation is expected on scroll, retarget or teardown. */
      });
  };

  const targetElement = (event: Event) =>
    event.target instanceof win.Element ? event.target : null;
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || disabled()) return;
    const target = targetElement(event);
    if (!target || target.closest(EXCLUDE)) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    const x = event.clientX;
    const y = event.clientY;
    // READ phase. One shared visibility observer follows virtualised feeds and
    // route changes, so offscreen cards incur no per-input layout reads.
    // The first input can precede the initial asynchronous observer delivery.
    const candidates = Array.from(visible.size ? visible : registered)
      .slice(0, 128)
      .filter((el) => !el.closest(EXCLUDE) && !el.matches(':is(button,a,[role="button"]):active'))
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(
        ({ rect: r }) =>
          r.width >= 24 &&
          r.height >= 20 &&
          r.bottom > 0 &&
          r.right > 0 &&
          r.top < win.innerHeight &&
          r.left < win.innerWidth &&
          r.width * r.height < win.innerWidth * win.innerHeight * 0.5,
      )
      .map((item) => ({ ...item, distance: distanceToSurface(x, y, item.rect) }))
      .filter((item) => item.distance < LIQUID_FIELD.radius)
      .sort(
        (a, b) =>
          a.distance - b.distance || a.rect.width * a.rect.height - b.rect.width * b.rect.height,
      );
    const selected: typeof candidates = [];
    for (const item of candidates) {
      if (selected.length >= LIQUID_FIELD.maxSurfaces) break;
      if (selected.some((s) => s.el.contains(item.el) || item.el.contains(s.el))) continue;
      // A transform on a fixed/sticky ancestor can re-anchor its descendants;
      // existing independent transforms also belong to their component.
      const style = win.getComputedStyle(item.el);
      if (
        style.position === 'fixed' ||
        style.position === 'sticky' ||
        style.display === 'none' ||
        style.visibility !== 'visible' ||
        (!active.has(item.el) && (style.translate !== 'none' || style.rotate !== 'none'))
      )
        continue;
      selected.push(item);
    }
    const at = win.performance.now();
    // WRITE phase; selection remains capped even during overlapping impulses.
    for (const { el, rect, distance } of selected) {
      let body = active.get(el);
      if (body?.animation) {
        // Retarget from the renderer's current phase, including a pending first
        // frame, rather than from an assumed wall-clock animation start.
        const phase =
          typeof body.animation.currentTime === 'number' ? body.animation.currentTime : 0;
        const shift = at - ((body.planAt ?? at) + phase);
        for (const pulse of body.pulses) pulse.at += shift;
        if (body.recovery) body.recovery.at += shift;
      }
      if (!body) {
        if (active.size >= LIQUID_FIELD.maxSurfaces) continue;
        body = {
          el,
          pulses: [],
        };
        active.set(el, body);
        // Native animations own promotion. Forcing a layer for every neighbour
        // would retain unnecessary textures after short interactions.
      }
      const dx = rect.left + rect.width / 2 - x;
      const dy = rect.top + rect.height / 2 - y;
      const length = Math.hypot(dx, dy) || 1;
      if (body.pulses.length >= 3) {
        // Fold the oldest wave into a finite C2 recovery. Bounded history must
        // never produce a visible snap when a fourth tap interrupts motion.
        const h = 1;
        const before = sample(body, at - h),
          current = sample(body, at),
          after = sample(body, at + h);
        body.pulses.shift();
        body.recovery = undefined;
        const b = sample(body, at - h),
          c = sample(body, at),
          a = sample(body, at + h);
        const x = current[0] - c[0],
          y = current[1] - c[1];
        body.recovery = {
          at,
          x,
          y,
          vx: (after[0] - a[0] - (before[0] - b[0])) * 500,
          vy: (after[1] - a[1] - (before[1] - b[1])) * 500,
          ax: (after[0] - a[0] - 2 * x + (before[0] - b[0])) * 1e6,
          ay: (after[1] - a[1] - 2 * y + (before[1] - b[1])) * 1e6,
        };
      }
      body.pulses.push({
        x: dx / length,
        y: dy / length,
        at,
        distance,
        strength: event.pointerType === 'touch' ? 0.8 : 1,
      });
      animate(body, at);
    }
  };

  const paintLight = () => {
    lightRaf = 0;
    if (disabled() || !fine.matches || !lightHost?.isConnected) {
      clearLight(true);
      return;
    }
    // A scroll invalidates the cached rect; ordinary pointer frames read none.
    lightBounds ??= lightHost.getBoundingClientRect();
    if (beam)
      beam.style.transform = `translate3d(${(pointerX - lightBounds.left - 90).toFixed(1)}px,${(pointerY - lightBounds.top - 90).toFixed(1)}px,0)`;
  };
  const onMove = (event: PointerEvent) => {
    if (
      gesture &&
      gesture.id === event.pointerId &&
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10
    ) {
      clearBodies(true);
      gesture = null;
    }
    if (event.pointerType !== 'mouse' || !fine.matches || disabled()) {
      clearLight(true);
      return;
    }
    const target = targetElement(event);
    const host = target?.closest<HTMLElement>(SURFACES) ?? null;
    if (
      !host ||
      // The glass engine lights these in the shader; a CSS carrier on top would be a second, DOM-churning light.
      host.matches('[data-liquid-canvas]') ||
      host.closest(EXCLUDE) ||
      host.matches('input,textarea,select') ||
      (host !== lightHost && win.getComputedStyle(host).position === 'static')
    ) {
      clearLight(true);
      return;
    }
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (host !== lightHost || !light?.isConnected) {
      const bounds = host.getBoundingClientRect();
      clearLight(true);
      lightHost = host;
      lightBounds = bounds;
      light = doc.createElement('span');
      light.className = 'liquid-light';
      light.setAttribute('aria-hidden', 'true');
      beam = doc.createElement('span');
      light.append(beam);
      host.append(light);
      light.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, easing: 'ease-out' });
    }
    if (!lightRaf) lightRaf = win.requestAnimationFrame(paintLight);
  };
  const invalidate = () => {
    lightBounds = null;
    clearBodies(true);
  };
  const cancelGesture = () => {
    clearBodies(true);
    clearLight();
    gesture = null;
  };
  const onUp = () => {
    gesture = null;
  };
  const preferenceChange = () => {
    if (disabled()) clear();
  };
  const observer = new win.MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.type === 'childList' ||
          (record.target instanceof win.HTMLElement && record.target.matches('.app-theme')),
      )
    ) {
      appContrast = !!doc.querySelector('.app-high-contrast');
    }
    preferenceChange();
    if (lightHost && !lightHost.isConnected) clearLight();
    for (const record of records) {
      for (const node of record.removedNodes) registerTree(node, true);
      for (const node of record.addedNodes) registerTree(node);
      if (record.type === 'attributes' && record.target !== root) registerTree(record.target);
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  queries.forEach((q) => q.addEventListener('change', preferenceChange));
  const fineChange = () => clearLight();
  fine.addEventListener('change', fineChange);
  doc.addEventListener('pointerdown', onDown, { passive: true, capture: true });
  doc.addEventListener('pointermove', onMove, { passive: true });
  doc.addEventListener('pointerup', onUp, { passive: true });
  doc.addEventListener('pointercancel', cancelGesture, { passive: true });
  doc.addEventListener('pointerout', onOut, { passive: true });
  function onOut(event: PointerEvent) {
    if (!event.relatedTarget) clearLight(true);
  }
  doc.addEventListener('visibilitychange', clear);
  doc.addEventListener('scroll', invalidate, { passive: true, capture: true });
  win.addEventListener('resize', invalidate, { passive: true });
  win.addEventListener('blur', clear);
  return () => {
    clear();
    observer.disconnect();
    visibility.disconnect();
    registered.clear();
    visible.clear();
    queries.forEach((q) => q.removeEventListener('change', preferenceChange));
    fine.removeEventListener('change', fineChange);
    doc.removeEventListener('pointerdown', onDown, true);
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onUp);
    doc.removeEventListener('pointercancel', cancelGesture);
    doc.removeEventListener('pointerout', onOut);
    doc.removeEventListener('visibilitychange', clear);
    doc.removeEventListener('scroll', invalidate, true);
    win.removeEventListener('resize', invalidate);
    win.removeEventListener('blur', clear);
  };
}
