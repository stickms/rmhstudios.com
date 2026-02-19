const held = new Set<string>();
const justPressed = new Set<string>();
const justReleased = new Set<string>();

function onKeyDown(e: KeyboardEvent) {
  if (!held.has(e.code)) {
    justPressed.add(e.code);
  }
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

  jump(): boolean {
    return justPressed.has("Space") || justPressed.has("ArrowUp") || justPressed.has("KeyW");
  },

  jumpHeld(): boolean {
    return held.has("Space") || held.has("ArrowUp") || held.has("KeyW");
  },

  interact(): boolean {
    return justPressed.has("KeyE");
  },
};
