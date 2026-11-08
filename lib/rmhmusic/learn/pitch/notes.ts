/**
 * Equal-temperament note maths for the RMH Music learning programme: converting
 * between frequencies, MIDI note numbers and note names, and measuring how far
 * a pitch sits from the nearest note. Pure and client-safe, so the tuner, ear
 * training and lesson checks all share one definition of "in tune" (A4 = 440 Hz).
 */

const A4_FREQ = 440;
const A4_MIDI = 69;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NATURAL_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Fractional MIDI note number for a frequency in Hz (440 Hz → 69). */
export function freqToMidi(freq: number): number {
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ);
}

/** Frequency in Hz for a (possibly fractional) MIDI note number. */
export function midiToFreq(midi: number): number {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Scientific pitch name for a MIDI note (60 → "C4"); `flats` spells accidentals as flats. */
export function midiToName(midi: number, opts?: { flats?: boolean }): string {
  const rounded = Math.round(midi);
  const names = opts?.flats ? FLAT_NAMES : SHARP_NAMES;
  const octave = Math.floor(rounded / 12) - 1;
  return `${names[((rounded % 12) + 12) % 12]}${octave}`;
}

/** MIDI note number for a name like "C4", "F#3" or "Db4"; null if it isn't a valid note name. */
export function nameToMidi(name: string): number | null {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!match) return null;
  const [, letter, accidental, octave] = match;
  const accidentalShift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + NATURAL_SEMITONES[letter.toUpperCase()] + accidentalShift;
}

/** The nearest equal-tempered note to `freq`, and how many cents (−50…50) `freq` is off it. */
export function nearestNote(freq: number): { midi: number; name: string; cents: number } {
  const exact = freqToMidi(freq);
  const midi = Math.round(exact);
  return { midi, name: midiToName(midi), cents: (exact - midi) * 100 };
}

/** Signed distance in cents from `freqA` up to `freqB` (440 → 880 is 1200). */
export function centsBetween(freqA: number, freqB: number): number {
  return 1200 * Math.log2(freqB / freqA);
}
