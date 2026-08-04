/**
 * Massive March — one input surface for three input devices.
 *
 * The controller does not know or care whether a movement came from WASD, a
 * thumbstick drawn on a phone screen, or a HUD button somebody tabbed to and
 * pressed with the keyboard. All three write here; the controller reads here.
 *
 * That indirection is what makes the accessibility options in `settings.ts`
 * cheap rather than invasive. Hold-versus-toggle for running and crouching is a
 * property of how `run` and `crouch` get *written*, and the movement code never
 * finds out which the player chose.
 *
 * Mutable module state rather than a store, for the same reason `live.ts` is:
 * this is read every frame and must never cause a render.
 */

export interface InputState {
  /** -1…1, screen-relative. Strafe and forward. */
  moveX: number;
  moveY: number;
  /** Look deltas accumulated since the last frame, consumed by the controller. */
  lookX: number;
  lookY: number;
  run: boolean;
  crouch: boolean;
  sit: boolean;
  /** Edge-triggered: set by a press, cleared by the frame that acts on it. */
  jump: boolean;
  interact: boolean;
  drop: boolean;
  use: boolean;
  /** Held while charging a throw; the frame it goes false is the release. */
  throwing: boolean;
  throwCharge: number;
  /** True while any text field has focus — movement keys are text then. */
  typing: boolean;
  /** Pointer is locked (or touch is driving), so look input is live. */
  looking: boolean;
}

export const input: InputState = {
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  run: false,
  crouch: false,
  sit: false,
  jump: false,
  interact: false,
  drop: false,
  use: false,
  throwing: false,
  throwCharge: 0,
  typing: false,
  looking: false,
};

export function resetInput(): void {
  input.moveX = 0;
  input.moveY = 0;
  input.lookX = 0;
  input.lookY = 0;
  input.run = false;
  input.crouch = false;
  input.sit = false;
  input.jump = false;
  input.interact = false;
  input.drop = false;
  input.use = false;
  input.throwing = false;
  input.throwCharge = 0;
}

/** Read and clear an edge-triggered flag. */
export function consume(key: 'jump' | 'interact' | 'drop' | 'use'): boolean {
  if (!input[key]) return false;
  input[key] = false;
  return true;
}
