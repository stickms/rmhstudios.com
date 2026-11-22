import { describe, expect, it } from 'vitest';
import {
  BEATS_OF,
  createMeterMachine,
  createValueMachine,
  type MeterEvent,
  type MeterState,
  type ValueQuestion,
} from './rhythm';
import type { SessionEvent } from './session';

const VALUES: ValueQuestion[] = [{ value: 'quarter' }, { value: 'half' }];
type ValueEvent = SessionEvent<{ beats: number }>;
const beats = (n: number): ValueEvent => ({ type: 'answer', answer: { beats: n } });

function runValues(learning: boolean | (() => boolean), events: ValueEvent[]) {
  const m = createValueMachine(VALUES, learning);
  let s = m.initial;
  for (const e of events) s = m.step(s, e).state;
  return s;
}

describe('note values', () => {
  it('moves on after a wrong answer in Test mode, and keeps its states as they were', () => {
    const s = runValues(false, [beats(4), { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, correct: 0 });
    expect('misses' in s).toBe(false);
  });

  it('asks the same note again in Learning mode, until it is answered right, and scores nothing for a retry', () => {
    const a = runValues(true, [beats(4), { type: 'next' }]);
    expect(a).toMatchObject({ kind: 'asking', index: 0, misses: 1 });
    const b = runValues(true, [beats(4), { type: 'next' }, beats(BEATS_OF.quarter), { type: 'next' }]);
    expect(b).toMatchObject({ kind: 'asking', index: 1, correct: 0 });
    const c = runValues(true, [beats(BEATS_OF.quarter), { type: 'next' }]);
    expect(c).toMatchObject({ kind: 'asking', index: 1, correct: 1 });
  });

  it('follows a mode getter read at every event', () => {
    let learning = false;
    const m = createValueMachine(VALUES, () => learning);
    let s = m.step(m.initial, beats(4)).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ index: 1 });
    learning = true;
    s = m.step(s, beats(4)).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 1, misses: 1 });
  });
});

const METERS = [{ beatsPerBar: 4 as const }, { beatsPerBar: 3 as const }];
const meter = (n: 3 | 4): MeterEvent => ({ type: 'answer', answer: { beatsPerBar: n } });

function runMeters(learning: boolean | (() => boolean), events: MeterEvent[]): MeterState {
  const m = createMeterMachine(METERS, learning);
  let s = m.initial;
  for (const e of events) s = m.step(s, e).state;
  return s;
}
const HEARD: MeterEvent = { type: 'played', index: 0 };

describe('4/4 versus 3/4', () => {
  it('still cannot be answered before the bar has been heard, in either mode', () => {
    for (const learning of [false, true]) {
      expect(runMeters(learning, [meter(3)])).toMatchObject({ kind: 'asking', index: 0, heard: false });
    }
  });

  it('moves on after a wrong answer in Test mode, the next bar unheard', () => {
    const s = runMeters(false, [HEARD, meter(3), { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, heard: false, correct: 0 });
    expect('misses' in s).toBe(false);
  });

  it('brings the same bar back in Learning mode, already heard, so it can be answered at once', () => {
    const s = runMeters(true, [HEARD, meter(3), { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 0, heard: true, misses: 1 });
    const done = runMeters(true, [HEARD, meter(3), { type: 'next' }, meter(4)]);
    expect(done).toMatchObject({ kind: 'feedback', right: true, correct: 0, misses: 1 });
  });

  it('starts the next bar unheard after a right answer, in Learning mode too', () => {
    const s = runMeters(true, [HEARD, meter(4), { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, heard: false, correct: 1 });
  });

  it('plays a bar again on Replay without touching the state, as before', () => {
    const m = createMeterMachine(METERS, true);
    const r = m.step(m.initial, { type: 'replay' });
    expect(r.state).toBe(m.initial);
    expect(r.effects).toEqual([{ type: 'play', index: 0, beatsPerBar: 4 }]);
    // After a miss the retry can be replayed too.
    let s = m.step(m.initial, HEARD).state;
    s = m.step(s, meter(3)).state;
    s = m.step(s, { type: 'next' }).state;
    expect(m.step(s, { type: 'replay' }).effects).toEqual([{ type: 'play', index: 0, beatsPerBar: 4 }]);
  });

  it('follows a mode getter read at every event', () => {
    let learning = false;
    const m = createMeterMachine(METERS, () => learning);
    let s = m.step(m.initial, HEARD).state;
    s = m.step(s, meter(3)).state;
    learning = true;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 0, heard: true, misses: 1 });
  });
});
