import { describe, expect, it } from 'vitest';
import { staffStep } from '../staff';
import { clefStep } from './clef';
import {
  QUALITY_NAMES,
  SIZE_NAMES,
  SIZE_STEPS,
  STAFF_INTERVAL_LESSON_IDS,
  describeIntervalMiss,
  impliedSecond,
  isQualityName,
  isSizeName,
  isStaffIntervalName,
  naturalAtStep,
  onTheStaff,
  semitonesBetween,
  semitonesOf,
  sizesOfQuality,
  soundsAs,
  spellings,
  staffIntervalLesson,
  startingNotes,
  stepsBetween,
  type IntervalDirection,
  type IntervalQuestion,
} from './staff-intervals';

const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const CLEFS = ['treble', 'bass'] as const;
const DIRECTIONS: IntervalDirection[] = ['up', 'down'];

describe('names', () => {
  it('has seven sizes and twelve qualities, one per semitone, and tells them apart', () => {
    expect(SIZE_NAMES).toHaveLength(7);
    expect(QUALITY_NAMES).toHaveLength(12);
    QUALITY_NAMES.forEach((n, i) => expect(semitonesOf(n)).toBe(i + 1));
    expect(isSizeName('third') && !isQualityName('third')).toBe(true);
    expect(isQualityName('minor-third') && !isSizeName('minor-third')).toBe(true);
    expect(isStaffIntervalName('tritone')).toBe(true);
    for (const bad of ['unison', 'Third', '', null, undefined, 3]) expect(isStaffIntervalName(bad)).toBe(false);
  });

  it('writes every quality across the staff steps its size says, and a tritone either of two', () => {
    for (const q of QUALITY_NAMES) {
      const sizes = sizesOfQuality(q);
      expect(sizes.length).toBeGreaterThan(0);
      // The semitones of a size's natural intervals bracket the quality's: 2 semitones can be a second, not a fourth.
      for (const s of sizes) expect(Math.abs(semitonesOf(q) - SIZE_STEPS[s] * 1.7)).toBeLessThan(3);
    }
    expect(sizesOfQuality('tritone')).toEqual(['fourth', 'fifth']);
    expect(sizesOfQuality('perfect-fifth')).toEqual(['fifth']);
  });
});

describe('the staff', () => {
  it('turns a diatonic step back into the natural written there', () => {
    for (let m = 36; m <= 96; m++) {
      if (!NATURAL_PCS.has(m % 12)) continue;
      expect(naturalAtStep(staffStep(m))).toBe(m);
    }
    expect(naturalAtStep(staffStep(60) + 1)).toBe(62);
    expect(naturalAtStep(staffStep(71) + 1)).toBe(72);
    expect(naturalAtStep(staffStep(60) - 1)).toBe(59);
  });

  it('starts only on naturals that sit within two ledger lines of the clef', () => {
    for (const clef of CLEFS) {
      const notes = startingNotes(clef);
      expect(notes.length).toBeGreaterThan(10);
      for (const m of notes) {
        expect(NATURAL_PCS.has(m % 12)).toBe(true);
        expect(onTheStaff(clef, m)).toBe(true);
        const s = clefStep(clef, m);
        expect(s).toBeGreaterThanOrEqual(-4);
        expect(s).toBeLessThanOrEqual(12);
      }
    }
    expect(startingNotes('treble')).toContain(64); // E4: the bottom line
    expect(startingNotes('bass')).toContain(43); // G2: the bass staff's bottom line
  });
});

describe('spellings', () => {
  const asQuestion = (
    clef: 'treble' | 'bass',
    direction: IntervalDirection,
    name: never,
    s: { first: never; second: never },
  ) => ({ clef, direction, answer: name, first: s.first, second: s.second }) as unknown as IntervalQuestion;

  it('writes every size, both ways, on both staves, a size apart by staff steps and all natural', () => {
    for (const clef of CLEFS)
      for (const dir of DIRECTIONS)
        for (const name of SIZE_NAMES) {
          const all = spellings(clef, name, dir, false);
          expect(all.length, `${clef} ${dir} ${name}`).toBeGreaterThan(0);
          for (const s of all) {
            const q = asQuestion(clef, dir, name as never, s as never);
            expect(stepsBetween(q)).toBe(SIZE_STEPS[name]);
            expect(s.first.accidental).toBe(0);
            expect(s.second.accidental).toBe(0);
            expect(onTheStaff(clef, s.first.written) && onTheStaff(clef, s.second.written)).toBe(true);
            // Going up the second note is higher.
            expect(Math.sign(s.second.written - s.first.written)).toBe(dir === 'up' ? 1 : -1);
          }
        }
  });

  it('writes every quality with the semitones it names, and the size it is written across', () => {
    for (const accidentals of [false, true])
      for (const clef of CLEFS)
        for (const dir of DIRECTIONS)
          for (const name of QUALITY_NAMES) {
            const all = spellings(clef, name, dir, accidentals);
            // With naturals only, every quality exists on a clef (E-F is a minor second, F-B a tritone, ...).
            expect(all.length, `${accidentals} ${clef} ${dir} ${name}`).toBeGreaterThan(0);
            for (const s of all) {
              const q = asQuestion(clef, dir, name as never, s as never);
              expect(semitonesBetween(q), `${name} ${JSON.stringify(s)}`).toBe(semitonesOf(name));
              const sizes = sizesOfQuality(name).map((z) => SIZE_STEPS[z]);
              expect(sizes).toContain(stepsBetween(q));
              expect(Math.abs(s.second.accidental)).toBeLessThanOrEqual(1);
              if (!accidentals) expect(s.second.accidental).toBe(0);
              expect(s.first.accidental).toBe(0);
              expect(onTheStaff(clef, s.second.written)).toBe(true);
            }
          }
  });

  it('only adds a sharp or a flat when asked to, and then really does', () => {
    const plain = spellings('treble', 'major-third', 'up', false);
    const rich = spellings('treble', 'major-third', 'up', true);
    expect(rich.length).toBeGreaterThan(plain.length);
    expect(rich.some((s) => s.second.accidental !== 0)).toBe(true);
    // C up to E is a natural major third; E up to G sharp needs a sharp.
    expect(plain).toContainEqual({ first: { written: 60, accidental: 0 }, second: { written: 64, accidental: 0 } });
    expect(rich).toContainEqual({ first: { written: 64, accidental: 0 }, second: { written: 68 - 1, accidental: 1 } });
  });

  it('knows the textbook naturals', () => {
    const has = (name: never, first: number, second: number, dir: IntervalDirection = 'up') =>
      spellings('treble', name, dir, false).some((s) => s.first.written === first && s.second.written === second);
    expect(has('minor-second' as never, 64, 65)).toBe(true); // E F
    expect(has('major-second' as never, 60, 62)).toBe(true); // C D
    expect(has('tritone' as never, 65, 71)).toBe(true); // F B: an augmented fourth
    expect(has('tritone' as never, 71, 65, 'down')).toBe(true); // B down to F: a diminished fifth
    expect(has('perfect-fifth' as never, 60, 67)).toBe(true);
    expect(has('major-seventh' as never, 60, 71)).toBe(true); // C B
    expect(has('minor-seventh' as never, 62, 72)).toBe(true); // D C
    expect(has('major-second' as never, 62, 60, 'down')).toBe(true);
  });
});

