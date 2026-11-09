import { describe, expect, it } from 'vitest';
import {
  initial,
  isWanted,
  lastError,
  phase,
  step,
  type Effect,
  type Event,
  type State,
} from './device-lifecycle';

const boom = new Error('denied');
const idle: State = initial;
const idleWithError: State = { kind: 'idle', seq: 1, error: boom };
const starting: State = { kind: 'starting', seq: 1, run: 1, error: null };
const cancelling: State = { kind: 'cancelling', seq: 1, run: 1, restart: null, error: null };
const cancellingRestart: State = { kind: 'cancelling', seq: 2, run: 1, restart: 2, error: null };
const active: State = { kind: 'active', seq: 1, run: 1 };

const start: Event = { type: 'start' };
const stop: Event = { type: 'stop' };
const started = (run: number): Event => ({ type: 'started', run });
const failed = (run: number): Event => ({ type: 'failed', run, error: boom });

/** Run events from a state; return the final state and every effect, in order. */
function run(from: State, events: Event[]): { state: State; effects: Effect[] } {
  let state = from;
  const effects: Effect[] = [];
  for (const e of events) {
    const next = step(state, e);
    state = next.state;
    effects.push(...next.effects);
  }
  return { state, effects };
}

describe('device lifecycle: transition table', () => {
  const table: [string, State, Event, State, Effect[]][] = [
    [
      'idle + start',
      idle,
      start,
      starting,
      [
        { type: 'launch', run: 1 },
        { type: 'join', run: 1 },
      ],
    ],
    [
      'idle (after a failure) + start keeps the error until it succeeds',
      idleWithError,
      start,
      { kind: 'starting', seq: 2, run: 2, error: boom },
      [
        { type: 'launch', run: 2 },
        { type: 'join', run: 2 },
      ],
    ],
    ['idle + stop does not touch the device', idle, stop, idle, []],
    ['idle + stale started', idle, started(1), idle, []],
    ['idle + stale failed', idle, failed(1), idle, []],

    [
      'starting + start joins the run in flight',
      starting,
      start,
      starting,
      [{ type: 'join', run: 1 }],
    ],
    [
      'starting + stop cancels and tells the device now',
      starting,
      stop,
      cancelling,
      [{ type: 'stop-device' }],
    ],
    ['starting + started', starting, started(1), active, [{ type: 'answer', run: 1, error: null }]],
    [
      'starting + failed records the error',
      starting,
      failed(1),
      { kind: 'idle', seq: 1, error: boom },
      [{ type: 'unsubscribe' }, { type: 'answer', run: 1, error: boom }],
    ],
    ['starting + an answer for another run is ignored', starting, started(7), starting, []],

    [
      'cancelling + start queues a fresh run',
      cancelling,
      start,
      cancellingRestart,
      [{ type: 'join', run: 2 }],
    ],
    ['cancelling + stop again', cancelling, stop, cancelling, [{ type: 'stop-device' }]],
    [
      'cancelling + started releases what it acquired',
      cancelling,
      started(1),
      { kind: 'idle', seq: 1, error: null },
      [{ type: 'stop-device' }, { type: 'unsubscribe' }, { type: 'answer', run: 1, error: null }],
    ],
    [
      'cancelling + failed records nothing',
      cancelling,
      failed(1),
      { kind: 'idle', seq: 1, error: null },
      [{ type: 'unsubscribe' }, { type: 'answer', run: 1, error: null }],
    ],

    [
      'cancelling(restart) + start joins the queued run',
      cancellingRestart,
      start,
      cancellingRestart,
      [{ type: 'join', run: 2 }],
    ],
    [
      'cancelling(restart) + stop drops the queued run',
      cancellingRestart,
      stop,
      { kind: 'cancelling', seq: 2, run: 1, restart: null, error: null },
      [{ type: 'stop-device' }, { type: 'answer', run: 2, error: null }],
    ],
    [
      'cancelling(restart) + started unwinds, then launches the queued run',
      cancellingRestart,
      started(1),
      { kind: 'starting', seq: 2, run: 2, error: null },
      [
        { type: 'stop-device' },
        { type: 'unsubscribe' },
        { type: 'answer', run: 1, error: null },
        { type: 'launch', run: 2 },
      ],
    ],
    [
      'cancelling(restart) + failed unwinds, then launches the queued run',
      cancellingRestart,
      failed(1),
      { kind: 'starting', seq: 2, run: 2, error: null },
      [
        { type: 'unsubscribe' },
        { type: 'answer', run: 1, error: null },
        { type: 'launch', run: 2 },
      ],
    ],
    [
      'cancelling(restart) + an answer for the queued run is ignored',
      cancellingRestart,
      started(2),
      cancellingRestart,
      [],
    ],

    ['active + start answers now', active, start, active, [{ type: 'answer-now' }]],
    [
      'active + stop stops before unsubscribing',
      active,
      stop,
      { kind: 'idle', seq: 1, error: null },
      [{ type: 'stop-device' }, { type: 'unsubscribe' }],
    ],
    ['active + stale started', active, started(1), active, []],
    ['active + stale failed', active, failed(1), active, []],
  ];

  it.each(table)('%s', (_name, from, event, to, fx) => {
    expect(step(from, event)).toEqual({ state: to, effects: fx });
  });
});

