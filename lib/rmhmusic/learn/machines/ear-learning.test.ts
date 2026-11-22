import { describe, expect, it } from 'vitest';
import {
  createEarMachine,
  learningStep,
  step,
  type Event,
  type Question,
  type State,
} from './ear';

const QS: Question[] = [
  { kind: 'interval', notes: [60, 64], answer: 'third' },
  { kind: 'interval', notes: [60, 67], answer: 'fifth' },
];
const THIRD = { name: 'third' } as const;
const FIFTH = { name: 'fifth' } as const;

function play(
  stepFn: typeof step,
  events: Event[],
  from?: State,
): State {
  let s = from ?? createEarMachine(QS).initial;
  for (const e of events) s = stepFn(s, e).state;
  return s;
}
const heard = (index: number): Event => ({ type: 'played', index });

describe('ear machine in Learning mode', () => {
  it('brings a missed question back already heard, with the miss remembered', () => {
    const s = play(learningStep, [heard(0), { type: 'answer', answer: FIFTH }, { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 0, heard: true, misses: 1, correct: 0 });
  });

  it('can be answered at once on the retry, and a right retry scores nothing', () => {
    const s = play(learningStep, [
      heard(0),
      { type: 'answer', answer: FIFTH },
      { type: 'next' },
      { type: 'answer', answer: THIRD },
    ]);
    expect(s).toMatchObject({ kind: 'feedback', index: 0, right: true, correct: 0, misses: 1 });
    const next = play(learningStep, [{ type: 'next' }], s);
    expect(next).toMatchObject({ kind: 'asking', index: 1, heard: false, correct: 0 });
  });

  it('still needs the sound before the first answer', () => {
    const s = play(learningStep, [{ type: 'answer', answer: THIRD }]);
    expect(s).toMatchObject({ kind: 'asking', index: 0, heard: false });
  });

  it('keeps replay free of any effect on state, before and after a miss', () => {
    const asking = play(learningStep, [heard(0), { type: 'answer', answer: FIFTH }]);
    const r = learningStep(asking, { type: 'replay' });
    expect(r.state).toBe(asking);
    expect(r.effects).toEqual([{ type: 'play', index: 0, kind: 'interval', notes: [60, 64] }]);
  });

  it('scores a right first answer and starts the next question unheard', () => {
    const s = play(learningStep, [heard(0), { type: 'answer', answer: THIRD }, { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, heard: false, correct: 1 });
    expect((s as { misses?: number }).misses).toBeUndefined();
  });

  it('saves once every question was finally right, with the first-try score', () => {
    let s = play(learningStep, [
      heard(0),
      { type: 'answer', answer: THIRD },
      { type: 'next' },
      heard(1),
      { type: 'answer', answer: THIRD },
      { type: 'next' },
      { type: 'answer', answer: FIFTH },
    ]);
    const r = learningStep(s, { type: 'next' });
    s = r.state;
    expect(r.effects).toHaveLength(1);
    expect(s).toMatchObject({ kind: 'saving', correct: 1, total: 2 });
  });
});

describe('ear machine in Test mode', () => {
  it('moves on after a wrong answer, as it always did', () => {
    const s = play(step, [heard(0), { type: 'answer', answer: FIFTH }, { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, heard: false, correct: 0 });
    expect('misses' in s).toBe(false);
  });

  it('follows a mode getter read at every event', () => {
    let learning = false;
    const m = createEarMachine(QS, () => learning);
    let s = m.initial;
    s = m.step(s, heard(0)).state;
    s = m.step(s, { type: 'answer', answer: FIFTH }).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 1 });
    learning = true;
    s = m.step(s, heard(1)).state;
    s = m.step(s, { type: 'answer', answer: THIRD }).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 1, heard: true, misses: 1 });
  });
});
