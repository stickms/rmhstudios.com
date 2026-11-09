/**
 * Tapping the beat as a machine: Start (a tap, so the browser lets sound begin), a count-in of
 * four clicks, then sixteen beats the learner taps along with, scored by `scoring/timing.ts`, then
 * the session lifecycle of `session.ts` (saving, then saved, failed with Retry, or signed out; one
 * `complete` effect per attempt; a stale save answer ignored). Pure: it holds no clock and no
 * audio. The screen runs the metronome and reports what it hears:
 *
 * - `prepared` once sound is awake and the metronome started (or `ok: false`: it could not);
 * - `beat` as each click is HEARD (the screen waits for the click's time), numbered from the
 *   first count-in click, 0;
 * - `tap` with the note event's own timestamp (never a clock read here or in a handler);
 * - `finished`, after the last beat and a short tail ({@link tailMs}), with the scheduled time of
 *   each scored beat (`Metronome.beatTimes()`); `lost` when sound stops mid-run, the tab is hidden
 *   or the window left for long enough that timers throttle, or the run's beats are not all there.
 *
 * Every event but `start` carries or is checked against the run's `token`, so a late answer from a
 * run the learner abandoned (sound lost, Start pressed again) changes nothing.
 *
 * **Taps count only in `tapping`.** That state opens on the LAST count-in click, not on the first
 * scored beat: a learner who allows for their latency taps a little early, and that first tap must
 * not be lost. The count-in's earlier clicks ignore taps; `tapScore` ignores whatever falls more
 * than 200 ms before the first scored beat, so a tap on the last count-in click itself costs
 * nothing. `finished` is accepted once, in `tapping`, so the lesson completes exactly once however
 * many timers fire. **A finish with anything but all {@link BEATS} (finite) beat times is a run
 * that did not happen** (a click was skipped by a stalled timer): it is treated as `lost`, never
 * scored on the beats that happen to be there.
 */
import { starsFor, type Stars } from '../scoring/stars';
import { effectiveLatencyMs, tapScore } from '../scoring/timing';
import type { CompleteOutcome } from './learn-data';
import type { Machine } from './runner';

/** Clicks before the first scored beat. */
export const COUNT_IN = 4;
/** Beats the learner taps along with. */
export const BEATS = 16;
/** The tempo (beats per minute). */
export const BPM = 80;
/** How long after the last scored beat the run waits for a late tap (ms). */
export const TAIL_MS = 250;
/**
 * The longest the run waits after the last beat (ms): less than one beat (750 ms at {@link BPM}),
 * so the run is stopped before the next click could sound. (The metronome is also told to
 * schedule no click past the last, so this is the second lock on the same door.)
 */
export const MAX_TAIL_MS = 600;

/**
 * The wait after the last scored beat for a late tap: {@link TAIL_MS} and the learner's latency
 * (a tap arrives that much after the beat it answers), capped at {@link MAX_TAIL_MS}.
 */
export function tailMs(profileLatencyMs: number): number {
  return Math.min(MAX_TAIL_MS, TAIL_MS + Math.max(0, effectiveLatencyMs(profileLatencyMs)));
}

/**
 * Whether the screen should still carry out `prepare` for `token` after an `await`: it must still be
 * mounted (an unmounted lesson must not start sound), and the machine, read NOW from the runner,
 * must still be preparing that very run (not lost, restarted or finished meanwhile).
 */
export function runStillWanted({
  mounted,
  state,
  token,
}: {
  mounted: boolean;
  state: State;
  token: number;
}): boolean {
  return mounted && state.kind === 'preparing' && state.token === token;
}

/**
 * The event that ends a run whose last beat has passed: `finished` with the scored beat times, or
 * `lost` when they are not all there (`skipped` beats, or not {@link BEATS} of them).
 */
export function finishEvent(token: number, beats: readonly number[], skipped: number): Event {
  return skipped > 0 || !allBeats(beats)
    ? { type: 'lost', token }
    : { type: 'finished', token, beats: [...beats] };
}

const allBeats = (beats: readonly number[]): boolean =>
  beats.length === BEATS && beats.every(Number.isFinite);

export type State =
  | { kind: 'ready' }
  | { kind: 'preparing'; token: number }
  /** Sound could not start, or stopped mid-run. Start tries again. */
  | { kind: 'no-audio'; token: number; lost: boolean }
  | { kind: 'counting-in'; token: number; beat: number }
  | {
      kind: 'tapping';
      token: number;
      /** The last scored beat heard, from 0; -1 until the first. */
      beat: number;
      taps: number[];
    }
  | { kind: 'saving'; token: number; attempt: number; result: Result }
  | { kind: 'saved'; token: number; result: Result; stars: Stars }
  | { kind: 'failed'; token: number; attempt: number; result: Result }
  | { kind: 'signed-out'; token: number; result: Result };

