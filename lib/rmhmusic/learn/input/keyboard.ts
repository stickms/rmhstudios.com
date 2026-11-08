/**
 * Computer-keyboard input: the home row plays piano notes (see
 * `keyboard-map.ts`). Thin on purpose — the key-to-note table is pure and
 * tested elsewhere. Client-only: `window` is touched inside `start()`, never
 * at module load, so SSR is safe.
 *
 * Releases are looked up from the keys that are actually down, not recomputed
 * from the code, so a note can never be left sounding if the octave shift
 * differs between press and release; `stop()` and window blur release anything
 * still held.
 */
import type { InputAdapter, NoteEvent, NoteListener } from './events';
import { keyToMidi } from './keyboard-map';

const KEY_VELOCITY = 0.8;

/** True when typing here should not play notes (form fields, rich text). */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

export function createKeyboardInput(opts: { octaveShift?: number } = {}): InputAdapter {
  const octaveShift = opts.octaveShift ?? 0;
  const listeners = new Set<NoteListener>();
  const emit = (e: NoteEvent) => {
    for (const l of [...listeners]) l(e);
  };

  /** `KeyboardEvent.code` -> the MIDI note that key turned on. */
  const pressed = new Map<string, number>();
  let running = false;

  const release = (code: string) => {
    const midi = pressed.get(code);
    if (midi === undefined) return;
    pressed.delete(code);
    emit({ type: 'off', midi, velocity: 0, time: performance.now(), source: 'keys' });
  };

  const releaseAll = () => {
    for (const code of [...pressed.keys()]) release(code);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    if (pressed.has(e.code)) return;
    const midi = keyToMidi(e.code, octaveShift);
    if (midi === null) return;
    pressed.set(e.code, midi);
    emit({ type: 'on', midi, velocity: KEY_VELOCITY, time: performance.now(), source: 'keys' });
  };

  // Not gated by modifiers or target: a key that went down must always come up.
  const onKeyUp = (e: KeyboardEvent) => release(e.code);

  return {
    source: 'keys',

    async start() {
      if (running) return;
      running = true;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', releaseAll);
    },

    stop() {
      if (!running) return;
      running = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      releaseAll();
    },

    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
