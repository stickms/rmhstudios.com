import { describe, expect, it } from 'vitest';
import { createRunner } from './runner';
import {
  STAFF_CHORD_QUESTIONS,
  createStaffChordsMachine,
  initial,
  isRight,
  staffChordQuestions,
  staffChordTriads,
  staffChordsLesson,
  writeTriad,
  type StaffChordAnswer,
  type StaffChordQuestion,
} from './staff-chords';
import { chordQuality, hasDoubleAccidental, inversionOf, spellTriad } from '../theory/chords';
import { clefStep } from '../theory/clef';
import { parseNote, pitchClass, type SpelledNote } from '../theory/scales';

/** A small seeded generator (mulberry32), so a failure names its seed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROOT = 'chords-read-root-position';
const INV = 'chords-read-inversions';
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

const key = (q: StaffChordQuestion) => `${q.root.letter}${q.root.accidental}${q.quality}`;

describe('staffChordsLesson', () => {
  it('knows the two lessons and nothing else', () => {
    expect(staffChordsLesson(ROOT)).toEqual({
      qualities: ['major', 'minor', 'diminished', 'augmented'],
      inversions: false,
    });
    expect(staffChordsLesson(INV)).toEqual({ qualities: ['major', 'minor'], inversions: true });
    expect(staffChordsLesson('chord-play-c-major')).toBeNull();
    expect(staffChordsLesson('toString')).toBeNull();
  });
  it('draws no triad that needs a double accidental (the sheet has none)', () => {
    for (const id of [ROOT, INV]) {
      const lesson = staffChordsLesson(id);
      if (!lesson) throw new Error(id);
      for (const t of staffChordTriads(lesson)) expect(hasDoubleAccidental(spellTriad(t.root, t.quality))).toBe(false);
    }
    // 12 + 12 + 7 + 6: B augmented (F double sharp) is left out of the reading lesson.
    expect(staffChordTriads(staffChordsLesson(ROOT) as never)).toHaveLength(37);
  });
});

describe('writeTriad', () => {
  it('writes F♯ major as F♯ A♯ C♯: three sharps on F, A and C', () => {
    const q = writeTriad({ root: parseNote('F#') as SpelledNote, quality: 'major' }, 'treble', 0, () => 0);
    expect(q.notes.map((n) => n.accidental)).toEqual([1, 1, 1]);
    expect(q.midis).toEqual([66, 70, 73]);
    expect(q.notes.map((n) => n.written)).toEqual([65, 69, 72]);
  });
  it('lifts the lowest notes an octave for an inversion', () => {
    const c = { root: parseNote('C') as SpelledNote, quality: 'major' as const };
    expect(writeTriad(c, 'treble', 0).midis).toEqual([60, 64, 67]);
    expect(writeTriad(c, 'treble', 1).midis).toEqual([64, 67, 72]); // E G C
    expect(writeTriad(c, 'treble', 2).midis).toEqual([67, 72, 76]); // G C E
  });
});

describe('staffChordQuestions', () => {
  it('is empty for a lesson that is not a chord reading lesson', () => {
    expect(staffChordQuestions('chord-play-c-major', { bass: true })).toEqual([]);
    expect(staffChordQuestions(ROOT, { bass: false }, Math.random, 0)).toEqual([]);
  });
  it('deals ten questions, each quality about equally often, and covers the pool', () => {
    for (const seed of SEEDS) {
      const qs = staffChordQuestions(ROOT, { bass: false }, seeded(seed));
      expect(qs).toHaveLength(STAFF_CHORD_QUESTIONS);
      const counts = new Map<string, number>();
      for (const q of qs) counts.set(q.quality, (counts.get(q.quality) ?? 0) + 1);
      expect([...counts.keys()].sort()).toEqual(['augmented', 'diminished', 'major', 'minor']);
      for (const n of counts.values()) expect(n === 2 || n === 3, `seed ${seed}`).toBe(true);
    }
    // Over many deals every triad of the pool turns up, and only those.
    const seen = new Set<string>();
    for (const seed of SEEDS.concat(Array.from({ length: 200 }, (_, i) => i + 100))) {
      for (const q of staffChordQuestions(ROOT, { bass: false }, seeded(seed))) seen.add(key(q));
    }
    const pool = staffChordTriads(staffChordsLesson(ROOT) as never).map(
      (t) => `${t.root.letter}${t.root.accidental}${t.quality}`,
    );
    expect([...seen].sort()).toEqual([...pool].sort());
  });
  it('never repeats a triad within a lesson', () => {
    for (const seed of SEEDS) {
      for (const id of [ROOT, INV]) {
        const keys = staffChordQuestions(id, { bass: true }, seeded(seed)).map((q) => `${key(q)}`);
        expect(new Set(keys).size, `${id} seed ${seed}`).toBe(keys.length);
      }
    }
  });
  it('asks root position only in the first lesson, and every inversion in the inversion lesson', () => {
    for (const seed of SEEDS) {
      expect(staffChordQuestions(ROOT, { bass: true }, seeded(seed)).every((q) => q.inversion === 0)).toBe(true);
      const inv = staffChordQuestions(INV, { bass: true }, seeded(seed));
      expect(new Set(inv.map((q) => q.inversion))).toEqual(new Set([0, 1, 2]));
      expect(inv.every((q) => q.quality === 'major' || q.quality === 'minor')).toBe(true);
    }
  });
  it('puts every other question on the bass staff on the piano path, and none on the guitar path', () => {
    for (const seed of SEEDS) {
      for (const id of [ROOT, INV]) {
        const piano = staffChordQuestions(id, { bass: true }, seeded(seed));
        expect(piano.map((q) => q.clef)).toEqual(piano.map((_, i) => (i % 2 === 1 ? 'bass' : 'treble')));
        const guitar = staffChordQuestions(id, { bass: false }, seeded(seed));
        expect(guitar.every((q) => q.clef === 'treble')).toBe(true);
      }
    }
  });
  it('writes what it says: spelled by letter, sounding the chord, in the inversion named, on the staff', () => {
    for (const seed of SEEDS) {
      for (const id of [ROOT, INV]) {
        for (const bass of [true, false]) {
          for (const q of staffChordQuestions(id, { bass }, seeded(seed))) {
            const spelled = spellTriad(q.root, q.quality);
            expect(q.notes).toHaveLength(3);
            expect(q.midis).toEqual([...q.midis].sort((a, b) => a - b));
            expect(chordQuality(q.midis)).toBe(q.quality);
            expect(inversionOf(q.midis, pitchClass(q.root)), key(q)).toBe(q.inversion);
            // The written letters are the spelled ones (in some order), each with its own sign.
            const written = q.notes.map((n) => [clefLetter(n.written), n.accidental]).sort();
            const want = spelled.map((n) => [n.letter, n.accidental]).sort();
            expect(written).toEqual(want);
            // Each note sounds its written natural plus its sign.
            q.notes.forEach((n, i) => expect(n.written + n.accidental).toBe(q.midis[i]));
            // Every written note is drawn where the sheet will draw it, not clamped to an edge.
            for (const n of q.notes) {
              const step = clefStep(q.clef, n.written);
              expect(step, `${q.clef} ${key(q)} inversion ${q.inversion}`).toBeGreaterThanOrEqual(-4);
              expect(step).toBeLessThanOrEqual(12);
            }
            // Root, third and fifth stack in thirds on the staff: written steps differ by 2 in root position.
            if (q.inversion === 0) {
              const steps = q.notes.map((n) => clefStep(q.clef, n.written));
              expect(steps[1]! - steps[0]!).toBe(2);
              expect(steps[2]! - steps[1]!).toBe(2);
            }
          }
        }
      }
    }
  });
});

function clefLetter(midi: number): string {
  return ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'][((midi % 12) + 12) % 12] as string;
}

describe('grading', () => {
  const fsharp = writeTriad({ root: parseNote('F#') as SpelledNote, quality: 'major' }, 'treble', 1, () => 0);
  const ans = (a: Partial<StaffChordAnswer>): StaffChordAnswer => ({
    letter: 'F',
    accidental: 1,
    quality: 'major',
    ...a,
  });
  it('is right for the written root, the quality and, when given, the inversion', () => {
    expect(isRight(fsharp, ans({}))).toBe(true);
    expect(isRight(fsharp, ans({ inversion: 1 }))).toBe(true);
  });
  it('is wrong for another letter, another sign, another quality or another inversion', () => {
    expect(isRight(fsharp, ans({ letter: 'G' }))).toBe(false);
    expect(isRight(fsharp, ans({ accidental: 0 }))).toBe(false);
    expect(isRight(fsharp, ans({ accidental: -1 }))).toBe(false);
    expect(isRight(fsharp, ans({ quality: 'minor' }))).toBe(false);
    expect(isRight(fsharp, ans({ inversion: 0 }))).toBe(false);
    expect(isRight(fsharp, ans({ inversion: 2 }))).toBe(false);
  });
  it('does not take G♭ for F♯: the chord is named as it is written', () => {
    expect(isRight(fsharp, ans({ letter: 'G', accidental: -1 }))).toBe(false);
  });
  it('accepts "first inversion" for E G C', () => {
    const c1 = writeTriad({ root: parseNote('C') as SpelledNote, quality: 'major' }, 'treble', 1);
    expect(c1.midis.map((m) => m % 12)).toEqual([4, 7, 0]);
    expect(isRight(c1, { letter: 'C', accidental: 0, quality: 'major', inversion: 1 })).toBe(true);
    expect(isRight(c1, { letter: 'C', accidental: 0, quality: 'major', inversion: 0 })).toBe(false);
  });
});

describe('the machine', () => {
  it('runs a lesson to the end on the shared session: one answer per question, one complete', () => {
    const lesson = staffChordsLesson(ROOT);
    if (!lesson) throw new Error('lesson');
    const questions = staffChordQuestions(ROOT, { bass: true }, seeded(7), 3);
    const machine = createStaffChordsMachine(questions, lesson);
    expect(machine.initial).toEqual(initial(questions));
    const run = createRunner(machine);
    const right = (q: StaffChordQuestion): StaffChordAnswer => ({
      letter: q.root.letter,
      accidental: q.root.accidental as -1 | 0 | 1,
      quality: q.quality,
    });
    let effects = 0;
    for (const q of questions) {
      effects += run.send({ type: 'answer', answer: right(q) }).length;
      effects += run.send({ type: 'next' }).length;
    }
    expect(effects).toBe(1);
    expect(run.get()).toMatchObject({ kind: 'saving', correct: 3, total: 3 });
  });
  it('does not call an inversion lesson answer right without an inversion', () => {
    const lesson = staffChordsLesson(INV);
    if (!lesson) throw new Error('lesson');
    const [q] = staffChordQuestions(INV, { bass: false }, seeded(3), 1) as [StaffChordQuestion];
    const run = createRunner(createStaffChordsMachine([q], lesson));
    run.send({
      type: 'answer',
      answer: { letter: q.root.letter, accidental: q.root.accidental as -1 | 0 | 1, quality: q.quality },
    });
    expect(run.get()).toMatchObject({ kind: 'feedback', right: false });
  });
});
