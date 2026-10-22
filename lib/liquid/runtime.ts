/**
 * Shared cursor lighting for surfaces outside the shader budget. Only a
 * decorative leaf moves; clicks never translate or animate surface hosts.
 * Shader-backed surfaces own their lighting and optical tap ripples.
 */
const SURFACES =
  '.glass-fill,.glass-pane,.glass-chrome,.glass-overlay,.glass-interactive,.app-glass,[data-evert],[data-liquid-surface],.app-theme [class~="bg-(--app-surface)"]';
const EXCLUDE =
  '[data-liquid-motion="off"],[data-fluid-press="none"],[data-fluid-press="off"],.eversion-overlay,.evert-ghost,.radial-globe__stage,canvas,input,textarea,select,[contenteditable="true"],[disabled],[aria-disabled="true"]';
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
  let lightRaf = 0;
  let lightHost: HTMLElement | null = null;
  let light: HTMLSpanElement | null = null;
  let beam: HTMLSpanElement | null = null;
  const fadingLights = new Set<HTMLElement>();
  let pointerX = 0;
  let pointerY = 0;
  let lightBounds: DOMRect | null = null;

  const disabled = () =>
    doc.hidden ||
    queries.some((q) => q.matches) ||
    root.matches('.reduce-motion,.reduce-transparency,.style-high-contrast,.perf-lite') ||
    appContrast;

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
  const clear = () => clearLight();
  const targetElement = (event: Event) =>
    event.target instanceof win.Element ? event.target : null;

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
    // The cursor is viewport-relative; a cached beam must not travel with the
    // old host position during native scrolling. The next pointer move relights it.
    clearLight(true);
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
  doc.addEventListener('pointermove', onMove, { passive: true });
  doc.addEventListener('pointercancel', clear, { passive: true });
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
    queries.forEach((q) => q.removeEventListener('change', preferenceChange));
    fine.removeEventListener('change', fineChange);
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointercancel', clear);
    doc.removeEventListener('pointerout', onOut);
    doc.removeEventListener('visibilitychange', clear);
    doc.removeEventListener('scroll', invalidate, true);
    win.removeEventListener('resize', invalidate);
    win.removeEventListener('blur', clear);
  };
}
