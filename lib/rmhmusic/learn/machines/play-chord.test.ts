import { describe, expect, it } from 'vitest';
import { chordNotes } from '../theory/chords';
import { createRunner } from './runner';
import {
  createPlayChordMachine,
  playChordMachine,
  isKeyedChordLesson,
  isRight,
  playChordQuestions,
  step,
  type ChordQuestion,
  type Event,
} from './play-chord';

const cMajor: ChordQuestion = {
  root: 60,
  quality: 'major',
};
const three = playChordQuestions('chord-play-c-major');

const play = (...midis: number[]): Event => ({
  type: 'answer',
  answer: {
    midis,
  },
});
const next: Event = {
  type: 'next',
};

describe('playChordQuestions', () => {
  it('asks C major first, then two more major chords, on natural notes only', () => {
    expect(three[0]).toEqual(cMajor);
    expect(three).toHaveLength(3);
    for (const q of three) {
      expect(q.quality).toBe('major');
      for (const s of [0, 4, 7]) expect([0, 2, 4, 5, 7, 9, 11]).toContain((q.root + s) % 12);
    }
  });
});

describe('playChordQuestions: the chords in every key', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const sameChord = (a: ChordQuestion, b: ChordQuestion) => a.root === b.root && a.quality === b.quality;

  it('keeps the first lesson exactly as it was: three major chords, no spelling, whatever the random source', () => {
    expect(playChordQuestions('chord-play-c-major')).toEqual([
      { root: 60, quality: 'major' },
      { root: 65, quality: 'major' },
      { root: 67, quality: 'major' },
    ]);
    expect(playChordQuestions('chord-play-c-major', seeded(5))).toEqual(three);
    for (const q of three) expect(q).not.toHaveProperty('spelled');
  });

  it('asks all twelve major and all twelve minor triads, each once, spelled', () => {
    const qs = playChordQuestions('chords-play-major-minor', seeded(1));
    expect(qs).toHaveLength(24);
    expect(qs.filter((q) => q.quality === 'major')).toHaveLength(12);
    expect(qs.filter((q) => q.quality === 'minor')).toHaveLength(12);
    for (const quality of ['major', 'minor'] as const) {
      expect(new Set(qs.filter((q) => q.quality === quality).map((q) => q.root % 12)).size).toBe(12);
    }
    expect(qs.every((q) => q.spelled !== undefined)).toBe(true);
    const fsharp = qs.find((q) => q.quality === 'major' && q.root % 12 === 6);
    expect(fsharp?.spelled).toEqual({ letter: 'F', accidental: 1 });
  });

  it('asks the diminished and augmented triads on the seven natural roots', () => {
    const qs = playChordQuestions('chords-play-dim-aug', seeded(2));
    expect(qs).toHaveLength(14);
    for (const quality of ['diminished', 'augmented'] as const) {
      const roots = qs.filter((q) => q.quality === quality).map((q) => q.spelled?.letter);
      expect([...roots].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
      for (const q of qs.filter((x) => x.quality === quality)) expect(q.spelled?.accidental).toBe(0);
    }
  });

  it('shuffles with the random source it is given, and the same one gives the same order', () => {
    const a = playChordQuestions('chords-play-major-minor', seeded(9));
    const b = playChordQuestions('chords-play-major-minor', seeded(9));
    const c = playChordQuestions('chords-play-major-minor', seeded(10));
    expect(a).toEqual(b);
    expect(a.every((q, i) => sameChord(q, c[i] as ChordQuestion))).toBe(false);
  });

  it('answers F♯ A♯ C♯ in any order or octave as F♯ major, and nothing else as it', () => {
    const q = playChordQuestions('chords-play-major-minor', seeded(1)).find(
      (x) => x.quality === 'major' && x.spelled?.letter === 'F' && x.spelled.accidental === 1,
    ) as ChordQuestion;
    for (const midis of [
      [66, 70, 73],
      [70, 73, 78], // A♯ C♯ F♯
      [58, 61, 66],
      [66, 70, 73, 78],
    ]) {
      expect(isRight(q, { midis }), midis.join()).toBe(true);
    }
    expect(isRight(q, { midis: [66, 69, 73] })).toBe(false); // F♯ minor
    expect(isRight(q, { midis: [67, 71, 74] })).toBe(false); // G major
  });

  it('every question of the keyed lessons is graded right by its own notes', () => {
    for (const id of ['chords-play-major-minor', 'chords-play-dim-aug']) {
      for (const q of playChordQuestions(id, seeded(3))) {
        expect(isRight(q, { midis: chordNotes(q.root, q.quality) }), id).toBe(true);
        expect(isRight(q, { midis: chordNotes(q.root, q.quality).map((m) => m + 12) }), id).toBe(true);
      }
    }
  });

  it('knows which lessons are keyed', () => {
    expect(isKeyedChordLesson('chords-play-major-minor')).toBe(true);
    expect(isKeyedChordLesson('chords-play-dim-aug')).toBe(true);
    expect(isKeyedChordLesson('chord-play-c-major')).toBe(false);
    expect(isKeyedChordLesson('toString')).toBe(false);
  });
});

