/**
 * Touch input math for the on-screen controls (`components/tf2-game/touch/`):
 * the floating left thumbstick, drag-to-look on the right side, and the
 * touch-first device check. The overlay component owns the pointers; these
 * functions are pure so the stick and look maths are unit-tested.
 *
 * Environment-agnostic.
 */

import type { Vec2 } from './input-state';

/** The stick's travel radius in CSS pixels at button scale 1. */
export const STICK_RADIUS = 56;
/** Fraction of the radius ignored around the centre. */
export const STICK_DEADZONE = 0.12;
/** Past this deflection the stick also presses +speed (HL2 sprint) — not used by TF2. */
export const STICK_SPRINT = 0.98;

/**
 * Stick deflection for a finger at `point` on a stick whose base is at
 * `origin`: x = right, y = forward (screen up), length ≤ 1, with a deadzone
 * rescaled so movement starts smoothly at its edge.
 */
export function stickVector(origin: Vec2, point: Vec2, radius = STICK_RADIUS, deadzone = STICK_DEADZONE): Vec2 {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len === 0 || radius <= 0) return { x: 0, y: 0 };
  const raw = Math.min(1, len / radius);
  if (raw <= deadzone) return { x: 0, y: 0 };
  const mag = (raw - deadzone) / (1 - deadzone);
  return { x: (dx / len) * mag, y: (-dy / len) * mag };
}

/** The knob's offset from the base in pixels (clamped to the radius), for drawing. */
export function knobOffset(origin: Vec2, point: Vec2, radius = STICK_RADIUS): Vec2 {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) return { x: dx, y: dy };
  return { x: (dx / len) * radius, y: (dy / len) * radius };
}

/**
 * A floating stick's base: where the finger landed, pulled inside the stick
 * zone so the whole base stays on screen (zone in the same pixel space).
 */
export function floatingOrigin(
  touch: Vec2,
  zone: { left: number; top: number; right: number; bottom: number },
  radius = STICK_RADIUS,
): Vec2 {
  const clampAxis = (v: number, lo: number, hi: number) => (hi - lo < 2 * radius ? (lo + hi) / 2 : Math.min(hi - radius, Math.max(lo + radius, v)));
  return { x: clampAxis(touch.x, zone.left, zone.right), y: clampAxis(touch.y, zone.top, zone.bottom) };
}

/**
 * A look drag of (dx, dy) CSS pixels → degrees: dragging right turns right
 * (yaw decreases, Source's counter-clockwise yaw), dragging down looks down.
 */
export function dragToLook(dx: number, dy: number, degreesPerPixel: number, invertY = false): { yaw: number; pitch: number } {
  return { yaw: -dx * degreesPerPixel, pitch: dy * degreesPerPixel * (invertY ? -1 : 1) };
}

/** Facts about the device, read from the browser by `detectTouchFirst()`. */
export interface PointerEnvironment {
  coarsePointer: boolean;
  anyFinePointer: boolean;
  hoverNone: boolean;
  maxTouchPoints: number;
}

/** A phone or tablet without a mouse: the primary pointer is coarse and nothing fine is attached. */
export function isTouchFirst(env: PointerEnvironment): boolean {
  if (env.maxTouchPoints <= 0) return false;
  return env.coarsePointer && !env.anyFinePointer && env.hoverNone;
}

export function detectTouchFirst(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return isTouchFirst({
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      anyFinePointer: window.matchMedia('(any-pointer: fine)').matches,
      hoverNone: window.matchMedia('(hover: none)').matches,
      maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
    });
  } catch {
    return false;
  }
}
