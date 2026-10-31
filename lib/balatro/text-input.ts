/**
 * The phone keyboard for Balatro's text fields (docs/balatro-wasm.md §7).
 *
 * Balatro types into a field through keypressed events: a tap hooks the field and
 * every key goes to it. It never asks the OS for a keyboard, and SDL on Emscripten
 * has no text-input element, so on iOS (and Android) tapping a field shows nothing.
 *
 * This owns one hidden <input>. iOS only raises its keyboard for a focus() made
 * inside the user's own event handler, and Lua cannot have seen the tap by then, so
 * the Lua platform layer publishes where the open menu's field is (`/rmh/text`,
 * rmh_web.lua §10) and the tap handler checks the touch point against it, in the
 * same task, and focuses. What the player types is turned into the keydown/keyup
 * pairs SDL listens for on the document and the input stays empty; it never holds
 * text, so there is nothing to autocorrect, autofill or suggest.
 */

export const TEXT_FILE = '/rmh/text';

/** A rectangle as fractions of the game's window (0–1), so it holds at any render scale. */
export interface FieldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextState {
  /** A text field currently has the game's keyboard focus. */
  hooked: boolean;
  field: FieldRect | null;
}

/** Parses `<hooked>\n<x> <y> <w> <h>` (what rmh_web.lua writes). */
export function parseTextState(text: string): TextState {
  const [first = '', second = ''] = text.split('\n');
  const n = second.trim().split(/\s+/).map(Number);
  const field =
    n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? { x: n[0], y: n[1], w: n[2], h: n[3] } : null;
  return { hooked: first.trim() === '1', field };
}

/**
 * Whether a point (fractions of the canvas) is on the field, with a finger-sized margin
 * (`slopX`/`slopY`, also fractions: 12 CSS px over the canvas's size).
 */
export function hitsField(field: FieldRect | null, x: number, y: number, slopX = 0.01, slopY = 0.01): boolean {
  if (!field) return false;
  return x >= field.x - slopX && x <= field.x + field.w + slopX && y >= field.y - slopY && y <= field.y + field.h + slopY;
}

export interface KeySpec {
  key: string;
  code: string;
  keyCode: number;
  shift: boolean;
}

const SHIFTED = '!@#$%^&*()_+:"<>?';
const UNSHIFTED = '1234567890-=;\',./';
const PUNCT: Record<string, { code: string; keyCode: number }> = {
  '-': { code: 'Minus', keyCode: 189 },
  '=': { code: 'Equal', keyCode: 187 },
  ';': { code: 'Semicolon', keyCode: 186 },
  "'": { code: 'Quote', keyCode: 222 },
  ',': { code: 'Comma', keyCode: 188 },
  '.': { code: 'Period', keyCode: 190 },
  '/': { code: 'Slash', keyCode: 191 },
  '[': { code: 'BracketLeft', keyCode: 219 },
  ']': { code: 'BracketRight', keyCode: 221 },
};

/**
 * The key presses that type one character on a US keyboard, or null when there is
 * none (an emoji, say): SDL reads `code` for the scancode and `key` for the keycode,
 * and Balatro's field accepts only what a US layout types.
 */
export function keyForChar(ch: string): KeySpec | null {
  if (ch.length !== 1) return null;
  if (/[a-z]/.test(ch)) return { key: ch, code: `Key${ch.toUpperCase()}`, keyCode: ch.toUpperCase().charCodeAt(0), shift: false };
  if (/[A-Z]/.test(ch)) return { key: ch, code: `Key${ch}`, keyCode: ch.charCodeAt(0), shift: true };
  if (/[0-9]/.test(ch)) return { key: ch, code: `Digit${ch}`, keyCode: ch.charCodeAt(0), shift: false };
  if (ch === ' ') return { key: ' ', code: 'Space', keyCode: 32, shift: false };
  const shifted = SHIFTED.indexOf(ch);
  if (shifted >= 0) {
    const base = keyForChar(UNSHIFTED[shifted]);
    return base ? { key: ch, code: base.code, keyCode: base.keyCode, shift: true } : null;
  }
  const p = PUNCT[ch];
  return p ? { key: ch, code: p.code, keyCode: p.keyCode, shift: false } : null;
}

const NAMED: Record<string, KeySpec> = {
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8, shift: false },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46, shift: false },
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, shift: false },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27, shift: false },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, shift: false },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, shift: false },
};

export function keyForNamed(key: string): KeySpec | null {
  return NAMED[key] ?? null;
}

const SHIFT_KEY: KeySpec = { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shift: false };

