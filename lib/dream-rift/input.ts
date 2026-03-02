import type { InputState } from './types';

const KEY_MAP: Record<string, keyof InputState> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  x: 'shot',
  X: 'shot',
  z: 'melee',
  Z: 'melee',
  c: 'special',
  C: 'special',
  a: 'dash',
  A: 'dash',
  s: 'bomb',
  S: 'bomb',
  Shift: 'focus',
  Escape: 'pause',
};

function createEmptyState(): InputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    shot: false,
    melee: false,
    special: false,
    dash: false,
    bomb: false,
    focus: false,
    pause: false,
  };
}

export class InputManager {
  private current: InputState;
  private previous: InputState;

  constructor() {
    this.current = createEmptyState();
    this.previous = createEmptyState();
  }

  getState(): Readonly<InputState> {
    return this.current;
  }

  justPressed(key: keyof InputState): boolean {
    return this.current[key] && !this.previous[key];
  }

  update(): void {
    this.previous = { ...this.current };
  }

  handleKeyDown(e: KeyboardEvent): void {
    const action = KEY_MAP[e.key];
    if (action) {
      this.current[action] = true;
    }
  }

  handleKeyUp(e: KeyboardEvent): void {
    const action = KEY_MAP[e.key];
    if (action) {
      this.current[action] = false;
    }
  }

  bind(element: HTMLElement | Window): () => void {
    const onKeyDown = (e: Event) => this.handleKeyDown(e as KeyboardEvent);
    const onKeyUp = (e: Event) => this.handleKeyUp(e as KeyboardEvent);
    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('keyup', onKeyUp);
    return () => {
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('keyup', onKeyUp);
    };
  }
}
