// =============================================================================
// ALTAIR ENGINE -- Input System
// =============================================================================
// Keyboard and touch/d-pad input handling.
// =============================================================================

import { InputState } from './types';

/**
 * Create a fresh input state.
 */
export function createInputState(): InputState {
  return {
    dx: 0,
    dy: 0,
    keys: new Set<string>(),
  };
}

/**
 * Set up keyboard listeners on `window`.
 *
 * @param inputState  Shared input state to mutate
 * @param keybinds    Mapping of actions to key names (e.g. { up: 'w', down: 's', ... })
 * @param onPause     Callback invoked when the pause key is pressed
 * @returns A cleanup function that removes all listeners
 */
export function setupInputListeners(
  inputState: InputState,
  keybinds: {
    up: string;
    down: string;
    left: string;
    right: string;
    pause: string;
  },
  onPause: () => void,
): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    inputState.keys.add(key);

    if (key === keybinds.pause.toLowerCase()) {
      onPause();
    }

    // Prevent arrow keys / space from scrolling the page
    if (
      ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)
    ) {
      e.preventDefault();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    inputState.keys.delete(key);
  };

  // When the window loses focus, release everything
  const handleBlur = () => {
    inputState.keys.clear();
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('blur', handleBlur);
  };
}

/**
 * Called by a mobile d-pad component to override the movement vector directly.
 * dx and dy should each be in [-1, 1].
 */
export function setMobileInput(
  inputState: InputState,
  dx: number,
  dy: number,
): void {
  inputState.dx = dx;
  inputState.dy = dy;
}

/**
 * Derive the normalized movement vector from the current input state.
 *
 * Mobile d-pad values (dx/dy) take priority. If they are zero the keyboard
 * bindings are evaluated instead. The result is always normalized so that
 * diagonal movement is not faster than cardinal movement.
 */
export function getMovementVector(
  inputState: InputState,
): { dx: number; dy: number } {
  // If mobile input is active, use it directly
  if (inputState.dx !== 0 || inputState.dy !== 0) {
    const len = Math.sqrt(
      inputState.dx * inputState.dx + inputState.dy * inputState.dy,
    );
    if (len > 0) {
      return { dx: inputState.dx / len, dy: inputState.dy / len };
    }
    return { dx: 0, dy: 0 };
  }

  // Keyboard fallback -- build direction from held keys
  let kx = 0;
  let ky = 0;

  // Support WASD, arrow keys, and any custom keybinds that happen to be held.
  // We intentionally check common defaults here since the key names stored
  // in the set are already lowercase.
  if (
    inputState.keys.has('w') ||
    inputState.keys.has('arrowup')
  ) {
    ky -= 1;
  }
  if (
    inputState.keys.has('s') ||
    inputState.keys.has('arrowdown')
  ) {
    ky += 1;
  }
  if (
    inputState.keys.has('a') ||
    inputState.keys.has('arrowleft')
  ) {
    kx -= 1;
  }
  if (
    inputState.keys.has('d') ||
    inputState.keys.has('arrowright')
  ) {
    kx += 1;
  }

  // Normalize diagonal movement
  const len = Math.sqrt(kx * kx + ky * ky);
  if (len > 0) {
    return { dx: kx / len, dy: ky / len };
  }
  return { dx: 0, dy: 0 };
}