describe('play-chord machine', () => {
  it('starts asking the first chord', () => {
    expect(playChordMachine.initial(three)).toEqual({
      kind: 'asking',
      cards: three,
      index: 0,
      correct: 0,
    });
    expect(createPlayChordMachine(three).initial).toEqual(playChordMachine.initial(three));
  });

  it('any voicing of the chord is right: inversion, another octave, a doubled note', () => {
    for (const midis of [
      [60, 64, 67],
      [64, 67, 72],
      [48, 52, 55],
      [60, 64, 67, 72],
      [67, 60, 64],
    ]) {
      const r = step(playChordMachine.initial(three), play(...midis));
      expect(r.state, midis.join()).toMatchObject({
        kind: 'feedback',
        right: true,
        correct: 1,
      });
    }
  });

  it('a wrong or extra note is wrong, and keeps what was played', () => {
    for (const midis of [
      [60, 63, 67],
      [60, 64, 67, 70],
      [60, 62, 65],
    ]) {
      const r = step(playChordMachine.initial(three), play(...midis));
      expect(r.state, midis.join()).toMatchObject({
        kind: 'feedback',
        right: false,
        correct: 0,
      });
      if (r.state.kind === 'feedback') expect(r.state.answer.midis).toEqual(midis);
    }
  });

  it('a lone tap or two notes is not an answer: nothing is graded and the chord stays asked', () => {
    const start = playChordMachine.initial(three);
    for (const midis of [[], [60], [60, 72], [60, 64], [60, 64, 76]]) {
      const r = step(start, play(...midis));
      expect(r.state, midis.join()).toBe(start);
      expect(r.effects).toEqual([]);
    }
    // ...and the chord can still be answered afterwards.
    expect(step(start, play(60, 64, 67)).state).toMatchObject({
      kind: 'feedback',
      right: true,
    });
  });

  it('two answers in a row count once', () => {
    const a = step(playChordMachine.initial(three), play(60, 64, 67)).state;
    expect(step(a, play(60, 64, 67)).state).toBe(a);
  });

  it('saves once past the last chord, and Retry saves again', () => {
    const answers = [play(60, 64, 67), play(65, 69, 72), play(67, 71, 74)];
    let state = playChordMachine.initial(three);
    let effects: unknown[] = [];
    for (const a of answers) {
      state = step(state, a).state;
      const n = step(state, next);
      state = n.state;
      effects = n.effects;
    }
    expect(state).toEqual({
      kind: 'saving',
      correct: 3,
      total: 3,
      attempt: 1,
    });
    expect(effects).toEqual([
      {
        type: 'complete',
        attempt: 1,
        score: 100,
        stars: 3,
      },
    ]);
    const failed = step(state, {
      type: 'answered',
      attempt: 1,
      outcome: 'failed',
    }).state;
    expect(
      step(failed, {
        type: 'retry',
      }).effects,
    ).toEqual([
      {
        type: 'complete',
        attempt: 2,
        score: 100,
        stars: 3,
      },
    ]);
  });

  it('runs on the shared runner: a chord in one tick answers once', () => {
    const run = createRunner(createPlayChordMachine(three));
    run.send(play(60, 64, 67));
    run.send(play(60, 64));
    expect(run.get()).toMatchObject({
      kind: 'feedback',
      right: true,
      correct: 1,
    });
  });
});