describe('an answer that was not the right one', () => {
  const q: IntervalQuestion = {
    clef: 'treble',
    direction: 'up',
    first: { written: 60, accidental: 0 }, // C4
    second: { written: 64, accidental: 0 }, // E4: a major third
    answer: 'major-third',
  };

  it('draws the second note the answer would have written, from the same start and way', () => {
    expect(impliedSecond(q, 'perfect-fifth')).toEqual({ written: 67, accidental: 0 }); // G4
    expect(impliedSecond(q, 'minor-third')).toEqual({ written: 64, accidental: -1 }); // E flat
    expect(impliedSecond(q, 'major-second')).toEqual({ written: 62, accidental: 0 });
    expect(impliedSecond(q, 'fifth')).toEqual({ written: 67, accidental: 0 });
    expect(impliedSecond({ ...q, direction: 'down' }, 'fourth')).toEqual({ written: 55, accidental: 0 }); // G3
  });

  it('always has something to draw, even for a quality no one accidental can spell', () => {
    const n = impliedSecond({ ...q, first: { written: 71, accidental: 0 } }, 'minor-seventh');
    expect(Number.isFinite(n.written)).toBe(true);
    expect(soundsAs(impliedSecond(q, 'tritone'))).toBe(60 + 6);
  });

  it('says how far off it was: in steps for sizes, in semitones for qualities, and which way', () => {
    expect(describeIntervalMiss('third', 'fifth')).toEqual({ unit: 'steps', n: 2, wider: true });
    expect(describeIntervalMiss('fifth', 'fourth')).toEqual({ unit: 'steps', n: 1, wider: false });
    expect(describeIntervalMiss('major-third', 'minor-third')).toEqual({ unit: 'semitones', n: 1, wider: false });
    expect(describeIntervalMiss('perfect-fourth', 'perfect-fifth')).toEqual({ unit: 'semitones', n: 2, wider: true });
    expect(describeIntervalMiss('third', 'third')).toBeNull();
  });
});

describe('the lessons', () => {
  it('lists five, each with names of its own tier, no repeats and something to ask', () => {
    expect(STAFF_INTERVAL_LESSON_IDS).toHaveLength(5);
    for (const id of STAFF_INTERVAL_LESSON_IDS) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(id.length).toBeLessThanOrEqual(64);
      const l = staffIntervalLesson(id)!;
      expect(l, id).not.toBeNull();
      expect(new Set(l.pool).size).toBe(l.pool.length);
      for (const n of l.pool) expect(l.tier === 'size' ? isSizeName(n) : isQualityName(n), `${id}: ${n}`).toBe(true);
      expect(l.directions.length).toBeGreaterThan(0);
      expect(l.clefs.length).toBeGreaterThan(0);
      for (const clef of l.clefs)
        for (const dir of l.directions)
          for (const n of l.pool)
            expect(spellings(clef, n, dir, l.accidentals).length, `${id} ${clef} ${dir} ${n}`).toBeGreaterThan(0);
    }
  });

  it('starts by size, up only, on the treble staff, and asks quality only later', () => {
    const tiers = STAFF_INTERVAL_LESSON_IDS.map((id) => staffIntervalLesson(id)!.tier);
    expect(tiers).toEqual(['size', 'size', 'size', 'quality', 'quality']);
    const first = staffIntervalLesson(STAFF_INTERVAL_LESSON_IDS[0]!)!;
    expect(first.directions).toEqual(['up']);
    expect(first.clefs).toEqual(['treble']);
    expect(first.accidentals).toBe(false);
    // Only the last lesson writes sharps and flats.
    expect(STAFF_INTERVAL_LESSON_IDS.filter((id) => staffIntervalLesson(id)!.accidentals)).toEqual([
      'intervals-read-quality-wider',
    ]);
  });

  it('knows nothing of other lessons, and is not fooled by inherited property names', () => {
    expect(staffIntervalLesson('staff-treble-notes')).toBeNull();
    expect(staffIntervalLesson('toString')).toBeNull();
    expect(staffIntervalLesson('__proto__')).toBeNull();
  });
});
