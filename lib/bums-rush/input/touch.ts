/**
 * Bum's Rush — touch reading (§12.2).
 *
 * Two arms, two thumbs, one gesture each: finger down = reach and hold,
 * finger up = let go. Everything below serves that one sentence.
 *
 * **Auto-Grab (default).** Each screen half belongs to one arm. A touch-down
 * anywhere in a half origins a RELATIVE virtual stick (never absolute — the
 * thumb should not have to find a spot); dragging aims that arm. The grip
 * itself is a simulation fact this module cannot see (whether the hand is
 * actually touching something grabbable is physics, not input), so what this
 * module produces is the REQUEST — `gripRequested` is true while the finger is
 * down and hasn't dragged decisively away from where it went down. The engine
 * is free to layer its own sim-truth "decisive drag away from the actual grab
 * point" on top using the exported `hasDraggedPastGripBreak`, which is the
 * general form of the same check; `resolveTouchArmFrame`'s use of the touch
 * ORIGIN as a stand-in grip point is the sensible default for the common case
 * (you reach for whatever's near where you put your finger down), not the
 * only correct one.
 *
 * **Two-stick (advanced, §12.2 scheme B).** Same relative-stick maths, fixed
 * origin; grip comes from separate button bindings instead of being implied
 * by contact, so `resolveTouchArmFrame` never reports `gripRequested` for it —
 * those bindings are ordinary touch buttons resolved the same generic way
 * keyboard/gamepad buttons are (a pressed `Binding.code`), not something this
 * module needs to special-case.
 *
 * **Multi-touch isolation.** `onTouchDown` claims a screen half for exactly
 * one `pointerId` and ignores any other finger landing in an already-claimed
 * half — a stray palm cannot steal an arm from an active thumb. Pair with
 * `touch-action: none` on the stage (a CSS/component concern, not this
 * module's).
 *
 * Nothing here reads `navigator`/`window` at module scope; `applyTiltToAim`
 * takes an already-sampled `GyroSample` rather than owning any sensor
 * lifecycle itself (that stays in `GyroTracker`, reused as-is per §12.2).
 */

import type { Vec2 } from '../types';
import type { GyroSample } from '@/lib/neon-driftway/gyro';

// ─── Virtual stick geometry (pure) ──────────────────────────────────────────

export const TOUCH_STICK_DEAD_RADIUS_PX = 8;
export const TOUCH_STICK_FULL_DEFLECTION_PX = 64;
/** ">60px past the grip point" reads as "pulling free" (§12.2). */
export const TOUCH_GRIP_BREAK_PX = 60;

/**
 * Relative virtual stick: direction + magnitude from `origin` (where the
 * finger went down) to `current` (where it is now). Zero inside the dead
 * radius; full deflection at `fullDeflectionPx`; linear between, so the first
 * pixel past the dead zone doesn't already read as a strong push.
 */
export function resolveVirtualStick(
  origin: Vec2,
  current: Vec2,
  deadRadiusPx: number = TOUCH_STICK_DEAD_RADIUS_PX,
  fullDeflectionPx: number = TOUCH_STICK_FULL_DEFLECTION_PX,
): Vec2 {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= deadRadiusPx) return { x: 0, y: 0 };

  const usableRange = Math.max(1e-6, fullDeflectionPx - deadRadiusPx);
  const magnitude = Math.min(1, (distance - deadRadiusPx) / usableRange);
  return { x: (dx / distance) * magnitude, y: (dy / distance) * magnitude };
}

export function hasDraggedPastGripBreak(
  gripPoint: Vec2,
  current: Vec2,
  breakPx: number = TOUCH_GRIP_BREAK_PX,
): boolean {
  return Math.hypot(current.x - gripPoint.x, current.y - gripPoint.y) > breakPx;
}

// ─── Screen-half assignment ─────────────────────────────────────────────────

export type ArmSide = 'l' | 'r';

/** Each half of the stage belongs to one arm (§12.2 scheme A). */
export function armForTouchX(clientX: number, stageWidthPx: number): ArmSide {
  return clientX < stageWidthPx / 2 ? 'l' : 'r';
}

// ─── Per-arm touch tracking (pure reducer) ──────────────────────────────────

export interface ActiveTouch {
  pointerId: number;
  origin: Vec2;
  current: Vec2;
}

export interface TouchArmState {
  left: ActiveTouch | null;
  right: ActiveTouch | null;
}

export function createTouchArmState(): TouchArmState {
  return { left: null, right: null };
}

