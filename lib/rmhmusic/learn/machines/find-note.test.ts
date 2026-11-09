import { describe, expect, it } from 'vitest';
import { FIRST_FRETS, positionsOf } from '../theory/fretboard';
import { createRunner } from './runner';
import {
  FIND_NOTE_TARGETS,
  createFindNoteMachine,
  dealTargets,
  findNoteMachine,
  findNotePool,
  isRight,
  playHintFits,
  step,
  targetStaff,
  type Effect,
  type Event,
  type State,
  type Target,
} from './find-note';

const target = (midi: number): Target => ({ midi });
// E2 A2 D3 G3 B3 E4 (the open strings), then four more: ten targets.
const MIDIS = [40, 45, 50, 55, 59, 64, 40, 45, 50, 55];
const ten = MIDIS.map(target);

const pos = (string: number, fret: number): Event => ({
  type: 'answer',
  answer: { kind: 'position', string, fret },
});
const midi = (m: number): Event => ({ type: 'answer', answer: { kind: 'midi', midi: m } });
const next: Event = { type: 'next' };
const retry: Event = { type: 'retry' };
const answered = (
  outcome: 'saved' | 'failed' | 'unauthorized' | 'invalid',
  attempt = 1,
): Event => ({ type: 'answered', attempt, outcome });

/** Drive a machine through all of `ten`, answering right (by the sounding note) for the first `right`. */
function play(right: number): { state: State; effects: Effect[] } {
  const m = createFindNoteMachine(ten);
  let state = m.initial;
  let effects: Effect[] = [];
  for (let i = 0; i < ten.length; i++) {
    const a = m.step(state, i < right ? midi(ten[i].midi) : midi(ten[i].midi + 1));
    const n = m.step(a.state, next);
    state = n.state;
    effects = n.effects;
  }
  return { state, effects };
}

describe('isRight', () => {
  it('a position is right when it sounds the target, on any string', () => {
    // E4 (64): the open high E, the B string's 5th fret, the G string's 9th.
    expect(isRight(target(64), { kind: 'position', string: 5, fret: 0 })).toBe(true);
    expect(isRight(target(64), { kind: 'position', string: 4, fret: 5 })).toBe(true);
    expect(isRight(target(64), { kind: 'position', string: 3, fret: 9 })).toBe(true);
    expect(isRight(target(64), { kind: 'position', string: 4, fret: 4 })).toBe(false);
    // The same letter an octave away is wrong: the open low E is E2, not E4.
    expect(isRight(target(64), { kind: 'position', string: 0, fret: 0 })).toBe(false);
  });

  it('a position off the board is wrong, never a throw', () => {
    expect(isRight(target(64), { kind: 'position', string: 6, fret: 0 })).toBe(false);
    expect(isRight(target(64), { kind: 'position', string: -1, fret: 0 })).toBe(false);
    expect(isRight(target(40), { kind: 'position', string: 0, fret: -1 })).toBe(false);
    expect(isRight(target(40), { kind: 'position', string: Number.NaN, fret: 0 })).toBe(false);
  });

  it('a midi answer is right only on the exact sounding note', () => {
    expect(isRight(target(40), { kind: 'midi', midi: 40 })).toBe(true);
    // 52 is where the low E is WRITTEN; played, it is a different note.
    expect(isRight(target(40), { kind: 'midi', midi: 52 })).toBe(false);
    expect(isRight(target(40), { kind: 'midi', midi: 41 })).toBe(false);
    expect(isRight(target(40), { kind: 'midi', midi: Number.NaN })).toBe(false);
  });

  it('a position answer and a midi answer that sound the same pitch are both right', () => {
    for (const m of [40, 45, 50, 55, 59, 64, 48, 69]) {
      for (const p of positionsOf(m, FIRST_FRETS)) {
        expect(isRight(target(m), { kind: 'position', ...p })).toBe(true);
      }
      expect(isRight(target(m), { kind: 'midi', midi: m })).toBe(true);
    }
  });
});

