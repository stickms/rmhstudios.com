import { describe, expect, it } from 'vitest';
import { FIRST_FRETS, positionsOf } from '../theory/fretboard';
import { createFindNoteMachine, learningStep, step, type Answer, type Event, type State } from './find-note';

const TARGETS = [{ midi: 64 }, { midi: 67 }];
const key = (midi: number): Answer => ({ kind: 'midi', midi });
const say = (answer: Answer): Event => ({ type: 'answer', answer });

function run(learning: boolean, events: Event[]): State {
  const m = createFindNoteMachine(TARGETS, learning);
  let s = m.initial;
  for (const e of events) s = m.step(s, e).state;
  return s;
}

describe('the note finder in Test mode', () => {
  it('moves on after a wrong key, with the states exactly as the session machine has them', () => {
    const s = run(false, [say(key(60)), { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, correct: 0 });
    expect('misses' in s).toBe(false);
  });
});

describe('the note finder in Learning mode', () => {
  it('asks the same target again after a wrong key, with the miss remembered', () => {
    expect(run(true, [say(key(60)), { type: 'next' }])).toMatchObject({ kind: 'asking', index: 0, misses: 1 });
  });

  it('accepts a fret tap or a played note alike, and goes on once the target is found', () => {
    // A place on the fretboard that sounds E4, which is target 0 (any string will do).
    const place = positionsOf(64, FIRST_FRETS)[0]!;
    const tapped: Answer = { kind: 'position', string: place.string, fret: place.fret };
    const s = run(true, [say(key(62)), { type: 'next' }, say(tapped), { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, correct: 0 });
    expect(run(true, [say(key(64)), { type: 'next' }])).toMatchObject({ kind: 'asking', index: 1, correct: 1 });
  });

  it('scores nothing for a target that took a retry, and saves once after the last', () => {
    const m = createFindNoteMachine(TARGETS, true);
    let s = m.initial;
    const send = (e: Event) => {
      const r = m.step(s, e);
      s = r.state;
      return r.effects;
    };
    send(say(key(64)));
    send({ type: 'next' });
    send(say(key(60)));
    expect(send({ type: 'next' })).toEqual([]);
    send(say(key(67)));
    const fx = send({ type: 'next' });
    expect(fx).toHaveLength(1);
    expect(s).toMatchObject({ kind: 'saving', correct: 1, total: 2 });
  });
});

describe('the mode getter', () => {
  it('is read at every event', () => {
    let learning = false;
    const m = createFindNoteMachine(TARGETS, () => learning);
    let s = m.step(m.initial, say(key(60))).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ index: 1 });
    learning = true;
    s = m.step(s, say(key(60))).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 1, misses: 1 });
  });

  it('exports the two steps it chooses between', () => {
    const a = step(createFindNoteMachine(TARGETS).initial, say(key(60))).state;
    const b = learningStep(createFindNoteMachine(TARGETS).initial, say(key(60))).state;
    expect(a).toMatchObject({ kind: 'feedback', right: false });
    expect(b).toMatchObject({ kind: 'feedback', right: false, misses: 1 });
  });
});
