/**
 * Shared cursor lighting for surfaces outside the shader budget. Only a
 * decorative leaf moves; this module never translates or animates surface hosts
 * (the bounded soft-body motion is `lib/jelly/physics.ts`'s job). Shader-backed
 * surfaces own their lighting. Clicks and taps never emit waves.
 *
 * Frames come from the one jelly frame driver (`lib/jelly/frame.ts`) and pointer input from the one jelly pointer hub
 * (`lib/jelly/pointer.ts`): this module owns no animation-frame loop and no pointer listeners of its own. The light is
 * an input-driven one-shot: each pointer move wakes the driver for a single paint.
 */
import { drive } from '@/lib/jelly/frame';
import { onJellyPointer } from '@/lib/jelly/pointer';
import { DEGRADED_ROOT_SELECTOR, OPT_OUT_SELECTOR } from '@/lib/jelly/tiers';

const SURFACES =
  '.glass-fill,.glass-pane,.glass-chrome,.glass-overlay,.glass-interactive,.app-glass,[data-evert],[data-liquid-surface],.app-theme [class~="bg-(--app-surface)"]';
/** The shared jelly opt-outs (`lib/jelly/tiers.ts`) plus what never takes a light: layers, fields, disabled controls. */
const EXCLUDE = `${OPT_OUT_SELECTOR},.eversion-overlay,.evert-ghost,.radial-globe__stage,canvas,input,textarea,select,[contenteditable="true"],[disabled],[aria-disabled="true"]`;
export function installLiquidInteractions(doc: Document = document): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};
  const root = doc.documentElement;
  const queries = [
    win.matchMedia('(prefers-reduced-transparency: reduce)'),
    win.matchMedia('(forced-colors: active)'),
  ];
  const fine = win.matchMedia('(hover: hover) and (pointer: fine)');
  let appContrast = !!doc.querySelector('.app-high-contrast');
  /** A paint is pending on the next driver frame. */
  let lightPending = false;
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
    root.matches(DEGRADED_ROOT_SELECTOR) ||
    appContrast;

  const clearLight = (smooth = false) => {
    lightPending = false;
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
    if (!lightPending) return;
    lightPending = false;
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
    if (!lightPending) {
      lightPending = true;
      lightDriver.wake();
    }
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
  // One paint per wake; never stays awake on its own. Order 25: after the engine (20), before arcs (30).
  const lightDriver = drive(
    () => {
      paintLight();
      return false;
    },
    { order: 25 },
    win as Window & typeof globalThis,
  );
  const unPointer = [
    onJellyPointer('pointermove', onMove, win),
    onJellyPointer('pointercancel', clear, win),
    onJellyPointer('pointerout', onOut, win),
  ];
  function onOut(event: PointerEvent) {
    if (!event.relatedTarget) clearLight(true);
  }
  doc.addEventListener('visibilitychange', clear);
  doc.addEventListener('scroll', invalidate, { passive: true, capture: true });
  win.addEventListener('resize', invalidate, { passive: true });
  win.addEventListener('blur', clear);
  return () => {
    clear();
    lightDriver.stop();
    for (const u of unPointer) u();
    observer.disconnect();
    queries.forEach((q) => q.removeEventListener('change', preferenceChange));
    fine.removeEventListener('change', fineChange);
    doc.removeEventListener('visibilitychange', clear);
    doc.removeEventListener('scroll', invalidate, true);
    win.removeEventListener('resize', invalidate);
    win.removeEventListener('blur', clear);
  };
}