export interface Result {
  score: number;
  hits: number;
  early: number;
  late: number;
}

export type Event =
  | { type: 'start' }
  | { type: 'prepared'; token: number; ok: boolean }
  | { type: 'beat'; token: number; beat: number }
  | { type: 'tap'; time: number }
  | { type: 'finished'; token: number; beats: number[] }
  | { type: 'lost'; token: number }
  | { type: 'answered'; attempt: number; outcome: CompleteOutcome }
  | { type: 'retry' };

export type Effect =
  /** Wake sound and start the metronome; answer with `prepared` carrying `token`. */
  | { type: 'prepare'; token: number }
  /** Stop the metronome and any timer of the run. */
  | { type: 'stop-audio' }
  | { type: 'complete'; attempt: number; score: number; stars: number };

const tokenOf = (s: State): number => ('token' in s ? s.token : 0);

export function createTapBeatMachine(profileLatencyMs: number): Machine<State, Event, Effect> {
  const latency = effectiveLatencyMs(profileLatencyMs);
  const complete = (r: Result, attempt: number): Effect => ({
    type: 'complete',
    attempt,
    score: r.score,
    stars: starsFor(r.score),
  });

  function step(s: State, e: Event): { state: State; effects: Effect[] } {
    const same = { state: s, effects: [] as Effect[] };
    switch (e.type) {
      case 'start': {
        if (s.kind !== 'ready' && s.kind !== 'no-audio') return same;
        const token = tokenOf(s) + 1;
        return { state: { kind: 'preparing', token }, effects: [{ type: 'prepare', token }] };
      }
      case 'prepared': {
        if (s.kind !== 'preparing' || s.token !== e.token) return same;
        return e.ok
          ? { state: { kind: 'counting-in', token: s.token, beat: -1 }, effects: [] }
          : {
              state: { kind: 'no-audio', token: s.token, lost: false },
              effects: [{ type: 'stop-audio' }],
            };
      }
      case 'beat': {
        if (!Number.isFinite(e.beat)) return same;
        if (s.kind === 'counting-in' && s.token === e.token) {
          if (e.beat >= COUNT_IN - 1) {
            return {
              state: {
                kind: 'tapping',
                token: s.token,
                beat: Math.max(-1, e.beat - COUNT_IN),
                taps: [],
              },
              effects: [],
            };
          }
          return e.beat > s.beat ? { state: { ...s, beat: e.beat }, effects: [] } : same;
        }
        if (s.kind === 'tapping' && s.token === e.token) {
          const beat = Math.min(BEATS - 1, e.beat - COUNT_IN);
          return beat > s.beat ? { state: { ...s, beat }, effects: [] } : same;
        }
        return same;
      }
      case 'tap': {
        if (s.kind !== 'tapping' || !Number.isFinite(e.time)) return same;
        return { state: { ...s, taps: [...s.taps, e.time] }, effects: [] };
      }
      case 'finished': {
        if (s.kind !== 'tapping' || s.token !== e.token) return same;
        if (!allBeats(e.beats)) return step(s, { type: 'lost', token: e.token });
        const result = tapScore(e.beats, s.taps, latency);
        return {
          state: { kind: 'saving', token: s.token, attempt: 1, result },
          effects: [{ type: 'stop-audio' }, complete(result, 1)],
        };
      }
      case 'lost': {
        if (
          (s.kind !== 'preparing' && s.kind !== 'counting-in' && s.kind !== 'tapping') ||
          s.token !== e.token
        ) {
          return same;
        }
        return {
          state: { kind: 'no-audio', token: s.token, lost: true },
          effects: [{ type: 'stop-audio' }],
        };
      }
      case 'answered': {
        if (s.kind !== 'saving' || s.attempt !== e.attempt) return same;
        switch (e.outcome) {
          case 'saved':
            return {
              state: {
                kind: 'saved',
                token: s.token,
                result: s.result,
                stars: starsFor(s.result.score),
              },
              effects: [],
            };
          case 'unauthorized':
            return {
              state: { kind: 'signed-out', token: s.token, result: s.result },
              effects: [],
            };
          case 'failed':
          case 'invalid':
            return {
              state: { kind: 'failed', token: s.token, attempt: s.attempt, result: s.result },
              effects: [],
            };
          default:
            return unreachable(e.outcome);
        }
      }
      case 'retry': {
        if (s.kind !== 'failed') return same;
        const attempt = s.attempt + 1;
        return {
          state: { kind: 'saving', token: s.token, attempt, result: s.result },
          effects: [complete(s.result, attempt)],
        };
      }
      default:
        return unreachable(e);
    }
  }

  return { initial: { kind: 'ready' }, step };
}

function unreachable(x: never): never {
  throw new Error(`tap-beat: unhandled ${JSON.stringify(x)}`);
}
