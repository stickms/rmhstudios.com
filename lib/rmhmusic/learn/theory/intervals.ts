/**
 * The intervals the ear lessons name: the distance between two notes, in plain words. A name may
 * cover a minor and a major size (a third is 3 or 4 semitones); the ear lessons do not ask which.
 *
 * Phase 2 leaves out the minor second (1 semitone) and the tritone (6), which are hard to tell
 * apart by ear without a reference tune, so `intervalOf` answers `null` for them and the lessons'
 * pools never offer them. Pure; client-safe.
 */

export type IntervalName =
  'unison' | 'second' | 'third' | 'fourth' | 'fifth' | 'sixth' | 'seventh' | 'octave';

/** The names, narrowest first. */
export const INTERVAL_NAMES: readonly IntervalName[] = [
  'unison',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'octave',
];

/** `semitones`: every size the name covers; `label`: the English word, in lower case so it reads inside a sentence. */
export const INTERVALS: Record<IntervalName, { semitones: number[]; label: string }> = {
  unison: { semitones: [0], label: 'unison' },
  second: { semitones: [2], label: 'second' },
  third: { semitones: [3, 4], label: 'third' },
  fourth: { semitones: [5], label: 'fourth' },
  fifth: { semitones: [7], label: 'fifth' },
  sixth: { semitones: [8, 9], label: 'sixth' },
  seventh: { semitones: [10, 11], label: 'seventh' },
  octave: { semitones: [12], label: 'octave' },
};

/**
 * The interval between two pitches, whichever is higher, or null when it is not one of
 * {@link INTERVALS} (a minor second, a tritone, wider than an octave, or not a note).
 */
export function intervalOf(a: number, b: number): IntervalName | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const size = Math.abs(Math.round(b) - Math.round(a));
  for (const name of INTERVAL_NAMES) {
    if (INTERVALS[name].semitones.includes(size)) return name;
  }
  return null;
}
