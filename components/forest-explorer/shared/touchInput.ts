/**
 * Touch input for the first-person forest modes.
 *
 * Desktop play rides on the Pointer Lock API, which iPhone Safari does not
 * implement and which phones cannot use anyway (no mouse to capture). On those
 * devices the game runs "unlocked by design": a virtual stick writes into this
 * shared mutable object, a look pad adds yaw/pitch deltas, and the player
 * controllers read it once per frame. It is a plain module object, not React
 * state, so a 120 Hz touch stream never causes a render.
 */
export const touchInput = {
  /** Strafe, -1 (left) … 1 (right). */
  moveX: 0,
  /** Walk, -1 (back) … 1 (forward). */
  moveY: 0,
  /** Radians of yaw/pitch accumulated since the last frame consumed them. */
  lookYaw: 0,
  lookPitch: 0,
  /** Run toggle (the on-screen stand-in for holding Shift). */
  run: false,
};

export function resetTouchInput(): void {
  touchInput.moveX = 0;
  touchInput.moveY = 0;
  touchInput.lookYaw = 0;
  touchInput.lookPitch = 0;
  touchInput.run = false;
}

/**
 * True where the pointer-lock mouselook cannot work: a coarse primary pointer
 * (phones, tablets) or a browser with no `requestPointerLock` at all.
 */
export function usesTouchControls(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noLock = !('requestPointerLock' in document.documentElement);
  return coarse || noLock;
}

/** Pointer lock that never throws where the API is missing (iPhone Safari). */
export function safeRequestPointerLock(): void {
  const canvas = document.querySelector('canvas');
  try {
    const result = (canvas as HTMLCanvasElement | null)?.requestPointerLock?.() as unknown;
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => {});
    }
  } catch {
    /* a refused lock just leaves the pointer free */
  }
}

/** Press a key the way the keyboard handlers expect, without a keyboard. */
export function tapKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
}