/**
 * A new touch claims its half ONLY if that half is unclaimed — this is the
 * multi-touch isolation: a second finger (or a palm) landing in an
 * already-claimed half is ignored outright rather than stealing or jostling
 * the active stick.
 */
export function onTouchDown(
  state: TouchArmState,
  pointerId: number,
  point: Vec2,
  stageWidthPx: number,
): TouchArmState {
  const side = armForTouchX(point.x, stageWidthPx);
  const existing = side === 'l' ? state.left : state.right;
  if (existing) return state;

  const claimed: ActiveTouch = { pointerId, origin: point, current: point };
  return side === 'l' ? { ...state, left: claimed } : { ...state, right: claimed };
}

export function onTouchMove(state: TouchArmState, pointerId: number, point: Vec2): TouchArmState {
  const left = state.left?.pointerId === pointerId ? { ...state.left, current: point } : state.left;
  const right = state.right?.pointerId === pointerId ? { ...state.right, current: point } : state.right;
  if (left === state.left && right === state.right) return state;
  return { left, right };
}

/** Handles both a deliberate lift and a `pointercancel` (browser-initiated, e.g. an OS gesture stealing the touch) identically — both mean "let go." */
export function onTouchUp(state: TouchArmState, pointerId: number): TouchArmState {
  const left = state.left?.pointerId === pointerId ? null : state.left;
  const right = state.right?.pointerId === pointerId ? null : state.right;
  if (left === state.left && right === state.right) return state;
  return { left, right };
}

// ─── Composite per-arm frame ────────────────────────────────────────────────

export type TouchScheme = 'auto-grab' | 'two-stick';

export interface TouchArmFrame {
  aim: Vec2;
  /** Auto-Grab only — see the module doc comment. Always `false` under `two-stick`. */
  gripRequested: boolean;
  /** A finger currently owns this arm at all (distinct from `aim` being centred inside the dead zone). */
  active: boolean;
}

const INACTIVE_ARM_FRAME: TouchArmFrame = { aim: { x: 0, y: 0 }, gripRequested: false, active: false };

export interface TouchStickOptions {
  deadRadiusPx?: number;
  fullDeflectionPx?: number;
  gripBreakPx?: number;
}

export function resolveTouchArmFrame(
  touch: ActiveTouch | null,
  scheme: TouchScheme,
  opts?: TouchStickOptions,
): TouchArmFrame {
  if (!touch) return INACTIVE_ARM_FRAME;

  const aim = resolveVirtualStick(touch.origin, touch.current, opts?.deadRadiusPx, opts?.fullDeflectionPx);

  if (scheme === 'two-stick') {
    return { aim, gripRequested: false, active: true };
  }

  const pulledFree = hasDraggedPastGripBreak(touch.origin, touch.current, opts?.gripBreakPx);
  return { aim, gripRequested: !pulledFree, active: true };
}

export interface TouchFrame {
  left: TouchArmFrame;
  right: TouchArmFrame;
}

export function resolveTouchFrame(state: TouchArmState, scheme: TouchScheme, opts?: TouchStickOptions): TouchFrame {
  return {
    left: resolveTouchArmFrame(state.left, scheme, opts),
    right: resolveTouchArmFrame(state.right, scheme, opts),
  };
}

// ─── Tilt-assist (§12.2 scheme C, optional, off by default) ────────────────

/**
 * Adds up to `strength` (±20% default) of device tilt to `aim`, for whichever
 * arm is currently held — the caller decides which arm that is (a centred,
 * inactive arm should not be passed here at all). Normalises against a
 * comfortable ±45° range so a relaxed hold doesn't already max out the
 * contribution, then re-clamps the combined vector to unit length so tilt can
 * never push an aim vector's magnitude past what the engine expects.
 *
 * `sample` comes from `GyroTracker` (`lib/neon-driftway/gyro.ts`) reused
 * as-is per §12.2 — this module owns none of that class's permission
 * lifecycle, only the pure blend.
 */
export function applyTiltToAim(
  aim: Vec2,
  sample: GyroSample | null,
  enabled: boolean,
  strength = 0.2,
): Vec2 {
  if (!enabled || !sample) return aim;

  const gammaNorm = clamp(sample.gamma / 45, -1, 1); // left/right tilt
  const betaNorm = clamp((sample.beta - 45) / 45, -1, 1); // front/back tilt, 45° ~ a typical relaxed hold

  const x = aim.x + gammaNorm * strength;
  const y = aim.y + betaNorm * strength;
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 1) return { x, y };
  return { x: x / magnitude, y: y / magnitude };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
