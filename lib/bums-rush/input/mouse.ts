/**
 * Bum's Rush — mouse reading (§4.3).
 *
 * Mouse is "a supported supplement, not a control scheme" — it never gets its
 * own `BindingSet` profile (see `bindings.ts`'s `KEYBOARD_P1_BINDINGS`, where
 * the mouse alternates for `aimRight`/`grabRight` live). This module owns two
 * things: the pure geometry that turns a cursor position into an aim vector
 * for the right arm, and a small SSR-guarded pointer-state tracker.
 *
 * The one thing this module deliberately does NOT know is where the
 * character's shoulder is on screen — that is a camera/render fact, owned by
 * whatever draws the game. `resolveMouseAim` takes it as a parameter; a
 * caller with no screen position yet simply doesn't call it, and the mouse
 * alternate contributes nothing that tick (the keyboard alternate on the same
 * action still works).
 */

import type { Vec2 } from '../types';

// ─── Aim geometry (pure) ────────────────────────────────────────────────────

/** Below this many px from the anchor, direction is too noisy to mean anything — treat it as centred. */
export const MOUSE_AIM_DEAD_RADIUS_PX = 4;
/** Cursor distance from the anchor at which aim reaches full deflection. */
export const MOUSE_AIM_FULL_DEFLECTION_PX = 160;

/**
 * Direction + magnitude from `anchor` (the seat's right shoulder in screen
 * space) to `pointer` (the cursor), scaled like a virtual stick: 0 within the
 * dead radius, 1 at or beyond `fullDeflectionPx`, linear between.
 */
export function resolveMouseAim(
  anchor: Vec2,
  pointer: Vec2,
  fullDeflectionPx: number = MOUSE_AIM_FULL_DEFLECTION_PX,
): Vec2 {
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  if (distance < MOUSE_AIM_DEAD_RADIUS_PX) return { x: 0, y: 0 };

  const magnitude = Math.min(1, distance / Math.max(1e-6, fullDeflectionPx));
  return { x: (dx / distance) * magnitude, y: (dy / distance) * magnitude };
}

// ─── Pointer state ──────────────────────────────────────────────────────────

export interface MouseState {
  /** Last known viewport position. */
  readonly position: Vec2;
  /** Left button held — the right-grab input (§4.3). */
  readonly primaryDown: boolean;
}

export interface MouseTracker {
  readonly state: MouseState;
  dispose(): void;
}

/**
 * Tracks cursor position and the primary button via `pointer*` events on
 * `window`, filtered to `pointerType === 'mouse'` so this never reacts to a
 * touch or pen pointer (those belong to `touch.ts`). `blur` releases the
 * button so alt-tabbing mid-click can't leave a phantom right-grab held.
 * SSR-safe: returns an inert tracker with a no-op disposer without `window`.
 */
export function createMouseTracker(): MouseTracker {
  const state: { position: Vec2; primaryDown: boolean } = {
    position: { x: 0, y: 0 },
    primaryDown: false,
  };

  if (typeof window === 'undefined') {
    return { state, dispose: () => {} };
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    state.position = { x: event.clientX, y: event.clientY };
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    state.primaryDown = true;
  };
  const onUp = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    state.primaryDown = false;
  };
  const onBlur = () => {
    state.primaryDown = false;
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('blur', onBlur);

  return {
    state,
    dispose: () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}

/** `Binding.code` values this module understands, for `glyphs.ts`/`sources.ts` to check against. */
export function isMouseActionPressed(code: string, state: MouseState): boolean {
  return code === 'button0' && state.primaryDown;
}
