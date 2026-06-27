// Global keyboard input state for the canvas game.
const held = new Set<string>();
const justPressed = new Set<string>();
const justReleased = new Set<string>();

// Keys the game owns — we preventDefault these so the page doesn't scroll.
const OWNED = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
  "KeyJ",
  "KeyK",
]);

function onKeyDown(e: KeyboardEvent) {
  if (OWNED.has(e.code)) e.preventDefault();
  if (!held.has(e.code)) justPressed.add(e.code);
  held.add(e.code);
}

function onKeyUp(e: KeyboardEvent) {
  held.delete(e.code);
  justReleased.add(e.code);
}

export const Input = {
  init() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  },

  destroy() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    held.clear();
    justPressed.clear();
    justReleased.clear();
  },

  endFrame() {
    justPressed.clear();
    justReleased.clear();
  },

  // Clear held state (used when a modal/dialogue grabs focus) so the player
  // doesn't keep running after control returns.
  clearHeld() {
    held.clear();
  },

  isHeld(code: string): boolean {
    return held.has(code);
  },
  wasPressed(code: string): boolean {
    return justPressed.has(code);
  },
  wasReleased(code: string): boolean {
    return justReleased.has(code);
  },

  left(): boolean {
    return held.has("ArrowLeft") || held.has("KeyA");
  },
  right(): boolean {
    return held.has("ArrowRight") || held.has("KeyD");
  },
  up(): boolean {
    return held.has("ArrowUp") || held.has("KeyW");
  },
  down(): boolean {
    return held.has("ArrowDown") || held.has("KeyS");
  },
  jump(): boolean {
    return justPressed.has("Space") || justPressed.has("KeyK") || justPressed.has("ArrowUp");
  },
  jumpHeld(): boolean {
    return held.has("Space") || held.has("KeyK") || held.has("ArrowUp");
  },
  dash(): boolean {
    return (
      justPressed.has("ShiftLeft") ||
      justPressed.has("ShiftRight") ||
      justPressed.has("KeyJ")
    );
  },
  interact(): boolean {
    return justPressed.has("KeyE");
  },
};
