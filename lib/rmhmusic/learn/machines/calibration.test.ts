import { describe, expect, it } from 'vitest';
import { createRunner } from './runner';
import {
  calibrationMachine,
  initial,
  shown,
  step,
  type Effect,
  type Event,
  type State,
} from './calibration';

const CLICKS = [1000, 1600, 2200, 2800, 3400, 4000, 4600, 5200];
const intro = initial;
const preparing: State = { kind: 'preparing', seq: 1, token: 1, shown: intro };
const running: State = {
  kind: 'running',
  seq: 1,
  token: 1,
  clicks: CLICKS,
  responses: [],
  beat: -1,
};
const done: State = { kind: 'done', seq: 1, ms: 80, beat: 7 };
const retry: State = { kind: 'retry', seq: 1, beat: 7 };
const noAudio: State = { kind: 'no-audio', seq: 1 };

const start: Event = { type: 'start' };
const skip: Event = { type: 'skip' };
const dispose: Event = { type: 'dispose' };

describe('calibration: transition table', () => {
  const table: [string, State, Event, State, Effect[]][] = [
    ['intro + start prepares', intro, start, preparing, [{ type: 'prepare', token: 1 }]],
    [
      'done + start (Try again) keeps the result on screen while preparing',
      done,
      start,
      { kind: 'preparing', seq: 2, token: 2, shown: done },
      [{ type: 'prepare', token: 2 }],
    ],
    [
      'retry + start',
      retry,
      start,
      { kind: 'preparing', seq: 2, token: 2, shown: retry },
      [{ type: 'prepare', token: 2 }],
    ],
    ['preparing + start is ignored (no double schedule)', preparing, start, preparing, []],
    ['running + start is ignored', running, start, running, []],
    ['no-audio + start is ignored', noAudio, start, noAudio, []],
    [
      'preparing + prepared ok schedules',
      preparing,
      { type: 'prepared', token: 1, ok: true },
      preparing,
      [{ type: 'schedule', token: 1 }],
    ],
    [
      'preparing + prepared not ok',
      preparing,
      { type: 'prepared', token: 1, ok: false },
      noAudio,
      [],
    ],
    [
      'preparing + a stale prepared',
      preparing,
      { type: 'prepared', token: 9, ok: true },
      preparing,
      [],
    ],
    [
      'intro + a late prepared (after Skip/unmount) schedules nothing',
      intro,
      { type: 'prepared', token: 1, ok: true },
      intro,
      [],
    ],
    [
      'preparing + scheduled runs',
      preparing,
      { type: 'scheduled', token: 1, clicks: CLICKS },
      running,
      [],
    ],
    ['intro + a late scheduled', intro, { type: 'scheduled', token: 1, clicks: CLICKS }, intro, []],
    ['running + beat', running, { type: 'beat', token: 1, i: 3 }, { ...running, beat: 3 }, []],
    ['running + a stale beat', running, { type: 'beat', token: 0, i: 3 }, running, []],
    ['running + tap', running, { type: 'tap', time: 1080 }, { ...running, responses: [1080] }, []],
    ['intro + tap is ignored', intro, { type: 'tap', time: 1 }, intro, []],
    ['done + tap is ignored', done, { type: 'tap', time: 1 }, done, []],
    [
      'running + finished without taps',
      running,
      { type: 'finished', token: 1 },
      { kind: 'retry', seq: 1, beat: -1 },
      [],
    ],
    ['intro + a stale finished', intro, { type: 'finished', token: 1 }, intro, []],
    [
      'running + skip cancels the audio and closes',
      running,
      skip,
      { kind: 'intro', seq: 1 },
      [{ type: 'cancel-audio' }, { type: 'close' }],
    ],
    [
      'preparing + skip',
      preparing,
      skip,
      { kind: 'intro', seq: 1 },
      [{ type: 'cancel-audio' }, { type: 'close' }],
    ],
    [
      'done + skip (Back to inputs)',
      done,
      skip,
      { kind: 'intro', seq: 1 },
      [{ type: 'cancel-audio' }, { type: 'close' }],
    ],
    [
      'running + dispose cancels the audio',
      running,
      dispose,
      { kind: 'intro', seq: 1 },
      [{ type: 'cancel-audio' }],
    ],
    [
      'preparing + dispose',
      preparing,
      dispose,
      { kind: 'intro', seq: 1 },
      [{ type: 'cancel-audio' }],
    ],
  ];

  it.each(table)('%s', (_name, from, event, to, fx) => {
    expect(step(from, event)).toEqual({ state: to, effects: fx });
  });

  it('finished with enough taps saves the median lag', () => {
    const tapped: State = { ...running, beat: 7, responses: CLICKS.map((c) => c + 80) };
    expect(step(tapped, { type: 'finished', token: 1 })).toEqual({
      state: { kind: 'done', seq: 1, ms: 80, beat: 7 },
      effects: [{ type: 'save', ms: 80 }],
    });
    const late: State = {
      ...running,
      clicks: CLICKS.map((c) => c * 10),
      responses: CLICKS.map((c) => c * 10 + 390),
    };
    expect(step(late, { type: 'finished', token: 1 }).state).toMatchObject({
      kind: 'done',
      ms: 390,
    });
  });

  it('shown: a run being prepared shows the view it started from', () => {
    expect(shown(preparing)).toBe(intro);
    expect(shown(running)).toBe(running);
  });
});

describe('calibration: regressions', () => {
  it('unmount during an in-flight start: the late answer schedules no clicks (finding f)', () => {
    const runner = createRunner(calibrationMachine);
    const fx = [
      ...runner.send(start),
      ...runner.send(dispose),
      ...runner.send({ type: 'prepared', token: 1, ok: true }),
    ];
    expect(fx.filter((f) => f.type === 'schedule')).toEqual([]);
    expect(fx).toContainEqual({ type: 'cancel-audio' });
    expect(runner.get().kind).toBe('intro');
  });

  it('Skip during a run cancels the clicks still to come (finding f)', () => {
    const runner = createRunner(calibrationMachine);
    runner.send(start);
    runner.send({ type: 'prepared', token: 1, ok: true });
    runner.send({ type: 'scheduled', token: 1, clicks: CLICKS });
    expect(runner.send(skip)).toEqual([{ type: 'cancel-audio' }, { type: 'close' }]);
    // The end timer of the cancelled run, had it fired, changes nothing.
    expect(runner.send({ type: 'finished', token: 1 })).toEqual([]);
  });

  it('a second run after a result ignores the first run’s stragglers', () => {
    const runner = createRunner(calibrationMachine);
    runner.send(start);
    runner.send({ type: 'prepared', token: 1, ok: true });
    runner.send({ type: 'scheduled', token: 1, clicks: CLICKS });
    runner.send({ type: 'finished', token: 1 });
    runner.send(start);
    runner.send({ type: 'beat', token: 1, i: 5 });
    expect(runner.get()).toMatchObject({ kind: 'preparing', token: 2 });
  });
});
