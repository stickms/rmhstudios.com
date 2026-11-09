import { describe, expect, it } from 'vitest';
import { initial, step, type Effect, type Event, type State } from './input-choice';

const idle: State = initial;
const choosing: State = { kind: 'choosing', seq: 1, input: 'mic' };
const failed: State = { kind: 'failed', seq: 1, input: 'mic' };

describe('input chooser: transition table', () => {
  const table: [string, State, Event, State, Effect[]][] = [
    [
      'idle + choose',
      idle,
      { type: 'choose', input: 'mic' },
      choosing,
      [{ type: 'switch', input: 'mic', token: 1 }],
    ],
    ['idle + a stray answer', idle, { type: 'settled', token: 1, ok: true }, idle, []],
    ['choosing + choose is ignored', choosing, { type: 'choose', input: 'keys' }, choosing, []],
    [
      'choosing + ok',
      choosing,
      { type: 'settled', token: 1, ok: true },
      { kind: 'idle', seq: 1 },
      [],
    ],
    ['choosing + failure', choosing, { type: 'settled', token: 1, ok: false }, failed, []],
    [
      'choosing + an answer for another token',
      choosing,
      { type: 'settled', token: 9, ok: false },
      choosing,
      [],
    ],
    [
      'failed + choose again (e.g. the on-screen keys fallback) clears the failure',
      failed,
      { type: 'choose', input: 'screen' },
      { kind: 'choosing', seq: 2, input: 'screen' },
      [{ type: 'switch', input: 'screen', token: 2 }],
    ],
    ['failed + a late answer', failed, { type: 'settled', token: 1, ok: true }, failed, []],
  ];

  it.each(table)('%s', (_name, from, event, to, fx) => {
    expect(step(from, event)).toEqual({ state: to, effects: fx });
  });
});
