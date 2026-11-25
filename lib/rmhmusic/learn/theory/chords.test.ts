import { describe, expect, it } from 'vitest';
import {
  CHORDS,
  CHORD_QUALITIES,
  chordNotes,
  MAJOR_ROOTS,
  MINOR_ROOTS,
  NATURAL_ROOTS,
  hasDoubleAccidental,
  inversionOf,
  rootsFor,
  spellTriad,
  triadsOf,
  MIN_CHORD_PITCH_CLASSES,
  chordQuality,
  isChordAttempt,
  matchesChord,
  pitchClasses,
} from './chords';
import { LETTERS, noteGlyphs, noteId, pitchClass, type SpelledNote } from './scales';

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
  it('is false when a played note, or the root, is not a number', () => {
    expect(matchesChord([60, 64, 67, Number.NaN], 60, 'major')).toBe(false);
    expect(matchesChord([60, 64, 67, Infinity], 60, 'major')).toBe(false);
    expect(matchesChord([60, 64, 67], Number.NaN, 'major')).toBe(false);
    expect(matchesChord([], Number.NaN, 'major')).toBe(false);
    expect(matchesChord([Number.NaN], Number.NaN, 'major')).toBe(false);
  });
});

describe('pitchClasses', () => {
  it('is the sorted set of notes within an octave, negatives included', () => {
    expect(pitchClasses([67, 60, 64, 72])).toEqual([0, 4, 7]);
    expect(pitchClasses([-1])).toEqual([11]);
  });
  it('agrees with chordQuality about a non-note: a list holding one has no pitch classes', () => {
    expect(pitchClasses([60, 64, Number.NaN])).toEqual([]);
    expect(chordQuality([60, 64, 67, Number.NaN])).toBeNull();
    expect(pitchClasses([Infinity])).toEqual([]);
  });
});

describe('isChordAttempt', () => {
  it('needs three distinct pitch classes: fewer is a tap, not an answer', () => {
    expect(MIN_CHORD_PITCH_CLASSES).toBe(3);
    expect(isChordAttempt([])).toBe(false);
    expect(isChordAttempt([60])).toBe(false);
    expect(isChordAttempt([60, 72])).toBe(false); // an octave is one pitch class
    expect(isChordAttempt([60, 64])).toBe(false);
    expect(isChordAttempt([60, 64, 67])).toBe(true);
  });
  it('counts a wrong or a bigger chord as an attempt, and a non-note as none', () => {
    expect(isChordAttempt([60, 62, 63])).toBe(true);
    expect(isChordAttempt([60, 64, 67, 70, 74])).toBe(true);
    expect(isChordAttempt([60, 64, 67, Number.NaN])).toBe(false);
  });
});

const spell = (root: string, quality: Parameters<typeof spellTriad>[1]): string[] =>
  spellTriad(root, quality).map(noteId);

describe('spellTriad', () => {
  it('spells the triads the lessons name', () => {
    expect(spell('C', 'major')).toEqual(['C', 'E', 'G']);
    expect(spell('F#', 'major')).toEqual(['F#', 'A#', 'C#']);
    expect(spell('Db', 'major')).toEqual(['Db', 'F', 'Ab']);
    expect(spell('Ab', 'minor')).toEqual(['Ab', 'Cb', 'Eb']);
    expect(spell('C#', 'minor')).toEqual(['C#', 'E', 'G#']);
    expect(spell('B', 'diminished')).toEqual(['B', 'D', 'F']);
    expect(spell('F', 'diminished')).toEqual(['F', 'Ab', 'Cb']);
    expect(spell('E', 'augmented')).toEqual(['E', 'G#', 'B#']);
    expect(spell('D', 'augmented')).toEqual(['D', 'F#', 'A#']);
  });
  it('spells F♯ major for the glyphs as F♯ A♯ C♯', () => {
    expect(spellTriad('F#', 'major').map(noteGlyphs)).toEqual(['F♯', 'A♯', 'C♯']);
  });
  it('needs a double sharp only where the theory does: B augmented has F𝄪', () => {
    expect(spell('B', 'augmented')).toEqual(['B', 'D#', 'F##']);
    expect(hasDoubleAccidental(spellTriad('B', 'augmented'))).toBe(true);
    expect(hasDoubleAccidental(spellTriad('C', 'major'))).toBe(false);
  });
  it('takes a spelled note or its id, and nothing else', () => {
    expect(spellTriad({ letter: 'G', accidental: 0 }, 'minor').map(noteId)).toEqual(['G', 'Bb', 'D']);
    expect(spellTriad('H', 'major')).toEqual([]);
  });
  it('is right for every root and quality: a third above the last by letter, the right pitch classes', () => {
    const roots: SpelledNote[] = [];
    for (const letter of LETTERS) for (const accidental of [-1, 0, 1]) roots.push({ letter, accidental });
    let count = 0;
    for (const root of roots) {
      for (const quality of CHORD_QUALITIES) {
        const notes = spellTriad(root, quality);
        expect(notes).toHaveLength(3);
        // Each note's letter is two letters (a third) above the last.
        for (let i = 1; i < 3; i++) {
          expect(LETTERS.indexOf((notes[i] as SpelledNote).letter)).toBe(
            (LETTERS.indexOf((notes[i - 1] as SpelledNote).letter) + 2) % 7,
          );
        }
        // And the pitch classes are the quality's stack on the root.
        expect(notes.map(pitchClass)).toEqual(CHORDS[quality].map((s) => (pitchClass(root) + s) % 12));
        count++;
      }
    }
    expect(count).toBe(84);
  });
});

