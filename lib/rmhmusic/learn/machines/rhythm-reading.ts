/**
 * Reading a rhythm as a machine: a lesson of written one-bar patterns, each LISTENED to once, then
 * tapped after a count-in of one bar, scored by `scoring/onsets.ts`, shown again with each note marked
 * early, on time or late, and on to the next; after the last the result is saved (saving, then saved,
 * failed with Retry, or signed out; one `complete` effect per attempt; a stale save answer ignored),
 * the lifecycle of `session.ts`. Pure: no clock, no audio. The screen carries the effects out and
 * reports what it hears, as `tap-beat.ts` does:
 *
 * - `listen` (a press, so the browser lets sound begin) plays the pattern: `play`; the screen answers
 *   `played` once it has sounded (`ok: false`: sound could not start). A pattern must be heard before
 *   it can be tapped (`begin` does nothing until then), and may be heard again at will;
 * - `begin` wakes sound and starts the count-in: `prepare`; the screen answers `prepared`, then `beat`
 *   as each click is HEARD, numbered from the first count-in click, 0;
 * - `tap` carries the input event's own timestamp (never a clock read here or in a handler);
 * - `finished` carries the time of the bar's first beat (the click after the count-in) once the bar
 *   and a short tail have passed; `lost` when sound stops, the tab is hidden, or the run's clicks are
 *   not all there ({@link finishEvent}).
 *
 * Every run event carries the run's `token`, so a late answer from a run the learner abandoned (sound
 * lost, Listen pressed again) changes nothing. Taps count only in `tapping`, which opens on the LAST
 * count-in click so a learner who allows for their latency is not cut off.
 *
 * **Scoring a lesson.** A pattern passes at {@link PASS_SCORE}. Only a pattern's FIRST attempt scores
 * (the other drills' rule): in Learning mode a missed pattern comes back, already heard, until it is
 * passed; in Test mode it does not. The lesson's score is the mean of the first attempts.
 */
import type { RhythmPattern } from '../theory/rhythm';
import { barMs, beatMs, meterBeats, onsetTimesMs } from '../theory/rhythm';
import { RHYTHM_READ_BPM } from '../content/rhythm-patterns';
import { onsetScore, type OnsetScore } from '../scoring/onsets';
import { starsFor, type Stars } from '../scoring/stars';
import { ZERO_MS, effectiveLatencyMs } from '../scoring/timing';
import type { CompleteOutcome } from './learn-data';
import type { Machine } from './runner';
import { tailMs } from './tap-beat';

/** A pattern passes at this score (0..100). */
export const PASS_SCORE = 70;

export { tailMs };

/** What sound did to the run: it could not start, or stopped part-way. */
export type Notice = 'no-audio' | 'lost';

/** One tapped attempt at a pattern, scored. */
export interface Attempt extends OnsetScore {
  /** Each extra tap as a beat of the bar (0 is the first beat; may fall in a rest, or just outside). */
  extraBeats: number[];
  passed: boolean;
}

interface Progress {
  /** The pattern in play, from 0. */
  index: number;
  /** Attempts at this pattern that missed (Learning mode asks it again). */
  misses: number;
  /** The first attempt's score of each pattern done so far. */
  scores: number[];
  /** The pattern has been heard (and may now be tapped). */
  heard: boolean;
}

export type State =
  /** A pattern shown, waiting for Listen, or (once heard) for the count-in. */
  | ({ kind: 'asking'; token: number; notice: Notice | null } & Progress)
  /** The pattern is sounding, or sound is waking for it. */
  | ({ kind: 'listening'; token: number } & Progress)
  | ({ kind: 'preparing'; token: number } & Progress)
  | ({ kind: 'counting-in'; token: number; beat: number } & Progress)
  | ({ kind: 'tapping'; token: number; beat: number; taps: number[] } & Progress)
  /** The attempt, scored, shown on the bar. */
  | ({ kind: 'feedback'; token: number; attempt: Attempt } & Progress)
  | { kind: 'saving'; token: number; attempt: number; score: number; scores: number[] }
  | { kind: 'saved'; token: number; score: number; scores: number[]; stars: Stars }
  | { kind: 'failed'; token: number; attempt: number; score: number; scores: number[] }
  | { kind: 'signed-out'; token: number; score: number; scores: number[] };

