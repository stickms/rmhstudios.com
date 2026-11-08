import { describe, expect, it } from 'vitest';
import { createRunner } from './runner';
import { firstNoteMachine, initial, step, type Effect, type Event, type State } from './first-note';

const listening: State = initial;
const saving: State = { kind: 'saving', midi: 64, attempt: 1 };
const failed: State = { kind: 'failed', midi: 64, attempt: 1 };
const saved: State = { kind: 'saved', midi: 64 };
const signedOut: State = { kind: 'signed-out', midi: 64 };

const note: Event = { type: 'note', midi: 60 };
const retry: Event = { type: 'retry' };
const answered = (
  outcome: 'saved' | 'failed' | 'unauthorized' | 'invalid',
  attempt = 1,
): Event => ({
  type: 'answered',
  attempt,
  outcome,
});

describe('first-note lesson: transition table', () => {
  const table: [string, State, Event, State, Effect[]][] = [
    [
      'listening + note',
      listening,
      note,
      { kind: 'saving', midi: 60, attempt: 1 },
      [{ type: 'release-mic' }, { type: 'complete', attempt: 1 }],
    ],
    ['listening + answered (nothing asked)', listening, answered('saved'), listening, []],
    ['listening + retry', listening, retry, listening, []],
    ['saving + note is ignored', saving, note, saving, []],
    ['saving + saved', saving, answered('saved'), saved, []],
    ['saving + failed', saving, answered('failed'), failed, []],
    ['saving + invalid reads as failed', saving, answered('invalid'), failed, []],
    ['saving + unauthorized', saving, answered('unauthorized'), signedOut, []],
    [
      'saving + an answer for another attempt is ignored',
      saving,
      answered('failed', 2),
      saving,
      [],
    ],
    ['saving + retry is ignored', saving, retry, saving, []],
    [
      'failed + retry saves again',
      failed,
      retry,
      { kind: 'saving', midi: 64, attempt: 2 },
      [{ type: 'complete', attempt: 2 }],
    ],
    ['failed + note is ignored', failed, note, failed, []],
    ['failed + a late answer is ignored', failed, answered('saved'), failed, []],
    ['saved + note', saved, note, saved, []],
    ['saved + retry', saved, retry, saved, []],
    ['signed-out + retry', signedOut, retry, signedOut, []],
    ['signed-out + note', signedOut, note, signedOut, []],
  ];

  it.each(table)('%s', (_name, from, event, to, fx) => {
    expect(step(from, event)).toEqual({ state: to, effects: fx });
  });
});

describe('first-note lesson: regressions', () => {
  it('two (three) note events in one tick complete the lesson once, showing the first note', () => {
    const runner = createRunner(firstNoteMachine);
    const effects = [60, 64, 67].flatMap((midi) => runner.send({ type: 'note', midi }));
    expect(effects.filter((e) => e.type === 'complete')).toHaveLength(1);
    expect(runner.get()).toEqual({ kind: 'saving', midi: 60, attempt: 1 });
  });

  it('a failed save then Retry (pressed twice) completes once more, then saves', () => {
    const runner = createRunner(firstNoteMachine);
    runner.send(note);
    runner.send(answered('failed'));
    const fx = [...runner.send(retry), ...runner.send(retry)];
    expect(fx).toEqual([{ type: 'complete', attempt: 2 }]);
    runner.send(answered('saved', 2));
    expect(runner.get()).toEqual({ kind: 'saved', midi: 60 });
  });

  it('the runner notifies subscribers only when the state changes', () => {
    const runner = createRunner(firstNoteMachine);
    let calls = 0;
    const off = runner.subscribe(() => calls++);
    runner.send(retry);
    expect(calls).toBe(0);
    runner.send(note);
    runner.send(note);
    expect(calls).toBe(1);
    off();
    runner.send(answered('saved'));
    expect(calls).toBe(1);
  });
});