describe('the triad tables', () => {
  it('has twelve major roots and twelve minor roots, one for each pitch class', () => {
    expect(MAJOR_ROOTS.map(pitchClass).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(MINOR_ROOTS.map(pitchClass).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(NATURAL_ROOTS.map(noteId)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(rootsFor('major')).toBe(MAJOR_ROOTS);
    expect(rootsFor('augmented')).toBe(NATURAL_ROOTS);
  });
  it('spells all 48 triads, with no double accidental but B augmented', () => {
    const all = triadsOf(CHORD_QUALITIES);
    expect(all).toHaveLength(12 + 12 + 7 + 7);
    const doubles = all.filter((t) => hasDoubleAccidental(spellTriad(t.root, t.quality)));
    expect(doubles.map((t) => `${noteId(t.root)} ${t.quality}`)).toEqual(['B augmented']);
  });
  it('names F♯ major and not G♭ major, and uses the flat keys A♭, B♭, D♭ and E♭', () => {
    expect(MAJOR_ROOTS.map(noteId)).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
    expect(MINOR_ROOTS.map(noteId)).toEqual(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']);
  });
  it('every triad in the table is recognised by chordQuality and matchesChord on its sounding notes', () => {
    for (const t of triadsOf(CHORD_QUALITIES)) {
      const root = 60 + pitchClass(t.root);
      expect(chordQuality(chordNotes(root, t.quality))).toBe(t.quality);
      expect(matchesChord(chordNotes(root, t.quality), root, t.quality)).toBe(true);
    }
  });
});

describe('inversionOf', () => {
  it('is 0, 1 and 2 for root position, first and second inversion', () => {
    expect(inversionOf([60, 64, 67])).toBe(0);
    expect(inversionOf([64, 67, 72])).toBe(1);
    expect(inversionOf([67, 72, 76])).toBe(2);
    // E G C: the third lowest, so first inversion of C major.
    expect(inversionOf([64, 67, 72])).toBe(1);
  });
  it('works for the minor and diminished triads', () => {
    expect(inversionOf([57, 60, 64])).toBe(0); // A C E
    expect(inversionOf([60, 64, 69])).toBe(1); // C E A
    expect(inversionOf([64, 69, 72])).toBe(2); // E A C
    expect(inversionOf([59, 62, 65])).toBe(0); // B D F
    expect(inversionOf([62, 65, 71])).toBe(1);
    expect(inversionOf([65, 71, 74])).toBe(2);
  });
  it('goes by the lowest note, in any order and with doubled notes', () => {
    expect(inversionOf([67, 64, 60])).toBe(0);
    expect(inversionOf([48, 60, 64, 67, 72])).toBe(0);
    expect(inversionOf([52, 64, 67, 72])).toBe(1);
    expect(inversionOf([55, 60, 64, 79])).toBe(2);
  });
  it('takes the root when it is given, which an augmented triad needs', () => {
    expect(inversionOf([60, 64, 68])).toBeNull();
    expect(inversionOf([60, 64, 68], 0)).toBe(0);
    expect(inversionOf([64, 68, 72], 0)).toBe(1);
    expect(inversionOf([68, 72, 76], 0)).toBe(2);
    expect(inversionOf([64, 67, 72], 0)).toBe(1);
  });
  it('is null for what is not a triad, or a root that is not in it', () => {
    expect(inversionOf([60, 64])).toBeNull();
    expect(inversionOf([60, 64, 67, 71])).toBeNull();
    expect(inversionOf([60, Number.NaN, 67])).toBeNull();
    expect(inversionOf([60, 64, 67], 2)).toBeNull();
    expect(inversionOf([60, 64, 67], Number.NaN)).toBeNull();
  });
  it('agrees with a stack built by hand for every root and quality', () => {
    for (const quality of CHORD_QUALITIES) {
      for (let pc = 0; pc < 12; pc++) {
        const [a, b, c] = chordNotes(48 + pc, quality) as [number, number, number];
        expect(inversionOf([a, b, c], pc)).toBe(0);
        expect(inversionOf([b, c, a + 12], pc)).toBe(1);
        expect(inversionOf([c, a + 12, b + 12], pc)).toBe(2);
      }
    }
  });
});
