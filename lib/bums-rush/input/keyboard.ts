/**
 * Bum's Rush — keyboard reading (§4.2).
 *
 * A keyboard is digital: a key is either down or not, so "aim" starts as one
 * of 8 fixed directions (or none). Read raw, that teleports the arm between
 * headings every keypress, which the design doc calls out as genuinely
 * unplayable. `smoothDigitalAim` is the fix: it drives a persistent heading
 * toward the new 8-way target at a fixed angular rate (12 rad/s, §4.2) instead
 * of snapping to it, so a keyboard swing has the same kind of momentum a
 * stick's continuous motion gives for free.
 *
 * The stateful piece (`createKeyboardState`) is a thin, SSR-guarded listener;
 * everything that decides what the state MEANS is a pure function below it,
 * so the maths is testable without a DOM.
 */

import type { Vec2 } from '../types';
import type { Binding } from './bindings';

// ─── Held-key state ─────────────────────────────────────────────────────────

export interface KeyboardState {
  /** `KeyboardEvent.code` values currently held. */
  readonly pressed: ReadonlySet<string>;
  dispose(): void;
}

/** Codes with a default browser action worth suppressing during play (page scroll, focus change). */
const CODES_NEEDING_PREVENT_DEFAULT = new Set([
  'Space',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

/**
 * Attaches `keydown`/`keyup`/`blur` listeners on `window` and tracks held
 * codes in a live `Set`. SSR-safe: returns an inert, always-empty state with a
 * no-op disposer when there is no `window`. `blur` clears everything —
 * alt-tabbing away must not leave a phantom held key driving an arm forever.
 */
export function createKeyboardState(): KeyboardState {
  const pressed = new Set<string>();
  if (typeof window === 'undefined') {
    return { pressed, dispose: () => {} };
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (CODES_NEEDING_PREVENT_DEFAULT.has(event.code)) event.preventDefault();
    pressed.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    pressed.delete(event.code);
  };
  const onBlur = () => {
    pressed.clear();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    pressed,
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}

// ─── 8-way target resolution (pure) ─────────────────────────────────────────

/**
 * Sums the signed axis contributions of whichever bound keys are currently
 * held (opposite keys held together cancel naturally, e.g. W+S), clamps each
 * axis to -1..1, then normalises so diagonals read as unit length rather than
 * `sqrt(2)` — an 8-way target, never a 9th "extra-strong diagonal" one.
 * Bindings without an `axis` (gamepad/touch/mouse alternates on this same
 * action) are ignored here; this is the keyboard-only half of the merge.
 */
export function resolveDigitalAimTarget(bindings: readonly Binding[], held: ReadonlySet<string>): Vec2 {
  let x = 0;
  let y = 0;
  for (const binding of bindings) {
    if (binding.source !== 'keyboard' || !binding.axis) continue;
    if (!held.has(binding.code)) continue;
    if (binding.axis.index === 0) x += binding.axis.sign;
    else y += binding.axis.sign;
  }
  x = Math.max(-1, Math.min(1, x));
  y = Math.max(-1, Math.min(1, y));

  const magnitude = Math.hypot(x, y);
  if (magnitude < 1e-6) return { x: 0, y: 0 };
  return { x: x / magnitude, y: y / magnitude };
}

export function isKeyboardActionPressed(bindings: readonly Binding[], held: ReadonlySet<string>): boolean {
  return bindings.some((binding) => binding.source === 'keyboard' && !binding.axis && held.has(binding.code));
}

// ─── Digital→analog smoothing (§4.2: 12 rad/s) ─────────────────────────────

export const AIM_SMOOTH_RATE_RAD_S = 12;

export interface AimSmoother {
  /** Current heading, radians. Meaningless while `magnitude` is 0. */
  angle: number;
  /** Keyboard aim is digital: this is always exactly 0 or 1. */
  magnitude: 0 | 1;
}

export function createAimSmoother(): AimSmoother {
  return { angle: 0, magnitude: 0 };
}

function normaliseAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  const wrapped = angle % twoPi;
  return wrapped < 0 ? wrapped + twoPi : wrapped;
}

/** Signed shortest angular distance from `from` to `to`, in (-π, π]. */
function shortestAngleDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  let delta = (to - from) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta < -Math.PI) delta += twoPi;
  return delta;
}

/**
 * Advances `current` one tick toward the discrete `target` (§4.2).
 *
 * Releasing all keys goes limp immediately (`magnitude` snaps to 0) — the 12
 * rad/s budget is for swinging TOWARD a new heading, not for the moment you
 * let go; a delayed release would read as sticky controls, worse than no
 * smoothing. Starting from rest (magnitude 0 → a new key press) snaps the
 * heading immediately too, since there is no prior direction to swing FROM —
 * only heading CHANGES while already aiming are rate-limited.
 */
export function smoothDigitalAim(current: AimSmoother, target: Vec2, dtSeconds: number): AimSmoother {
  const targetMagnitude = Math.hypot(target.x, target.y);
  if (targetMagnitude < 1e-6) {
    return { angle: current.angle, magnitude: 0 };
  }

  const targetAngle = Math.atan2(target.y, target.x);
  if (current.magnitude === 0) {
    return { angle: targetAngle, magnitude: 1 };
  }

  const delta = shortestAngleDelta(current.angle, targetAngle);
  const maxStep = AIM_SMOOTH_RATE_RAD_S * Math.max(0, dtSeconds);
  const step = Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;
  return { angle: normaliseAngle(current.angle + step), magnitude: 1 };
}

export function aimVectorFromSmoother(smoother: AimSmoother): Vec2 {
  if (smoother.magnitude === 0) return { x: 0, y: 0 };
  return { x: Math.cos(smoother.angle), y: Math.sin(smoother.angle) };
}
