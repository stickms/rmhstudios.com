/**
 * The one note-event contract for the RMH Music learning programme. Every way
 * of playing (microphone pitch detection, a MIDI device, the computer keyboard,
 * the on-screen keys) is wrapped in an `InputAdapter` that emits `NoteEvent`s,
 * so lesson engines, games and the tuner never care where a note came from.
 * Pure types only, client-safe.
 */

/** Where a note came from. */
export type InputSource = 'mic' | 'midi' | 'keys' | 'screen';

export interface NoteEvent {
  type: 'on' | 'off';
  /** MIDI note number (60 = middle C). */
  midi: number;
  /** Strike strength, 0..1 (MIDI velocity / 127). */
  velocity: number;
  /** Caller-supplied timestamp in ms on the `performance.now()` clock. */
  time: number;
  source: InputSource;
  /** Deviation from `midi` in cents; only meaningful for the mic source. */
  cents?: number;
}

export type NoteListener = (e: NoteEvent) => void;

export interface InputAdapter {
  readonly source: InputSource;
  start(): Promise<void>;
  stop(): void;
  /** Register a listener; returns a function that removes it. */
  subscribe(l: NoteListener): () => void;
}