function fire(type: 'keydown' | 'keyup', spec: KeySpec, shift: boolean) {
  const event = new KeyboardEvent(type, {
    key: spec.key,
    code: spec.code,
    keyCode: spec.keyCode,
    which: spec.keyCode,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  // Safari and Firefox ignore keyCode/which in the init dictionary.
  if (event.keyCode !== spec.keyCode) {
    Object.defineProperty(event, 'keyCode', { get: () => spec.keyCode });
    Object.defineProperty(event, 'which', { get: () => spec.keyCode });
  }
  document.dispatchEvent(event);
}

function keyDown(spec: KeySpec) {
  if (spec.shift) fire('keydown', SHIFT_KEY, true);
  fire('keydown', spec, spec.shift);
}

function keyUp(spec: KeySpec) {
  fire('keyup', spec, spec.shift);
  if (spec.shift) fire('keyup', SHIFT_KEY, false);
}

/**
 * Presses keys one at a time, a frame down and a frame up. Balatro keeps the keys that
 * went down in a table and reads it once a frame in hash order, so two keys sent inside
 * one frame (autocorrect, a paste, a slow phone) would reach the field shuffled.
 */
export function createKeyQueue(): { press(spec: KeySpec): void; stop(): void } {
  const queue: KeySpec[] = [];
  let held: KeySpec | null = null;
  let frame = 0;
  const pump = () => {
    frame = 0;
    if (held) {
      keyUp(held);
      held = null;
    } else {
      held = queue.shift() ?? null;
      if (held) keyDown(held);
    }
    if (held || queue.length) frame = requestAnimationFrame(pump);
  };
  return {
    press(spec) {
      queue.push(spec);
      if (!frame) frame = requestAnimationFrame(pump);
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      queue.length = 0;
      if (held) keyUp(held);
      held = null;
    },
  };
}

export interface TextInputOptions {
  /** The game's frame (the keyboard's hidden input lives in it). */
  frame: HTMLElement;
  canvas: HTMLCanvasElement;
  /** Reads the Emscripten file Lua publishes (`TEXT_FILE`), or null while absent. */
  read: () => string | null;
}

/** Wires the tap → keyboard path; returns a function that undoes it. */
export function attachTextInput({ frame, canvas, read }: TextInputOptions): () => void {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'balatro-text-input';
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.inputMode = 'text';
  input.enterKeyHint = 'done';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('data-lpignore', 'true');
  frame.appendChild(input);
  const keys = createKeyQueue();

  let release: number | null = null;
  const stopWatching = () => {
    if (release !== null) window.clearInterval(release);
    release = null;
  };
  // The game lets go of the field itself (Enter, Escape, a tap elsewhere): put the keyboard away.
  const watch = () => {
    stopWatching();
    release = window.setInterval(() => {
      const state = parseTextState(read() ?? '');
      if (document.activeElement !== input) return stopWatching();
      if (!state.hooked) {
        input.blur();
        stopWatching();
      }
    }, 150);
  };

  const onTouchEnd = (e: TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    const state = parseTextState(read() ?? '');
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const slop = 12;
    if (
      !hitsField(
        state.field,
        (touch.clientX - box.left) / box.width,
        (touch.clientY - box.top) / box.height,
        slop / box.width,
        slop / box.height,
      )
    )
      return;
    // Inside the tap's own handler: the only place iOS raises the keyboard from.
    input.focus({ preventScroll: true });
    watch();
  };
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });

  // Keys the keyboard types never reach the game as themselves (autocorrect, IME and
  // dead keys make `keydown` unreliable on phones): the text comes from `input`, the
  // named keys from keydown, and both become the presses SDL expects.
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    const spec = keyForNamed(e.key);
    if (!spec) return;
    e.preventDefault();
    keys.press(spec);
    if (spec.key === 'Enter') input.blur();
  };
  const swallow = (e: Event) => e.stopPropagation();
  const onInput = () => {
    const text = input.value;
    input.value = '';
    for (const ch of text) {
      const spec = keyForChar(ch);
      if (spec) keys.press(spec);
    }
  };
  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('keyup', swallow);
  input.addEventListener('keypress', swallow);
  input.addEventListener('input', onInput);
  input.addEventListener('blur', stopWatching);

  // The keyboard covers the lower part of the page: while it is up the frame is only
  // as tall as what is left, so the game lays itself out above it (balatro.css).
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    const open = document.activeElement === input && vv.height < window.innerHeight - 80;
    if (open) {
      frame.style.setProperty('--balatro-vvh', `${Math.round(vv.height)}px`);
      frame.dataset.keyboard = '';
      window.scrollTo(0, 0);
    } else {
      frame.style.removeProperty('--balatro-vvh');
      delete frame.dataset.keyboard;
    }
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  input.addEventListener('blur', fit);
  input.addEventListener('focus', fit);

  return () => {
    keys.stop();
    stopWatching();
    canvas.removeEventListener('touchend', onTouchEnd);
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    input.remove();
    frame.style.removeProperty('--balatro-vvh');
    delete frame.dataset.keyboard;
  };
}
