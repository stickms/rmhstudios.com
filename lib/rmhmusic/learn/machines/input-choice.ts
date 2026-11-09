/**
 * The input chooser's own lifecycle: idle, switching to one input, or showing
 * why the last choice failed. It replaces a `busy` and a `failed` state that
 * were set in turn around an await. Whether a row is "in use" is not here: it
 * is the hub's phase for that source, read live. Answers carry their token.
 * Pure.
 */
import type { LearnInput } from '../schemas';

export type State =
  | { kind: 'idle'; seq: number }
  | { kind: 'choosing'; seq: number; input: LearnInput }
  | { kind: 'failed'; seq: number; input: LearnInput };

export type Event =
  { type: 'choose'; input: LearnInput } | { type: 'settled'; token: number; ok: boolean };

export type Effect = { type: 'switch'; input: LearnInput; token: number };

export const initial: State = { kind: 'idle', seq: 0 };

export function step(s: State, e: Event): { state: State; effects: Effect[] } {
  switch (e.type) {
    case 'choose': {
      // One switch at a time (the buttons are disabled meanwhile, this makes it a rule).
      if (s.kind === 'choosing') return { state: s, effects: [] };
      const token = s.seq + 1;
      return {
        state: { kind: 'choosing', seq: token, input: e.input },
        effects: [{ type: 'switch', input: e.input, token }],
      };
    }
    case 'settled':
      if (s.kind !== 'choosing' || s.seq !== e.token) return { state: s, effects: [] };
      return {
        state: e.ok ? { kind: 'idle', seq: s.seq } : { kind: 'failed', seq: s.seq, input: s.input },
        effects: [],
      };
    default:
      return unreachable(e);
  }
}

export function transition(s: State, e: Event): State {
  return step(s, e).state;
}

export function effects(prev: State, _next: State, e: Event): Effect[] {
  return step(prev, e).effects;
}

export const inputChoiceMachine = { initial, step };

function unreachable(x: never): never {
  throw new Error(`input-choice: unhandled ${JSON.stringify(x)}`);
}
