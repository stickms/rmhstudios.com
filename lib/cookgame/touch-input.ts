/**
 * Touch input shared between the on-screen controls (DOM) and the player
 * controller (R3F frame loop). A plain mutable object: it is read every frame
 * and must never go through React state.
 */
export const touchInput = {
  /** Joystick vector, each axis in [-1, 1]. +x = right, +z = towards camera. */
  x: 0,
  z: 0,
  /** Sprint toggle (latched by the on-screen button). */
  sprint: false,
};

export function resetTouchInput(): void {
  touchInput.x = 0;
  touchInput.z = 0;
}
