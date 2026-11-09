import { describe, expect, it } from 'vitest';
import { intervalOf, type IntervalName } from '../theory/intervals';
import {
  EAR_QUESTIONS,
  createEarMachine,
  dealQuestions,
  earMachine,
  earPool,
  makeQuestion,
  step,
  type Effect,
  type Event,
  type Question,
  type State,
} from './ear';
import { createRunner } from './runner';

/** A small deterministic generator (mulberry32). */
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

const question = (answer: IntervalName, root = 60): Question => ({
  notes: [root, root + (answer === 'fifth' ? 7 : answer === 'third' ? 4 : 2)],
  answer,
});
const POOL: IntervalName[] = ['second', 'third', 'fifth'];
const ten: Question[] = Array.from({ length: 10 }, (_, i) => question(POOL[i % 3]));

const answer = (name: IntervalName): Event => ({ type: 'answer', answer: { name } });
const played = (index: number): Event => ({ type: 'played', index });
const next: Event = { type: 'next' };
const replay: Event = { type: 'replay' };
const answered = (
  outcome: 'saved' | 'failed' | 'unauthorized' | 'invalid',
  attempt = 1,
): Event => ({
  type: 'answered',
  attempt,
  outcome,
});

/** Hear and answer every question, right for the first `right`. Returns the last step. */
function play(right: number): { state: State; effects: Effect[] } {
  let state = earMachine.initial(ten);
  let effects: Effect[] = [];
  for (let i = 0; i < ten.length; i++) {
    state = step(state, played(i)).state;
    state = step(state, answer(i < right ? ten[i].answer : ('unison' as IntervalName))).state;
    const n = step(state, next);
    state = n.state;
    effects = n.effects;
  }
  return { state, effects };
}

describe('makeQuestion', () => {
  it('is deterministic for a seeded rand', () => {
    const a = makeQuestion(POOL, seeded(7));
    const b = makeQuestion(POOL, seeded(7));
    expect(a).toEqual(b);
  });
  it('asks an interval of the pool, ascending, that intervalOf names back', () => {
    const rand = seeded(1);
    for (let i = 0; i < 300; i++) {
      const q = makeQuestion(POOL, rand);
      expect(POOL).toContain(q.answer);
      expect(q.notes[1]).toBeGreaterThan(q.notes[0]);
      expect(intervalOf(q.notes[0], q.notes[1])).toBe(q.answer);
    }
  });
  it('keeps the root in C3 to C5 and both notes in C2 to C6', () => {
    const rand = seeded(2);
    for (let i = 0; i < 500; i++) {
      const q = makeQuestion(['second', 'third', 'fifth', 'octave'], rand);
      expect(q.notes[0]).toBeGreaterThanOrEqual(48);
      expect(q.notes[0]).toBeLessThanOrEqual(72);
      expect(q.notes[0]).toBeGreaterThanOrEqual(36);
      expect(q.notes[1]).toBeLessThanOrEqual(84);
    }
  });
  it('reaches both ends of the root range with the extreme values of rand', () => {
    expect(makeQuestion(['octave'], () => 0).notes[0]).toBe(48);
    expect(makeQuestion(['octave'], () => 0.999999).notes[0]).toBe(72);
    expect(makeQuestion(['octave'], () => 1).notes[0]).toBe(72);
  });
  it('treats a rand that is not a number as 0', () => {
    expect(makeQuestion(['fifth'], () => Number.NaN).notes).toEqual([48, 55]);
  });
  it('uses a given root, kept inside C2 to C6 with room for the interval', () => {
    expect(makeQuestion(['fifth'], seeded(3), 62).notes).toEqual([62, 69]);
    expect(makeQuestion(['octave'], seeded(3), 100).notes).toEqual([72, 84]);
    expect(makeQuestion(['octave'], seeded(3), 0).notes).toEqual([36, 48]);
  });
  it('picks either size of a third', () => {
    const sizes = new Set<number>();
    const rand = seeded(5);
    for (let i = 0; i < 100; i++) {
      const q = makeQuestion(['third'], rand);
      sizes.add(q.notes[1] - q.notes[0]);
    }
    expect([...sizes].sort()).toEqual([3, 4]);
  });
  it('throws on an empty pool', () => {
    expect(() => makeQuestion([], seeded(1))).toThrow(RangeError);
  });
});

describe('dealQuestions', () => {
  it('deals the count asked, each name about as often, and is deterministic', () => {
    const qs = dealQuestions(['second', 'third'], 10, seeded(9));
    expect(qs).toHaveLength(10);
    const seconds = qs.filter((q) => q.answer === 'second').length;
    expect(seconds).toBe(5);
    expect(dealQuestions(['second', 'third'], 10, seeded(9))).toEqual(qs);
  });
  it('does not alternate a two-name pool in a fixed order', () => {
    // A pattern the learner could answer without listening would be a bug.
    const orders = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      orders.add(
        dealQuestions(['second', 'third'], 10, seeded(seed))
          .map((q) => q.answer[0])
          .join(''),
      );
    }
    expect(orders.size).toBeGreaterThan(10);
  });
  it('is empty for a count of 0 or less', () => {
    expect(dealQuestions(POOL, 0, seeded(1))).toEqual([]);
    expect(dealQuestions(POOL, Number.NaN, seeded(1))).toEqual([]);
  });
});

