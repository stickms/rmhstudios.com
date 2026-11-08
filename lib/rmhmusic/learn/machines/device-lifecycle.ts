/**
 * The lifecycle of something that takes time to start and can be stopped at
 * any moment: an input source in the hub, and the microphone and MIDI
 * adapters themselves (a permission prompt sits between "start" and "started").
 *
 * Every race found in review lived here as flags: a stop during a pending
 * start that left the mic recording, a start queued behind a cancelled one,
 * stop-start-stop, an error left over from a cancelled start. As a machine:
 *
 * - `idle` → `start` → `starting(run)`: the shell launches run `run`.
 * - `starting` → `stop` → `cancelling(run, restart: null)`: the user's stop
 *   wins; the shell tells the device at once, and the run's answer, when it
 *   comes, only unwinds (release what it acquired, never "active").
 * - `cancelling` → `start` → `cancelling(run, restart)`: a fresh run is
 *   queued behind the one unwinding, and launched when it settles; another
 *   `stop` drops it again.
 * - `starting` → `started(run)` → `active`; `failed(run)` → `idle` with the
 *   error recorded. A cancelled run's failure records nothing.
 * - Answers carry their run number, so a stale one (a run that was cancelled
 *   and superseded) is ignored by the machine, not by a counter outside it.
 *
 * Callers of `start` are answered by run: `join(run)` means "this caller's
 * promise settles with run `run`", and `answer(run, …)` settles them. Pure.
 */

export type Phase = 'idle' | 'starting' | 'active' | 'stopping';

export type State =
  | { kind: 'idle'; seq: number; error: Error | null }
  | { kind: 'starting'; seq: number; run: number; error: Error | null }
  /** A stop arrived while `run` was starting; `restart` is a run queued behind it. */
  | { kind: 'cancelling'; seq: number; run: number; restart: number | null; error: Error | null }
  | { kind: 'active'; seq: number; run: number };

export type Event =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'started'; run: number }
  | { type: 'failed'; run: number; error: Error };

export type Effect =
  /** Begin run `run` (the hub subscribes first, then calls the device's start). */
  | { type: 'launch'; run: number }
  /** This `start` caller is answered when run `run` is. */
  | { type: 'join'; run: number }
  /** This `start` caller is answered now: the device is already running. */
  | { type: 'answer-now' }
  /** Tell the device to stop (release what it holds or is about to be handed). */
  | { type: 'stop-device' }
  /** Stop listening to the device. */
  | { type: 'unsubscribe' }
  /** Settle every caller joined to run `run`. */
  | { type: 'answer'; run: number; error: Error | null };

export const initial: State = { kind: 'idle', seq: 0, error: null };

/** What the outside world sees: a cancelled start with a fresh one queued is still "starting". */
export function phase(s: State): Phase {
  switch (s.kind) {
    case 'idle':
      return 'idle';
    case 'starting':
      return 'starting';
    case 'cancelling':
      return s.restart === null ? 'stopping' : 'starting';
    case 'active':
      return 'active';
    default:
      return unreachable(s);
  }
}

/** The error the last real (uncancelled) start failed with, until a start succeeds. */
export function lastError(s: State): Error | null {
  return s.kind === 'active' ? null : s.error;
}

/** True while `run` is the start the user still wants (an adapter checks this after each await). */
export function isWanted(s: State, run: number): boolean {
  return s.kind === 'starting' && s.run === run;
}

export interface Step {
  state: State;
  effects: Effect[];
}

/** The next state and the effects the shell must perform, in order. Total and pure. */
export function step(s: State, e: Event): Step {
  switch (e.type) {
    case 'start':
      switch (s.kind) {
        case 'idle': {
          const run = s.seq + 1;
          return {
            state: { kind: 'starting', seq: run, run, error: s.error },
            effects: [
              { type: 'launch', run },
              { type: 'join', run },
            ],
          };
        }
        case 'starting':
          return { state: s, effects: [{ type: 'join', run: s.run }] };
        case 'cancelling': {
          if (s.restart !== null) return { state: s, effects: [{ type: 'join', run: s.restart }] };
          const restart = s.seq + 1;
          return {
            state: { ...s, seq: restart, restart },
            effects: [{ type: 'join', run: restart }],
          };
        }
        case 'active':
          return { state: s, effects: [{ type: 'answer-now' }] };
        default:
          return unreachable(s);
      }

    case 'stop':
      switch (s.kind) {
        case 'idle':
          return { state: s, effects: [] };
        case 'starting':
          return {
            state: { kind: 'cancelling', seq: s.seq, run: s.run, restart: null, error: s.error },
            effects: [{ type: 'stop-device' }],
          };
        case 'cancelling':
          return {
            state: { ...s, restart: null },
            effects:
              s.restart === null
                ? [{ type: 'stop-device' }]
                : [{ type: 'stop-device' }, { type: 'answer', run: s.restart, error: null }],
          };
        case 'active':
          // Stop before unsubscribing: stopping releases held notes, and those `off` events must still be heard.
          return {
            state: { kind: 'idle', seq: s.seq, error: null },
            effects: [{ type: 'stop-device' }, { type: 'unsubscribe' }],
          };
        default:
          return unreachable(s);
      }

    case 'started':
    case 'failed': {
      if ((s.kind !== 'starting' && s.kind !== 'cancelling') || s.run !== e.run) {
        return { state: s, effects: [] };
      }
      if (s.kind === 'starting') {
        return e.type === 'started'
          ? {
              state: { kind: 'active', seq: s.seq, run: s.run },
              effects: [{ type: 'answer', run: s.run, error: null }],
            }
          : {
              state: { kind: 'idle', seq: s.seq, error: e.error },
              effects: [{ type: 'unsubscribe' }, { type: 'answer', run: s.run, error: e.error }],
            };
      }
      // Cancelling: the device acquired (or failed to acquire) what nobody wants any more.
      const unwind: Effect[] =
        e.type === 'started'
          ? [{ type: 'stop-device' }, { type: 'unsubscribe' }]
          : [{ type: 'unsubscribe' }];
      unwind.push({ type: 'answer', run: s.run, error: null });
      if (s.restart === null) {
        return { state: { kind: 'idle', seq: s.seq, error: s.error }, effects: unwind };
      }
      return {
        state: { kind: 'starting', seq: s.seq, run: s.restart, error: s.error },
        effects: [...unwind, { type: 'launch', run: s.restart }],
      };
    }

    default:
      return unreachable(e);
  }
}

/** The next state alone. */
export function transition(s: State, e: Event): State {
  return step(s, e).state;
}

/** The effects of taking `e` from `prev` (`next` is implied by the pair; kept for the shared machine shape). */
export function effects(prev: State, _next: State, e: Event): Effect[] {
  return step(prev, e).effects;
}

function unreachable(x: never): never {
  throw new Error(`device-lifecycle: unhandled ${JSON.stringify(x)}`);
}
