import { describe, expect, it } from 'vitest';
import type { IntervalQuestion } from '../theory/staff-intervals';
import { createStaffIntervalsMachine, isRight, learningStep, step, type Event, type State } from './staff-intervals';

const Q = (answer: IntervalQuestion['answer'], second = 64): IntervalQuestion => ({
  clef: 'treble',
  direction: 'up',
  first: { written: 60, accidental: 0 },
  second: { written: second, accidental: 0 },
  answer,
});
const QUESTIONS = [Q('third'), Q('fifth', 67)];
const say = (name: IntervalQuestion['answer']): Event => ({ type: 'answer', answer: { name } });

function run(learning: boolean, events: Event[]): State {
  const m = createStaffIntervalsMachine(QUESTIONS, learning);
  let s = m.initial;
  for (const e of events) s = m.step(s, e).state;
  return s;
}

describe('the answer', () => {
  it('is right by name, whatever else the notes could be called', () => {
    expect(isRight(Q('third'), { name: 'third' })).toBe(true);
    expect(isRight(Q('third'), { name: 'fourth' })).toBe(false);
    expect(isRight(Q('minor-third'), { name: 'major-third' })).toBe(false);
  });
});

describe('Test mode', () => {
  it('moves on after a wrong answer and keeps the state exactly as the session machine has it', () => {
    const s = run(false, [say('fourth'), { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, correct: 0 });
    expect('misses' in s).toBe(false);
    expect(run(false, [say('third')])).toMatchObject({ kind: 'feedback', right: true, correct: 1 });
  });
});

describe('Learning mode', () => {
  it('asks the same question again after a miss, with the miss remembered', () => {
    expect(run(true, [say('fourth'), { type: 'next' }])).toMatchObject({ kind: 'asking', index: 0, misses: 1 });
  });

  it('scores nothing for a question that took a retry, and goes on once it is right', () => {
    const s = run(true, [say('fourth'), { type: 'next' }, say('third')]);
    expect(s).toMatchObject({ kind: 'feedback', right: true, correct: 0, misses: 1 });
    expect(run(true, [say('fourth'), { type: 'next' }, say('third'), { type: 'next' }])).toMatchObject({
      kind: 'asking',
      index: 1,
      correct: 0,
    });
  });

  it('scores a right first answer, and saves once, with the first-try score, after the last', () => {
    const m = createStaffIntervalsMachine(QUESTIONS, true);
    let s = m.initial;
    const send = (e: Event) => {
      const r = m.step(s, e);
      s = r.state;
      return r.effects;
    };
    send(say('third'));
    send({ type: 'next' });
    send(say('sixth'));
    expect(send({ type: 'next' })).toEqual([]); // wrong: no save, the question returns
    send(say('fifth'));
    const fx = send({ type: 'next' });
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ type: 'complete', attempt: 1 });
    expect(s).toMatchObject({ kind: 'saving', correct: 1, total: 2 });
  });
});

describe('the mode getter', () => {
  it('is read at every event', () => {
    let learning = false;
    const m = createStaffIntervalsMachine(QUESTIONS, () => learning);
    let s = m.step(m.initial, say('fourth')).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 1 }); // Test mode: on
    learning = true;
    s = m.step(s, say('fourth')).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 1, misses: 1 }); // Learning: the same question
  });

  it('exports the two steps it chooses between', () => {
    const a = step(createStaffIntervalsMachine(QUESTIONS).initial, say('fourth')).state;
    const b = learningStep(createStaffIntervalsMachine(QUESTIONS).initial, say('fourth')).state;
    expect(a).toMatchObject({ kind: 'feedback', right: false });
    expect(b).toMatchObject({ kind: 'feedback', right: false, misses: 1 });
  });
});