describe('earPool', () => {
  it('gives each lesson its intervals, and a safe default for an unknown one', () => {
    expect(earPool('ear-second-third')).toEqual(['second', 'third']);
    expect(earPool('ear-fifth-octave')).toEqual(['third', 'fifth', 'octave']);
    expect(earPool('nope').length).toBeGreaterThan(0);
  });
});

describe('ear machine: hearing and answering', () => {
  it('starts asking the first question, not yet heard', () => {
    const s = earMachine.initial(ten);
    expect(s).toEqual({ kind: 'asking', cards: ten, index: 0, correct: 0, heard: false });
    expect(createEarMachine(ten).initial).toEqual(s);
    expect(EAR_QUESTIONS).toBe(10);
  });

  it('ignores an answer to a question the learner has not heard', () => {
    const s = earMachine.initial(ten);
    const r = step(s, answer('second'));
    expect(r.state).toBe(s);
    expect(r.effects).toEqual([]);
  });

  it('accepts the answer once the sound has played for this question', () => {
    const heard = step(earMachine.initial(ten), played(0)).state;
    expect(heard).toMatchObject({ kind: 'asking', heard: true });
    const r = step(heard, answer('second'));
    expect(r.state).toMatchObject({ kind: 'feedback', right: true, correct: 1 });
  });

  it('ignores a "played" for another question or one already heard', () => {
    const s = earMachine.initial(ten);
    expect(step(s, played(3)).state).toBe(s);
    const heard = step(s, played(0)).state;
    expect(step(heard, played(0)).state).toBe(heard);
  });

  it('a wrong answer shows the right one and counts nothing', () => {
    const heard = step(earMachine.initial(ten), played(0)).state;
    const { state } = step(heard, answer('fifth'));
    expect(state).toMatchObject({
      kind: 'feedback',
      right: false,
      correct: 0,
      answer: { name: 'fifth' },
    });
    if (state.kind !== 'feedback') throw new Error('feedback expected');
    expect(state.cards[state.index].answer).toBe('second');
  });

  it('two answers in a row count once', () => {
    let s = step(earMachine.initial(ten), played(0)).state;
    s = step(s, answer('second')).state;
    const again = step(s, answer('second'));
    expect(again.state).toBe(s);
    expect(again.state).toMatchObject({ correct: 1 });
  });

  it('the next question is asked unheard, and needs its own sound', () => {
    let s = step(earMachine.initial(ten), played(0)).state;
    s = step(s, answer('second')).state;
    s = step(s, next).state;
    expect(s).toMatchObject({ kind: 'asking', index: 1, heard: false });
    expect(step(s, answer('third')).state).toBe(s);
  });
});

describe('ear machine: replay', () => {
  it('plays the current question again and changes nothing', () => {
    const s = step(earMachine.initial(ten), played(0)).state;
    const r = step(s, replay);
    expect(r.state).toBe(s);
    expect(r.effects).toEqual([{ type: 'play', index: 0, notes: ten[0].notes }]);
  });

  it('plays the question before it has been heard (that is how it is heard)', () => {
    const s = earMachine.initial(ten);
    const r = step(s, replay);
    expect(r.state).toBe(s);
    expect(r.effects).toHaveLength(1);
  });

  it('is unlimited and never changes the score', () => {
    let s = step(earMachine.initial(ten), played(0)).state;
    for (let i = 0; i < 25; i++) s = step(s, replay).state;
    expect(s).toMatchObject({ kind: 'asking', index: 0, correct: 0, heard: true });
  });

  it('plays the answered question again from the feedback, still changing nothing', () => {
    let s = step(earMachine.initial(ten), played(0)).state;
    s = step(s, answer('third')).state;
    const r = step(s, replay);
    expect(r.state).toBe(s);
    expect(r.effects).toEqual([{ type: 'play', index: 0, notes: ten[0].notes }]);
  });

  it('does nothing once the session is over', () => {
    const { state } = play(10);
    expect(step(state, replay)).toEqual({ state, effects: [] });
  });
});

describe('ear machine: the result', () => {
  it('saves once past the last question, with the score and stars', () => {
    const { state, effects } = play(7);
    expect(state).toEqual({ kind: 'saving', correct: 7, total: 10, attempt: 1 });
    expect(effects).toEqual([{ type: 'complete', attempt: 1, score: 70, stars: 1 }]);
  });

  it('saved, signed out, failed then Retry with attempt 2', () => {
    const { state } = play(10);
    expect(step(state, answered('saved')).state).toEqual({
      kind: 'saved',
      correct: 10,
      total: 10,
      stars: 3,
    });
    expect(step(state, answered('unauthorized')).state.kind).toBe('signed-out');
    const failed = step(state, answered('failed')).state;
    expect(failed.kind).toBe('failed');
    const retried = step(failed, { type: 'retry' });
    expect(retried.state).toMatchObject({ kind: 'saving', attempt: 2 });
    expect(retried.effects).toEqual([{ type: 'complete', attempt: 2, score: 100, stars: 3 }]);
  });

  it('ignores a stale save answer', () => {
    const { state } = play(10);
    const failed = step(state, answered('failed')).state;
    const retried = step(failed, { type: 'retry' }).state;
    expect(step(retried, answered('saved', 1)).state).toBe(retried);
  });

  it('runs on the shared runner: a double tap in one tick answers once', () => {
    const run = createRunner(createEarMachine(ten));
    run.send({ type: 'played', index: 0 });
    run.send(answer('second'));
    run.send(answer('second'));
    expect(run.get()).toMatchObject({ kind: 'feedback', correct: 1 });
  });
});
