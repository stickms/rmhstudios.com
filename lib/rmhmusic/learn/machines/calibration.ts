/**
 * The timing check (LatencyCalibration) as a machine.
 *
 * It replaces a `phase` state, a `running` ref, `clicks`/`responses` refs, a
 * `beat` and a `taps` state and an untracked timer list, which together let a
 * start still awaiting `resume()` carry on after the dialog closed, and left
 * the scheduled clicks sounding after Skip or unmount (review findings).
 *
 *   intro | retry | done ──start──▶ preparing(token) ──prepared ok──▶ (schedule) ──scheduled──▶ running
 *                                     │ prepared not ok ▶ no-audio
 *   running ──tap──▶ running (+response) ──beat──▶ running ──finished──▶ done(ms) | retry
 *   any ──skip / dispose──▶ intro (cancel the audio; skip also closes)
 *
 * The audio is only ever scheduled from `preparing` with a matching token, so
 * a start that resolves after Skip/unmount schedules nothing. Pure.
 */
import { medianOffset } from '../calibration';

/** What a resting view shows: the intro, or the last run's result. */
export type Rest =
  | { kind: 'intro'; seq: number }
  | { kind: 'done'; seq: number; ms: number; beat: number }
  | { kind: 'retry'; seq: number; beat: number };

export type State =
  | Rest
  /** Waiting for sound to resume and the inputs to start; `shown` stays on screen meanwhile. */
  | { kind: 'preparing'; seq: number; token: number; shown: Rest }
  | {
      kind: 'running';
      seq: number;
      token: number;
      clicks: readonly number[];
      responses: readonly number[];
      beat: number;
    }
  | { kind: 'no-audio'; seq: number };

export type Event =
  | { type: 'start' }
  | { type: 'prepared'; token: number; ok: boolean }
  | { type: 'scheduled'; token: number; clicks: readonly number[] }
  | { type: 'beat'; token: number; i: number }
  | { type: 'tap'; time: number }
  | { type: 'finished'; token: number }
  | { type: 'skip' }
  | { type: 'dispose' };

export type Effect =
  /** Resume sound and start the inputs, then answer `prepared`. */
  | { type: 'prepare'; token: number }
  /** Schedule the clicks now, then answer `scheduled` (and later `beat`, `finished`). */
  | { type: 'schedule'; token: number }
  /** Silence every click still to come and clear every timer. */
  | { type: 'cancel-audio' }
  | { type: 'save'; ms: number }
  /** Leave the timing check (back to the input list). */
  | { type: 'close' };

export const initial: Rest = { kind: 'intro', seq: 0 };

const LIMIT_MS = 500;

export function step(s: State, e: Event): { state: State; effects: Effect[] } {
  const same = { state: s, effects: [] as Effect[] };
  switch (e.type) {
    case 'start': {
      if (s.kind !== 'intro' && s.kind !== 'done' && s.kind !== 'retry') return same;
      const token = s.seq + 1;
      return {
        state: { kind: 'preparing', seq: token, token, shown: s },
        effects: [{ type: 'prepare', token }],
      };
    }
    case 'prepared':
      if (s.kind !== 'preparing' || s.token !== e.token) return same;
      return e.ok
        ? { state: s, effects: [{ type: 'schedule', token: s.token }] }
        : { state: { kind: 'no-audio', seq: s.seq }, effects: [] };
    case 'scheduled':
      if (s.kind !== 'preparing' || s.token !== e.token) return same;
      return {
        state: {
          kind: 'running',
          seq: s.seq,
          token: s.token,
          clicks: e.clicks,
          responses: [],
          beat: -1,
        },
        effects: [],
      };
    case 'beat':
      if (s.kind !== 'running' || s.token !== e.token) return same;
      return { state: { ...s, beat: e.i }, effects: [] };
    case 'tap':
      if (s.kind !== 'running') return same;
      return { state: { ...s, responses: [...s.responses, e.time] }, effects: [] };
    case 'finished': {
      if (s.kind !== 'running' || s.token !== e.token) return same;
      const ms = medianOffset([...s.clicks], [...s.responses]);
      if (ms === null) return { state: { kind: 'retry', seq: s.seq, beat: s.beat }, effects: [] };
      return {
        state: {
          kind: 'done',
          seq: s.seq,
          ms: Math.max(-LIMIT_MS, Math.min(LIMIT_MS, ms)),
          beat: s.beat,
        },
        effects: [{ type: 'save', ms }],
      };
    }
    case 'skip':
    case 'dispose': {
      const effects: Effect[] = [{ type: 'cancel-audio' }];
      if (e.type === 'skip') effects.push({ type: 'close' });
      return { state: { kind: 'intro', seq: s.seq }, effects };
    }
    default:
      return unreachable(e);
  }
}

/** The state a screen shows: a run being prepared still shows what was there before. */
export function shown(s: State): Exclude<State, { kind: 'preparing' }> {
  return s.kind === 'preparing' ? s.shown : s;
}

export function transition(s: State, e: Event): State {
  return step(s, e).state;
}

export function effects(prev: State, _next: State, e: Event): Effect[] {
  return step(prev, e).effects;
}

export const calibrationMachine = { initial, step };

function unreachable(x: never): never {
  throw new Error(`calibration: unhandled ${JSON.stringify(x)}`);
}
