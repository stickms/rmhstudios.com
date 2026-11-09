/**
 * The first lesson ("play any note") as a machine: listening until the first
 * note, then saving the completion, then saved, failed (Retry) or signed out.
 *
 * It replaces a `played` state, a `save` state and a once-guard ref that had
 * to agree with each other, the last added after a chord's three notes in one
 * tick completed the lesson three times. Here the first `note` moves the
 * machine out of `listening` synchronously, so any later note is ignored by
 * construction, and Retry is only an edge out of `failed`. Answers carry the
 * attempt they answer. Pure.
 */
import type { CompleteOutcome } from './learn-data';

export type State =
  | { kind: 'listening' }
  | { kind: 'saving'; midi: number; attempt: number }
  | { kind: 'saved'; midi: number }
  | { kind: 'failed'; midi: number; attempt: number }
  | { kind: 'signed-out'; midi: number };

export type Event =
  | { type: 'note'; midi: number }
  | { type: 'answered'; attempt: number; outcome: CompleteOutcome }
  | { type: 'retry' };

export type Effect =
  /** The lesson is done listening: let go of the microphone. */
  | { type: 'release-mic' }
  /** Save the completion; answer with `answered` carrying `attempt`. */
  | { type: 'complete'; attempt: number };

export const initial: State = { kind: 'listening' };

export function step(s: State, e: Event): { state: State; effects: Effect[] } {
  switch (e.type) {
    case 'note':
      if (s.kind !== 'listening') return { state: s, effects: [] };
      // The first note wins: its note is the one shown.
      return {
        state: { kind: 'saving', midi: e.midi, attempt: 1 },
        effects: [{ type: 'release-mic' }, { type: 'complete', attempt: 1 }],
      };
    case 'answered':
      if (s.kind !== 'saving' || s.attempt !== e.attempt) return { state: s, effects: [] };
      switch (e.outcome) {
        case 'saved':
          return { state: { kind: 'saved', midi: s.midi }, effects: [] };
        case 'unauthorized':
          return { state: { kind: 'signed-out', midi: s.midi }, effects: [] };
        case 'failed':
        case 'invalid':
          return { state: { kind: 'failed', midi: s.midi, attempt: s.attempt }, effects: [] };
        default:
          return unreachable(e.outcome);
      }
    case 'retry': {
      if (s.kind !== 'failed') return { state: s, effects: [] };
      const attempt = s.attempt + 1;
      return {
        state: { kind: 'saving', midi: s.midi, attempt },
        effects: [{ type: 'complete', attempt }],
      };
    }
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

export const firstNoteMachine = { initial, step };

function unreachable(x: never): never {
  throw new Error(`first-note: unhandled ${JSON.stringify(x)}`);
}
