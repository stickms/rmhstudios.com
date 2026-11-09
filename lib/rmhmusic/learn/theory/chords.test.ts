import { describe, expect, it } from 'vitest';
import {
  CHORDS,
  CHORD_QUALITIES,
  chordNotes,
  chordQuality,
  matchesChord,
  pitchClasses,
} from './chords';

describe('chordQuality', () => {
  it('names a triad in root position', () => {
    expect(chordQuality([60, 64, 67])).toBe('major');
    expect(chordQuality([60, 63, 67])).toBe('minor');
    expect(chordQuality([60, 63, 66])).toBe('diminished');
    expect(chordQuality([60, 64, 68])).toBe('augmented');
  });
  it('is the same for an inversion', () => {
    expect(chordQuality([67, 72, 76])).toBe('major');
    expect(chordQuality([64, 67, 72])).toBe('major');
    expect(chordQuality([63, 67, 72])).toBe('minor');
  });
  it('does not mind the order, the octave or a doubled note', () => {
    expect(chordQuality([67, 60, 64])).toBe('major');
    expect(chordQuality([48, 64, 79])).toBe('major');
    expect(chordQuality([60, 64, 67, 72])).toBe('major');
  });
  it('is null for anything that is not one of the four triads', () => {
    expect(chordQuality([60, 62, 67])).toBeNull();
    expect(chordQuality([60, 64])).toBeNull();
    expect(chordQuality([60])).toBeNull();
    expect(chordQuality([])).toBeNull();
    expect(chordQuality([60, 64, 67, 71])).toBeNull();
    expect(chordQuality([60, Number.NaN, 67])).toBeNull();
  });
});

describe('chordNotes', () => {
  it('stacks the quality on the root', () => {
    expect(chordNotes(60, 'major')).toEqual([60, 64, 67]);
    expect(chordNotes(62, 'minor')).toEqual([62, 65, 69]);
    expect(chordNotes(50, 'diminished')).toEqual([50, 53, 56]);
    expect(chordNotes(50, 'augmented')).toEqual([50, 54, 58]);
  });
  it('has the four stacks of the plan', () => {
    expect(CHORDS.major).toEqual([0, 4, 7]);
    expect(CHORDS.minor).toEqual([0, 3, 7]);
    expect(CHORDS.diminished).toEqual([0, 3, 6]);
    expect(CHORDS.augmented).toEqual([0, 4, 8]);
    expect([...CHORD_QUALITIES]).toEqual(['major', 'minor', 'diminished', 'augmented']);
  });
});

describe('matchesChord', () => {
  it('matches by pitch class only', () => {
    expect(matchesChord([64, 67, 72], 60, 'major')).toBe(true);
    expect(matchesChord([48, 52, 55], 60, 'major')).toBe(true);
    expect(matchesChord([60, 64, 67, 72, 76], 60, 'major')).toBe(true);
  });
  it('is false for another chord, a missing note or an extra one', () => {
    expect(matchesChord([60, 63, 67], 60, 'major')).toBe(false);
    expect(matchesChord([60, 64], 60, 'major')).toBe(false);
    expect(matchesChord([60, 64, 67, 70], 60, 'major')).toBe(false);
    expect(matchesChord([62, 66, 69], 60, 'major')).toBe(false);
    expect(matchesChord([], 60, 'major')).toBe(false);
  });
  it('ignores a note that is not a number', () => {
    expect(matchesChord([60, 64, 67, Number.NaN], 60, 'major')).toBe(true);
  });
});

describe('pitchClasses', () => {
  it('is the sorted set of notes within an octave, negatives included', () => {
    expect(pitchClasses([67, 60, 64, 72])).toEqual([0, 4, 7]);
    expect(pitchClasses([-1])).toEqual([11]);
  });
});