describe('find-note machine: asking and feedback', () => {
  it('starts asking the first target with nothing correct', () => {
    expect(findNoteMachine.initial(ten)).toEqual({
      kind: 'asking',
      cards: ten,
      index: 0,
      correct: 0,
    });
    expect(createFindNoteMachine(ten).initial).toEqual(findNoteMachine.initial(ten));
  });

  it('a right position gives feedback{right:true}, keeping the answer', () => {
    const { state, effects } = step(findNoteMachine.initial(ten), pos(0, 0));
    expect(state).toEqual({
      kind: 'feedback',
      cards: ten,
      index: 0,
      correct: 1,
      right: true,
      answer: { kind: 'position', string: 0, fret: 0 },
    });
    expect(effects).toEqual([]);
  });

  it('a wrong one is feedback{right:false} and counts nothing', () => {
    expect(step(findNoteMachine.initial(ten), pos(0, 1)).state).toMatchObject({
      kind: 'feedback',
      right: false,
      correct: 0,
    });
  });

  it('two answers in a row count once (a double tap, a fret tap and a note in one tick)', () => {
    const m = createRunner(createFindNoteMachine(ten));
    m.send(pos(0, 0));
    const after = m.get();
    expect(m.send(pos(0, 0))).toEqual([]);
    expect(m.get()).toBe(after);
    // A wrong second answer from another source does not change the first.
    m.send(midi(41));
    expect(m.get()).toBe(after);
    expect(after).toMatchObject({ kind: 'feedback', correct: 1, right: true });
  });

  it('next is ignored while asking, and answer is ignored in feedback', () => {
    const asking = findNoteMachine.initial(ten);
    expect(step(asking, next)).toEqual({ state: asking, effects: [] });
    const fb = step(asking, midi(41)).state;
    expect(step(fb, midi(40)).state).toBe(fb);
    expect(step(fb, pos(0, 0)).state).toBe(fb);
  });

  it('next moves to the next target, keeping the count', () => {
    const fb = step(findNoteMachine.initial(ten), midi(40)).state;
    expect(step(fb, next)).toEqual({
      state: { kind: 'asking', cards: ten, index: 1, correct: 1 },
      effects: [],
    });
  });
});

describe('find-note machine: finishing', () => {
  it('next after the last target saves once, with score and stars', () => {
    expect(play(8)).toEqual({
      state: { kind: 'saving', correct: 8, total: 10, attempt: 1 },
      effects: [{ type: 'complete', attempt: 1, score: 80, stars: 2 }],
    });
  });

  it('emits exactly one complete across a session of double taps and repeated Next', () => {
    const m = createRunner(createFindNoteMachine(ten));
    const all: Effect[] = [];
    for (const t of ten) {
      all.push(...m.send(midi(t.midi)), ...m.send(midi(t.midi)));
      all.push(...m.send(next), ...m.send(next));
    }
    all.push(...m.send(next), ...m.send(pos(0, 0)));
    expect(all).toEqual([{ type: 'complete', attempt: 1, score: 100, stars: 3 }]);
  });

  it('retries a failed save as a new attempt with the same score, and only from failed', () => {
    const saving: State = { kind: 'saving', correct: 7, total: 10, attempt: 1 };
    const failed = step(saving, answered('failed')).state;
    expect(failed).toEqual({ kind: 'failed', correct: 7, total: 10, attempt: 1 });
    expect(step(failed, retry)).toEqual({
      state: { kind: 'saving', correct: 7, total: 10, attempt: 2 },
      effects: [{ type: 'complete', attempt: 2, score: 70, stars: 1 }],
    });
    expect(step(saving, retry)).toEqual({ state: saving, effects: [] });
    const saved = step(saving, answered('saved')).state;
    expect(saved).toEqual({ kind: 'saved', correct: 7, total: 10, stars: 1 });
    expect(step(saved, retry)).toEqual({ state: saved, effects: [] });
  });

  it('a stale answered (an older attempt) is ignored', () => {
    const failed: State = { kind: 'failed', correct: 7, total: 10, attempt: 1 };
    const second = step(failed, retry).state;
    expect(step(second, answered('saved', 1))).toEqual({ state: second, effects: [] });
    expect(step(second, answered('saved', 2)).state).toMatchObject({ kind: 'saved' });
  });

  it('unauthorized keeps the result as signed-out', () => {
    const saving: State = { kind: 'saving', correct: 7, total: 10, attempt: 1 };
    expect(step(saving, answered('unauthorized')).state).toEqual({
      kind: 'signed-out',
      correct: 7,
      total: 10,
    });
  });
});