describe('device lifecycle: derived views', () => {
  it('phase: a cancelled start with a fresh one queued is still starting', () => {
    expect(phase(idle)).toBe('idle');
    expect(phase(starting)).toBe('starting');
    expect(phase(cancelling)).toBe('stopping');
    expect(phase(cancellingRestart)).toBe('starting');
    expect(phase(active)).toBe('active');
  });

  it('lastError is cleared by a success, kept through a retry', () => {
    expect(lastError(idleWithError)).toBe(boom);
    expect(lastError(step(idleWithError, start).state)).toBe(boom);
    expect(lastError(run(idleWithError, [start, started(2)]).state)).toBeNull();
  });

  it('isWanted: only the run in flight and not cancelled', () => {
    expect(isWanted(starting, 1)).toBe(true);
    expect(isWanted(starting, 2)).toBe(false);
    expect(isWanted(cancelling, 1)).toBe(false);
    expect(isWanted(active, 1)).toBe(false);
  });
});

describe('device lifecycle: regressions', () => {
  it('stop-start-stop during a pending start leaves nothing live', () => {
    const r = run(idle, [start, stop, start, stop, started(1)]);
    expect(r.state.kind).toBe('idle');
    expect(r.effects.filter((e) => e.type === 'launch')).toHaveLength(1);
    // The acquired device is released once the prompt is answered.
    expect(r.effects.at(-3)).toEqual({ type: 'stop-device' });
  });

  it('a stop during a pending start releases the device when it is handed over', () => {
    const r = run(idle, [start, stop]);
    expect(r.effects).toContainEqual({ type: 'stop-device' });
    const settle = step(r.state, started(1));
    expect(settle.state.kind).toBe('idle');
    expect(settle.effects).toContainEqual({ type: 'stop-device' });
  });

  it('a start after a failed start works', () => {
    const r = run(idle, [start, failed(1), start, started(2)]);
    expect(r.state).toEqual({ kind: 'active', seq: 2, run: 2 });
    expect(lastError(r.state)).toBeNull();
  });

  it('stop, start (no second stop) restarts once the cancelled run unwinds', () => {
    const r = run(idle, [start, stop, start, started(1), started(2)]);
    expect(r.state).toEqual({ kind: 'active', seq: 2, run: 2 });
  });

  it('the cancelled run answering late after a restart is ignored', () => {
    const r = run(idle, [start, stop, start, failed(1), started(1)]);
    expect(r.state).toEqual({ kind: 'starting', seq: 2, run: 2, error: null });
  });
});
