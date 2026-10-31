/**
 * Keyboard and mouse: key and button events through the bindings into the
 * input state, mouse movement as raw counts while the pointer is locked, the
 * wheel as MWheelUp/MWheelDown impulses. Browser only.
 *
 * Pointer lock is requested with `unadjustedMovement` when raw input is on
 * (Chromium: the OS pointer acceleration is bypassed, like Source's
 * `m_rawinput 1`); browsers that refuse it get an ordinary lock.
 *
 * Keys typed into a text field (chat) never reach the game, and nothing does
 * while the state is `suspended`. Losing focus or the lock releases every
 * held key, so a key let go in another window does not stay down.
 */

import type { GameSettings } from '../settings';
import { bindingIndex, isHeldAction, mouseCode, type Action, type ImpulseAction } from './actions';
import { pushImpulse, releaseAll, setHeld, type InputState } from './input-state';

export interface KeyboardMouseOptions {
  /** The element whose click captures the pointer (the game canvas or its wrapper). */
  target: HTMLElement;
  state: InputState;
  getSettings: () => Pick<GameSettings, 'keybinds' | 'rawInput'>;
  /** Called after each impulse is queued (the HUD may react at once rather than next frame). */
  onImpulse?: (action: ImpulseAction) => void;
  /** Pointer lock gained / lost. */
  onLockChange?: (locked: boolean) => void;
}

const isTextField = (el: EventTarget | null): boolean => {
  if (!el || typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
};

/** Keys the browser would otherwise act on (scroll, find, back) while the game has them. */
const SWALLOW = new Set(['Space', 'Tab', 'Slash', 'Quote', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class KeyboardMouseInput {
  private index = new Map<string, Action[]>();
  private bindsRef: unknown = null;
  private attached = false;

  constructor(private readonly opts: KeyboardMouseOptions) {}

  get locked(): boolean {
    return typeof document !== 'undefined' && document.pointerLockElement === this.opts.target;
  }

  private actionsFor(code: string): Action[] {
    const binds = this.opts.getSettings().keybinds;
    if (binds !== this.bindsRef) {
      this.bindsRef = binds;
      this.index = bindingIndex(binds);
    }
    return this.index.get(code) ?? [];
  }

  private press(code: string, down: boolean, repeat = false): boolean {
    const actions = this.actionsFor(code);
    const { state } = this.opts;
    for (const a of actions) {
      if (isHeldAction(a)) setHeld(state, 'key', a, down && !state.suspended);
      else if (down && !repeat && (!state.suspended || a === 'menu')) {
        pushImpulse(state, a);
        this.opts.onImpulse?.(a);
      }
    }
    return actions.length > 0;
  }

  /** Requests pointer lock (raw when the setting is on). Resolves to whether the pointer is locked. */
  async lock(): Promise<boolean> {
    const el = this.opts.target as HTMLElement & {
      requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
    };
    if (typeof el.requestPointerLock !== 'function') return false;
    const raw = this.opts.getSettings().rawInput;
    try {
      await el.requestPointerLock(raw ? { unadjustedMovement: true } : undefined);
    } catch {
      // NotSupportedError for unadjustedMovement (Firefox, Safari): an ordinary lock instead.
      try {
        await el.requestPointerLock();
      } catch {
        return false;
      }
    }
    return this.locked;
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /**
   * In fullscreen, asks for the Keyboard Lock API (Chromium) so Ctrl+W, Escape-held
   * and other browser shortcuts reach the game. A no-op elsewhere.
   */
  async lockKeys(): Promise<void> {
    const kb = (navigator as Navigator & { keyboard?: { lock?: (codes?: string[]) => Promise<void> } }).keyboard;
    try {
      await kb?.lock?.();
    } catch {
      // Not fullscreen or not supported.
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTextField(e.target)) return;
    // Ctrl+W while crouch-walking: the browser only lets a page keep it under the Keyboard Lock API
    // (fullscreen); `lockKeys()` asks for that, otherwise the press still reaches the game here.
    const bound = this.press(e.code, true, e.repeat);
    if (bound || SWALLOW.has(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.press(e.code, false);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.locked) {
      // The first click captures the pointer; it is not a shot. Not while a HUD panel has the cursor.
      if (e.button === 0 && !this.opts.state.suspended && !this.opts.state.cursor) void this.lock();
      return;
    }
    e.preventDefault();
    this.press(mouseCode(e.button), true);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.press(mouseCode(e.button), false);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || this.opts.state.suspended) return;
    this.opts.state.mouseDx += e.movementX;
    this.opts.state.mouseDy += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    if (e.deltaY < 0) this.press('MWheelUp', true);
    else if (e.deltaY > 0) this.press('MWheelDown', true);
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onBlur = (): void => {
    releaseAll(this.opts.state, 'key');
  };

  private onLockChange = (): void => {
    const locked = this.locked;
    if (!locked) releaseAll(this.opts.state, 'key');
    this.opts.onLockChange?.(locked);
  };

  attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    const t = this.opts.target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    t.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    t.addEventListener('wheel', this.onWheel, { passive: false });
    t.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    const t = this.opts.target;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    t.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    t.removeEventListener('wheel', this.onWheel);
    t.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    releaseAll(this.opts.state, 'key');
    this.unlock();
  }
}

/** A readable label for a binding code ("KeyW" → "W", "Mouse1" → "MOUSE1", "MWheelUp" → "MWHEELUP"). */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `KP_${code.slice(6)}`;
  if (/^Mouse\d$/.test(code) || /^MWheel/.test(code)) return code.toUpperCase();
  const named: Record<string, string> = {
    Space: 'SPACE',
    ControlLeft: 'CTRL',
    ControlRight: 'RCTRL',
    ShiftLeft: 'SHIFT',
    ShiftRight: 'RSHIFT',
    AltLeft: 'ALT',
    AltRight: 'RALT',
    Tab: 'TAB',
    Escape: 'ESC',
    Enter: 'ENTER',
    Backspace: 'BACKSPACE',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    ArrowUp: 'UPARROW',
    ArrowDown: 'DOWNARROW',
    ArrowLeft: 'LEFTARROW',
    ArrowRight: 'RIGHTARROW',
    CapsLock: 'CAPSLOCK',
  };
  return named[code] ?? code.toUpperCase();
}