export type Event =
  | { type: 'listen' }
  | { type: 'played'; token: number; ok: boolean }
  | { type: 'begin' }
  | { type: 'prepared'; token: number; ok: boolean }
  | { type: 'beat'; token: number; beat: number }
  | { type: 'tap'; time: number }
  | { type: 'finished'; token: number; barStart: number }
  | { type: 'lost'; token: number }
  | { type: 'next' }
  | { type: 'answered'; attempt: number; outcome: CompleteOutcome }
  | { type: 'retry' };

export type Effect =
  /** Wake sound and play pattern `index` once; answer with `played` carrying `token`. */
  | { type: 'play'; token: number; index: number }
  /** Wake sound and start the count-in and bar of pattern `index`; answer with `prepared` carrying `token`. */
  | { type: 'prepare'; token: number; index: number }
  /** Stop the pattern, the metronome and any timer of the run. */
  | { type: 'stop-audio' }
  | { type: 'complete'; attempt: number; score: number; stars: number };

/** Whether a run (listening or tapping) is under way and sound is wanted. */
export const isLive = (s: State): boolean =>
  s.kind === 'listening' || s.kind === 'preparing' || s.kind === 'counting-in' || s.kind === 'tapping';

/**
 * Whether the screen should still carry out `prepare` or `play` for `token` after an `await`: it must
 * still be mounted, and the machine, read NOW from the runner, must still be on that very run.
 */
export function runStillWanted({
  mounted,
  state,
  token,
  kind,
}: {
  mounted: boolean;
  state: State;
  token: number;
  kind: 'listening' | 'preparing';
}): boolean {
  return mounted && state.kind === kind && state.token === token;
}

/** The scored click times of a bar run: `meter` count-in clicks then the bar's; a run missing any is lost. */
export function finishEvent(
  token: number,
  beats: readonly number[],
  skipped: number,
  meter: RhythmPattern['meter'],
): Event {
  const n = meterBeats(meter);
  const barStart = beats[n];
  return skipped > 0 || beats.length !== 2 * n || !beats.every(Number.isFinite) || barStart === undefined
    ? { type: 'lost', token }
    : { type: 'finished', token, barStart };
}

/** The click that is the last one of the run: the count-in's `n` clicks and the bar's `n`. */
export const runClicks = (meter: RhythmPattern['meter']): number => 2 * meterBeats(meter);

/** How a lesson's score is made of its patterns' first attempts: the mean, whole. */
export function lessonScore(scores: readonly number[], total: number): number {
  if (total <= 0) return 0;
  const sum = scores.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return Math.min(100, Math.max(0, Math.round(sum / total)));
}

