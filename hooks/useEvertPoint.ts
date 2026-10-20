'use client';

/**
 * Where a control turns inside out from — the input half of the eversion state layer (globals.css §7.3).
 *
 * Every control carrying `data-evert` changes state by turning a tint out of itself: a circle clipped from one
 * point that sweeps to the far corner on a spring. CSS draws all of it; this tells the CSS which point, and when a
 * press is down:
 *
 * - `--evert-x` / `--evert-y`: the point, in px from the control's top-left corner.
 * - `--evert-r`: the distance from that point to the farthest corner, so the circle just covers the control. A
 *   fixed percentage would either leave a corner uncovered from an off-centre point or spend most of the spring
 *   beyond the corners, where nothing is seen.
 * - `data-pressed`: present while a pointer is down on the control.
 *
 * The point is the pointer's ENTRY point for a hover, the finger for a press, and the EXIT point as a hover
 * leaves, so the state is swallowed back where the pointer went. Keyboard focus resets it to the centre (the CSS
 * default). That is one rect read per enter, press or leave, never per move: nothing here tracks the cursor
 * (design-language §5.1.1), and everything is written on the control itself, never on <html> (design.md §4,
 * cost 3), and only when it changes.
 *
 * One delegated set of capture-phase, passive listeners for the whole document, like `useFluidPress`: a hook per
 * component reaches the components somebody remembered. It schedules no frames.
 */

import { useEffect } from 'react';

/** A tap held for less than this still shows its eversion for this long, or a quick tap would never be seen. */
export const EVERT_MIN_PRESS_MS = 180;

/** Pointer travel (px) past which a press is a scroll and lets go — the press layer's own slop. */
const SCROLL_SLOP = 10;

const SELECTOR = '[data-evert]';

/** Write the eversion point for `el` at client position (x, y). */
export function placeEvert(el: HTMLElement, x: number, y: number): void {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  const px = Math.min(Math.max(x - r.left, 0), r.width);
  const py = Math.min(Math.max(y - r.top, 0), r.height);
  const far = Math.hypot(Math.max(px, r.width - px), Math.max(py, r.height - py));
  set(el, '--evert-x', `${px.toFixed(1)}px`);
  set(el, '--evert-y', `${py.toFixed(1)}px`);
  // A pixel past the corner, so antialiasing never leaves a hairline of the old state there.
  set(el, '--evert-r', `${(far + 1).toFixed(1)}px`);
}

/** Back to the centre (the stylesheet's default point and radius). */
function centreEvert(el: HTMLElement): void {
  for (const name of ['--evert-x', '--evert-y', '--evert-r']) {
    if (el.style.getPropertyValue(name)) el.style.removeProperty(name);
  }
}

function set(el: HTMLElement, name: string, value: string): void {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

function disabled(el: HTMLElement): boolean {
  return (
    el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.hasAttribute('data-disabled')
  );
}

interface Press {
  el: HTMLElement;
  at: number;
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export function useEvertPointLayer(): void {
  useEffect(() => {
    const presses = new Map<number, Press>();

    const evertOf = (target: EventTarget | null): HTMLElement | null =>
      (target as Element | null)?.closest?.<HTMLElement>(SELECTOR) ?? null;

    /** The same control is still under the pointer: entering or leaving one of its children is not a hover change. */
    const within = (el: HTMLElement, other: EventTarget | null): boolean =>
      other instanceof Node && el.contains(other);

    const onOver = (e: PointerEvent) => {
      // Hover is a fine pointer's; a touch's "over" is its press, handled below.
      if (e.pointerType === 'touch') return;
      const el = evertOf(e.target);
      if (!el || within(el, e.relatedTarget) || disabled(el)) return;
      placeEvert(el, e.clientX, e.clientY);
    };

    const onOut = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = evertOf(e.target);
      if (!el || within(el, e.relatedTarget)) return;
      placeEvert(el, e.clientX, e.clientY);
    };

    const lift = (press: Press) => {
      if (press.timer) clearTimeout(press.timer);
      press.el.removeAttribute('data-pressed');
    };

    const release = (pointerId: number, immediate: boolean) => {
      const press = presses.get(pointerId);
      if (!press) return;
      presses.delete(pointerId);
      const left = EVERT_MIN_PRESS_MS - (performance.now() - press.at);
      if (immediate || left <= 0) lift(press);
      else press.timer = setTimeout(() => lift(press), left);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button > 0) return;
      const el = evertOf(e.target);
      if (!el || disabled(el)) return;
      placeEvert(el, e.clientX, e.clientY);
      el.setAttribute('data-pressed', '');
      presses.set(e.pointerId, {
        el,
        at: performance.now(),
        x: e.clientX,
        y: e.clientY,
        timer: null,
      });
    };

    const onMove = (e: PointerEvent) => {
      const press = presses.get(e.pointerId);
      if (!press) return;
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      // The gesture became a scroll: let go at once, as the press layer does.
      if (dx * dx + dy * dy > SCROLL_SLOP * SCROLL_SLOP) release(e.pointerId, true);
    };

    const onUp = (e: PointerEvent) => release(e.pointerId, false);
    const onCancel = (e: PointerEvent) => release(e.pointerId, true);
    const releaseAll = () => {
      for (const id of [...presses.keys()]) release(id, true);
    };

    // Keyboard focus turns the layer out from the centre.
    const onFocusIn = (e: FocusEvent) => {
      const el = evertOf(e.target);
      if (!el) return;
      try {
        if (!(e.target as Element).matches(':focus-visible')) return;
      } catch {
        return;
      }
      centreEvert(el);
    };

    const opts = { capture: true, passive: true } as const;
    document.addEventListener('pointerover', onOver, opts);
    document.addEventListener('pointerout', onOut, opts);
    document.addEventListener('pointerdown', onDown, opts);
    document.addEventListener('pointermove', onMove, opts);
    document.addEventListener('pointerup', onUp, opts);
    document.addEventListener('pointercancel', onCancel, opts);
    document.addEventListener('focusin', onFocusIn, opts);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);
    return () => {
      document.removeEventListener('pointerover', onOver, opts);
      document.removeEventListener('pointerout', onOut, opts);
      document.removeEventListener('pointerdown', onDown, opts);
      document.removeEventListener('pointermove', onMove, opts);
      document.removeEventListener('pointerup', onUp, opts);
      document.removeEventListener('pointercancel', onCancel, opts);
      document.removeEventListener('focusin', onFocusIn, opts);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', releaseAll);
      for (const press of presses.values()) lift(press);
      presses.clear();
    };
  }, []);
}
