/**
 * Collecting a chord: the notes of one chord arrive as separate `on` events, a few tens of
 * milliseconds apart. The first note opens a window of {@link CHORD_WINDOW_MS}; notes that arrive
 * inside it (by their own `performance.now()` times) are the chord; later ones are late. The
 * screen arms one timer when the window opens and asks for `take()` when it ends. Pure.
 *
 * Only notes from the on-screen keys, the computer keys and MIDI count. The microphone hears one
 * note at a time, so it can never play a chord; its notes are ignored here (the lesson says so
 * and offers to switch input, and never marks a microphone player wrong).
 */
import type { NoteEvent } from './events';

/** From the first note: the time the others have to arrive. */
export const CHORD_WINDOW_MS = 600;

export type WindowNote = Pick<NoteEvent, 'type' | 'midi' | 'time' | 'source'>;

export type PushResult = 'opened' | 'added' | 'late' | 'ignored';

export interface ChordWindow {
  /** Feed every note event. `opened`: start the timer; `late`: after the window, not collected. */
  push(e: WindowNote): PushResult;
  /** The collected pitches in the order they came, and close the window. */
  take(): number[];
  /** Forget everything. */
  reset(): void;
}

export function createChordWindow(windowMs = CHORD_WINDOW_MS): ChordWindow {
  let start: number | null = null;
  let notes: number[] = [];
  return {
    push(e) {
      if (e.type !== 'on' || e.source === 'mic') return 'ignored';
      if (!Number.isFinite(e.midi) || !Number.isFinite(e.time)) return 'ignored';
      if (start === null) {
        start = e.time;
        notes = [e.midi];
        return 'opened';
      }
      if (e.time - start >= windowMs) return 'late';
      if (!notes.includes(e.midi)) notes.push(e.midi);
      return 'added';
    },
    take() {
      const out = notes;
      start = null;
      notes = [];
      return out;
    },
    reset() {
      start = null;
      notes = [];
    },
  };
}