export function createRhythmReadingMachine(
  patterns: readonly RhythmPattern[],
  profileLatencyMs: number,
  learning: boolean | (() => boolean) = false,
): Machine<State, Event, Effect> {
  const latency = effectiveLatencyMs(profileLatencyMs);
  const isLearning = typeof learning === 'function' ? learning : () => learning;
  const total = patterns.length;

  const progressOf = (s: State): Progress | null =>
    'index' in s ? { index: s.index, misses: s.misses, scores: s.scores, heard: s.heard } : null;

  function step(s: State, e: Event): { state: State; effects: Effect[] } {
    const same = { state: s, effects: [] as Effect[] };
    const p = progressOf(s);
    switch (e.type) {
      case 'listen': {
        if (s.kind !== 'asking' || !p) return same;
        const token = s.token + 1;
        return {
          state: { kind: 'listening', token, ...p },
          effects: [{ type: 'play', token, index: p.index }],
        };
      }
      case 'played': {
        if (s.kind !== 'listening' || s.token !== e.token || !p) return same;
        return e.ok
          ? { state: { kind: 'asking', token: s.token, notice: null, ...p, heard: true }, effects: [] }
          : {
              state: { kind: 'asking', token: s.token, notice: 'no-audio', ...p },
              effects: [{ type: 'stop-audio' }],
            };
      }
      case 'begin': {
        if (s.kind !== 'asking' || !p || !p.heard) return same;
        const token = s.token + 1;
        return {
          state: { kind: 'preparing', token, ...p },
          effects: [{ type: 'prepare', token, index: p.index }],
        };
      }
      case 'prepared': {
        if (s.kind !== 'preparing' || s.token !== e.token || !p) return same;
        return e.ok
          ? { state: { kind: 'counting-in', token: s.token, beat: -1, ...p }, effects: [] }
          : {
              state: { kind: 'asking', token: s.token, notice: 'no-audio', ...p },
              effects: [{ type: 'stop-audio' }],
            };
      }
      case 'beat': {
        if (!Number.isFinite(e.beat)) return same;
        const pattern = p ? patterns[p.index] : undefined;
        if (!pattern) return same;
        const n = meterBeats(pattern.meter);
        if (s.kind === 'counting-in' && s.token === e.token) {
          if (e.beat >= n - 1 && p) {
            return {
              state: { kind: 'tapping', token: s.token, beat: Math.max(-1, e.beat - n), taps: [], ...p },
              effects: [],
            };
          }
          return e.beat > s.beat ? { state: { ...s, beat: e.beat }, effects: [] } : same;
        }
        if (s.kind === 'tapping' && s.token === e.token) {
          const beat = Math.min(n - 1, e.beat - n);
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
        const pattern = patterns[s.index];
        if (!pattern || !Number.isFinite(e.barStart)) return step(s, { type: 'lost', token: e.token });
        const expected = onsetTimesMs(pattern, RHYTHM_READ_BPM, e.barStart);
        const scored = onsetScore(expected, s.taps, latency, {
          fromMs: e.barStart - ZERO_MS,
          toMs: e.barStart + barMs(pattern, RHYTHM_READ_BPM) + ZERO_MS,
        });
        const per = beatMs(RHYTHM_READ_BPM);
        const attempt: Attempt = {
          ...scored,
          extraBeats: scored.extras.map((t) => (t - e.barStart) / per),
          passed: scored.score >= PASS_SCORE,
        };
        // Only the first attempt at a pattern scores.
        const scores = s.scores.length > s.index ? s.scores : [...s.scores, scored.score];
        return {
          state: {
            kind: 'feedback',
            token: s.token,
            index: s.index,
            misses: s.misses,
            heard: s.heard,
            scores,
            attempt,
          },
          effects: [{ type: 'stop-audio' }],
        };
      }
      case 'lost': {
        if (!isLive(s) || s.token !== e.token || !p) return same;
        return {
          state: { kind: 'asking', token: s.token, notice: 'lost', ...p },
          effects: [{ type: 'stop-audio' }],
        };
      }
      case 'next': {
        if (s.kind !== 'feedback') return same;
        if (!s.attempt.passed && isLearning()) {
          return {
            state: {
              kind: 'asking',
              token: s.token,
              notice: null,
              index: s.index,
              misses: s.misses + 1,
              scores: s.scores,
              // It has been heard; a pattern that comes back is tapped again straight away.
              heard: true,
            },
            effects: [],
          };
        }
        if (s.index + 1 < total) {
          return {
            state: {
              kind: 'asking',
              token: s.token,
              notice: null,
              index: s.index + 1,
              misses: 0,
              scores: s.scores,
              heard: false,
            },
            effects: [],
          };
        }
        const score = lessonScore(s.scores, total);
        return {
          state: { kind: 'saving', token: s.token, attempt: 1, score, scores: s.scores },
          effects: [{ type: 'complete', attempt: 1, score, stars: starsFor(score) }],
        };
      }
      case 'answered': {
        if (s.kind !== 'saving' || s.attempt !== e.attempt) return same;
        switch (e.outcome) {
          case 'saved':
            return {
              state: { kind: 'saved', token: s.token, score: s.score, scores: s.scores, stars: starsFor(s.score) },
              effects: [],
            };
          case 'unauthorized':
            return { state: { kind: 'signed-out', token: s.token, score: s.score, scores: s.scores }, effects: [] };
          case 'failed':
          case 'invalid':
            return {
              state: { kind: 'failed', token: s.token, attempt: s.attempt, score: s.score, scores: s.scores },
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
          state: { kind: 'saving', token: s.token, attempt, score: s.score, scores: s.scores },
          effects: [{ type: 'complete', attempt, score: s.score, stars: starsFor(s.score) }],
        };
      }
      default:
        return unreachable(e);
    }
  }

  return {
    initial: { kind: 'asking', token: 0, notice: null, index: 0, misses: 0, scores: [], heard: false },
    step,
  };
}

function unreachable(x: never): never {
  throw new Error(`rhythm-reading: unhandled ${JSON.stringify(x)}`);
}
