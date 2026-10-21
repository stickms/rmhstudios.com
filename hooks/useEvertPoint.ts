'use client';

/**
 * Where a control turns inside out from — the input half of the eversion state layer (globals.css §7.3).
 *
 * Every control carrying `data-evert` changes state by turning a tint out of itself: its own shape, swelling out of
 * one point on a spring. CSS draws all of it; this tells the CSS which point, and when a press is down:
 *
 * - `--evert-x` / `--evert-y`: the point, in px from the control's top-left corner (the layer's `transform-origin`).
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
 *
 * It also reaches the components nobody remembered (amended 2026-10-21): a button, link, tab or field without
 * `data-evert` is adopted on first contact (`lib/evert-auto.ts`) - tagged for the same layer, or, where it cannot
 * hold one (a text field, a select, a control whose `::before` is taken), given a ghost of the layer over it.
 */

import { useEffect } from 'react';
import {
  adopt,
  controlAt,
  disposeGhosts,
  ghostTarget,
  hideGhost,
  pressGhost,
  showGhost,
} from '@/lib/evert-auto';

/** A tap held for less than this still shows its eversion for this long, or a quick tap would never be seen. */
export const EVERT_MIN_PRESS_MS = 180;

/** Pointer travel (px) past which a press is a scroll and lets go — the press layer's own slop. */
const SCROLL_SLOP = 10;

/** Write the eversion point for `el` at client position (x, y). */
export function placeEvert(el: HTMLElement, x: number, y: number): void {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  const px = Math.min(Math.max(x - r.left, 0), r.width);
  const py = Math.min(Math.max(y - r.top, 0), r.height);
  set(el, '--evert-x', `${px.toFixed(1)}px`);
  set(el, '--evert-y', `${py.toFixed(1)}px`);
}

/** Back to the centre (the stylesheet's default point and radius). */
function centreEvert(el: HTMLElement): void {
  for (const name of ['--evert-x', '--evert-y']) {
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
  /** The control everts through a ghost (`lib/evert-auto.ts`), not its own layer. */
  ghost: boolean;
  touch: boolean;
  at: number;
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export function useEvertPointLayer(): void {
  useEffect(() => {
    const presses = new Map<number, Press>();

    /** The control under `target` and how it everts; adopting it on first contact. */
    const evertOf = (target: EventTarget | null): { el: HTMLElement; ghost: boolean } | null => {
      const el = controlAt(target);
      if (!el) return null;
      const mode = adopt(el);
      return mode ? { el, ghost: mode === 'ghost' } : null;
    };
    /** The last press, so a field focused by it turns its focus out of the finger. */
    let lastPress: { el: HTMLElement; x: number; y: number; at: number } | null = null;

    /** The same control is still under the pointer: entering or leaving one of its children is not a hover change. */
    const within = (el: HTMLElement, other: EventTarget | null): boolean =>
      other instanceof Node && el.contains(other);

    const onOver = (e: PointerEvent) => {
      // Hover is a fine pointer's; a touch's "over" is its press, handled below.
      if (e.pointerType === 'touch') return;
      const hit = evertOf(e.target);
      if (!hit || within(hit.el, e.relatedTarget) || disabled(hit.el)) return;
      if (hit.ghost) showGhost('hover', hit.el, e.clientX, e.clientY);
      else placeEvert(hit.el, e.clientX, e.clientY);
    };

    const onOut = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const hit = evertOf(e.target);
      if (!hit || within(hit.el, e.relatedTarget)) return;
      if (hit.ghost) hideGhost('hover', hit.el, e.clientX, e.clientY);
      else placeEvert(hit.el, e.clientX, e.clientY);
    };

    const lift = (press: Press) => {
      if (press.timer) clearTimeout(press.timer);
      if (!press.ghost) {
        press.el.removeAttribute('data-pressed');
        return;
      }
      pressGhost(press.el, false);
      // A finger has no hover to keep the ghost up once it lifts.
      if (press.touch) hideGhost('hover', press.el);
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
      const hit = evertOf(e.target);
      if (!hit || disabled(hit.el)) return;
      const { el, ghost } = hit;
      lastPress = { el, x: e.clientX, y: e.clientY, at: performance.now() };
      if (ghost) {
        showGhost('hover', el, e.clientX, e.clientY);
        pressGhost(el, true);
      } else {
        placeEvert(el, e.clientX, e.clientY);
        el.setAttribute('data-pressed', '');
      }
      presses.set(e.pointerId, {
        el,
        ghost,
        touch: e.pointerType === 'touch',
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

    // Keyboard focus turns the layer out from the centre. A field's focus is shown however it came (a click into a
    // text field is the field's state changing), out of the press that focused it.
    const onFocusIn = (e: FocusEvent) => {
      const hit = evertOf(e.target);
      if (!hit) return;
      let visible = false;
      try {
        visible = (e.target as Element).matches(':focus-visible');
      } catch {
        return;
      }
      if (!hit.ghost) {
        if (visible) centreEvert(hit.el);
        return;
      }
      const field = /^(INPUT|TEXTAREA|SELECT)$/.test(hit.el.tagName);
      if (!visible && !field) return;
      const press =
        lastPress && lastPress.el === hit.el && performance.now() - lastPress.at < 1000
          ? lastPress
          : null;
      showGhost('focus', hit.el, press?.x ?? null, press?.y ?? null);
    };
    const onFocusOut = (e: FocusEvent) => {
      const el = ghostTarget('focus');
      if (el && (e.target === el || el.contains(e.target as Node))) hideGhost('focus', el);
    };

    const opts = { capture: true, passive: true } as const;
    document.addEventListener('pointerover', onOver, opts);
    document.addEventListener('pointerout', onOut, opts);
    document.addEventListener('pointerdown', onDown, opts);
    document.addEventListener('pointermove', onMove, opts);
    document.addEventListener('pointerup', onUp, opts);
    document.addEventListener('pointercancel', onCancel, opts);
    document.addEventListener('focusin', onFocusIn, opts);
    document.addEventListener('focusout', onFocusOut, opts);
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
      document.removeEventListener('focusout', onFocusOut, opts);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', releaseAll);
      for (const press of presses.values()) lift(press);
      presses.clear();
      disposeGhosts();
    };
  }, []);
}