describe('target pools and dealing', () => {
  it('guitar, open strings: the six open strings by their sounding pitch', () => {
    expect(findNotePool('keyboard-map', 'guitar')).toEqual([40, 45, 50, 55, 59, 64]);
  });

  it('piano, keyboard layout: the white keys from middle C to B4', () => {
    expect(findNotePool('keyboard-map', 'piano')).toEqual([60, 62, 64, 65, 67, 69, 71]);
  });

  it('guitar, first frets: every natural in frets 0-5, each with a position in reach', () => {
    const pool = findNotePool('fretboard', 'guitar');
    expect(pool[0]).toBe(40);
    expect(pool[pool.length - 1]).toBe(69);
    for (const m of pool) expect(positionsOf(m, FIRST_FRETS).length).toBeGreaterThan(0);
  });

  it('piano, first frets: the naturals of the two octaves from C3', () => {
    expect(findNotePool('fretboard', 'piano')).toEqual([
      48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71,
    ]);
  });

  it('every pool is naturals only', () => {
    for (const mode of ['keyboard-map', 'fretboard'] as const) {
      for (const inst of ['piano', 'guitar'] as const) {
        for (const m of findNotePool(mode, inst)) expect([0, 2, 4, 5, 7, 9, 11]).toContain(m % 12);
      }
    }
  });

  it('deals ten targets from the pool with no back-to-back repeat, deterministically', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let run = 0; run < 50; run++) {
      const pool = findNotePool('keyboard-map', 'guitar');
      const dealt = dealTargets(pool, FIND_NOTE_TARGETS, rand);
      expect(dealt).toHaveLength(10);
      for (let i = 0; i < dealt.length; i++) {
        expect(pool).toContain(dealt[i].midi);
        if (i > 0) expect(dealt[i].midi).not.toBe(dealt[i - 1].midi);
      }
      // All six open strings are seen before any repeats.
      expect(new Set(dealt.slice(0, 6).map((t) => t.midi)).size).toBe(6);
    }
    const a = dealTargets([40, 45, 50], 10, () => 0.3);
    const b = dealTargets([40, 45, 50], 10, () => 0.3);
    expect(a).toEqual(b);
  });

  it('deals nothing from an empty pool or a non-finite count', () => {
    expect(dealTargets([], 10, Math.random)).toEqual([]);
    expect(dealTargets([40], Number.NaN, Math.random)).toEqual([]);
  });
});

describe('targetStaff (Review Focus 6: the guitar is written an octave up)', () => {
  it('draws the guitar an octave above it sounds, on the treble staff', () => {
    expect(targetStaff(40, 'guitar')).toEqual({ clef: 'treble', midi: 52 }); // open low E: E3
    expect(targetStaff(64, 'guitar')).toEqual({ clef: 'treble', midi: 76 }); // open high E: E5
  });

  it('draws the piano at pitch: middle C up on the treble staff, below it on the bass', () => {
    expect(targetStaff(60, 'piano')).toEqual({ clef: 'treble', midi: 60 });
    expect(targetStaff(59, 'piano')).toEqual({ clef: 'bass', midi: 59 });
    expect(targetStaff(48, 'piano')).toEqual({ clef: 'bass', midi: 48 });
  });
});

describe('playHintFits', () => {
  it('never offers "play it" to on-screen input, where the board is the input', () => {
    expect(playHintFits('screen', 60)).toBe(false);
  });

  it('offers it on the microphone and MIDI for any target', () => {
    for (const input of ['mic', 'midi'] as const) {
      expect(playHintFits(input, 40)).toBe(true); // the open low E
      expect(playHintFits(input, 48)).toBe(true);
    }
  });

  it('offers it on the computer keys only for notes those keys play (C4 to C5)', () => {
    expect(playHintFits('keys', 60)).toBe(true);
    expect(playHintFits('keys', 71)).toBe(true);
    expect(playHintFits('keys', 40)).toBe(false); // guitar's open low E
    expect(playHintFits('keys', 55)).toBe(false); // G3
    expect(playHintFits('keys', 48)).toBe(false); // the two-octave lesson's C3
  });

  it('is false for exactly the keys-input targets the home row cannot reach', () => {
    const unreachable = [
      ...findNotePool('fretboard', 'guitar'),
      ...findNotePool('fretboard', 'piano'),
    ].filter((midi) => !playHintFits('keys', midi));
    expect(unreachable.length).toBeGreaterThan(0);
    expect(unreachable.every((midi) => midi < 60 || midi > 72)).toBe(true);
  });
});
