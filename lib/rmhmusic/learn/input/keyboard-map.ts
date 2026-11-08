/**
 * Maps the computer keyboard to piano notes: the home row is the white keys
 * (A..K = C4..C5) and the row above holds the black keys, laid out like a real
 * keyboard. Keyed on `KeyboardEvent.code` (physical position), so it works on
 * any layout. Pure and client-safe.
 */

const KEY_TO_MIDI: ReadonlyMap<string, number> = new Map([
  ['KeyA', 60], // C4
  ['KeyW', 61], // C#4
  ['KeyS', 62], // D4
  ['KeyE', 63], // D#4
  ['KeyD', 64], // E4
  ['KeyF', 65], // F4
  ['KeyT', 66], // F#4
  ['KeyG', 67], // G4
  ['KeyY', 68], // G#4
  ['KeyH', 69], // A4
  ['KeyU', 70], // A#4
  ['KeyJ', 71], // B4
  ['KeyK', 72], // C5
]);

/** MIDI note for a `KeyboardEvent.code`, shifted by whole octaves; null if unmapped. */
export function keyToMidi(code: string, octaveShift = 0): number | null {
  const base = KEY_TO_MIDI.get(code);
  return base === undefined ? null : base + octaveShift * 12;
}
