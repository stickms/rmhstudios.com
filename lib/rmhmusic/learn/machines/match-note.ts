/**
 * The pitch match as a machine: ten target notes, each shown on the staff; the learner plays it
 * (any input) with up to three tries, and may hear it first as often as they like. The best try is
 * that target's points (`pitchPoints`: 100 spot on, less for a close microphone note, 0 for a
 * wrong one); the score is their mean (`scoreFromPoints`), the stars `starsFor` it. Pure.
 *
 * It is the session lifecycle of `session.ts` (asking → feedback → next → saving → saved / failed
 * with Retry / signed out, one `complete` effect per attempt, a stale save answer ignored), with
 * two differences that the shared step cannot express, so this file has its own step:
 * - a target takes up to {@link MATCH_TRIES} notes. A note is a try while `asking`; the target
 *   ends (→ `feedback`) on a spot-on try or on the third. Once it has ended, more notes find
 *   nothing to answer: the fourth try is ignored.
 * - `hear` emits `{ type: 'play', midi }` for the screen to sound the target. A hint, never a try,
 *   unlimited, and it changes no state, so the machine never waits on a sound the learner may not
 *   have heard (a blocked audio context).
 *
 * The states are shaped like `SessionState` (plus the tries and points), so the shared session
 * screen (`useQuestionSession`) runs them unchanged.
 *
 * Notes arrive as the hub's events: a note-off is ignored, and notes within {@link SAME_TICK_MS}
 * of the try before (a double tap, a key and a MIDI note together, two notes of a chord) are one
 * strike and count once. The window is per target: the first note after Next is always a try.
 */
import { pitchPoints } from '../scoring/pitch';
import { scoreFromPoints, starsFor, type Stars } from '../scoring/stars';
import type { CompleteOutcome } from './learn-data';
import type { Machine } from './runner';

/** Targets in one lesson. */
export const MATCH_TARGETS = 10;
/** Tries per target. */
export const MATCH_TRIES = 3;
/** Notes closer together than this (ms, on the events' `performance.now()` clock) are one try. */
export const SAME_TICK_MS = 100;

/** One note to match: the pitch it sounds. */
export interface Target {
  midi: number;
}

/** A note as the hub reports it (cents only from the microphone). */
export interface Played {
  type: 'on' | 'off';
  midi: number;
  cents?: number;
  /** ms, `performance.now()` clock. */
  time: number;
}

/** One try: what was played and the points it earned. */
export interface Try {
  midi: number;
  cents?: number;
  time: number;
  points: number;
}

export type State =
  | {
      kind: 'asking';
      cards: Target[];
      index: number;
      /** Targets matched spot on so far. */
      correct: number;
      /** Each finished target's points (its best try). */
      points: number[];
      /** This target's tries so far (fewer than three, none spot on). */
      tries: Try[];
    }
  | {
      kind: 'feedback';
      cards: Target[];
      index: number;
      /** Includes this target when it was matched spot on. */
      correct: number;
      /** Includes this target's best. */
      points: number[];
      tries: Try[];
      /** Matched spot on. */
      right: boolean;
      /** The best try's points. */
      best: number;
      /** The last try. */
      answer: Try;
    }
  | { kind: 'saving'; correct: number; total: number; score: number; attempt: number }
  | { kind: 'saved'; correct: number; total: number; score: number; stars: Stars }
  | { kind: 'failed'; correct: number; total: number; score: number; attempt: number }
  | { kind: 'signed-out'; correct: number; total: number; score: number };

export type Event =
  | { type: 'answer'; answer: Played }
  | { type: 'hear' }
  | { type: 'next' }
  | { type: 'answered'; attempt: number; outcome: CompleteOutcome }
  | { type: 'retry' };

export type Effect =
  /** Sound the target (the learner asked to hear it). */
  | { type: 'play'; midi: number }
  /** Save the completion; answer with `answered` carrying `attempt`. */
  | { type: 'complete'; attempt: number; score: number; stars: number };

export function initial(targets: Target[]): State {
  return { kind: 'asking', cards: targets, index: 0, correct: 0, points: [], tries: [] };
}

const same = (state: State) => ({ state, effects: [] as Effect[] });

const completeEffect = (score: number, attempt: number): Effect => ({
  type: 'complete',
  attempt,
  score,
  stars: starsFor(score),
});

export function step(s: State, e: Event): { state: State; effects: Effect[] } {
  switch (e.type) {
    case 'answer': {
      if (s.kind !== 'asking') return same(s);
      const card = s.cards[s.index];
      const note = e.answer;
      if (card === undefined || note.type !== 'on') return same(s);
      if (!Number.isFinite(note.midi) || !Number.isFinite(note.time)) return same(s);
      const last = s.tries[s.tries.length - 1];
      if (last && Math.abs(note.time - last.time) < SAME_TICK_MS) return same(s);
      const attempt: Try = {
        midi: note.midi,
        ...(note.cents === undefined ? {} : { cents: note.cents }),
        time: note.time,
        points: pitchPoints(card.midi, note),
      };
      const tries = [...s.tries, attempt];
      const best = Math.max(...tries.map((t) => t.points));
      if (best < 100 && tries.length < MATCH_TRIES) return { state: { ...s, tries }, effects: [] };
      const right = best >= 100;
      return {
        state: {
          kind: 'feedback',
          cards: s.cards,
          index: s.index,
          correct: s.correct + (right ? 1 : 0),
          points: [...s.points, best],
          tries,
          right,
          best,
          answer: attempt,
        },
        effects: [],
      };
    }
    case 'hear': {
      if (s.kind !== 'asking' && s.kind !== 'feedback') return same(s);
      const card = s.cards[s.index];
      return card ? { state: s, effects: [{ type: 'play', midi: card.midi }] } : same(s);
    }
    case 'next': {
      if (s.kind !== 'feedback') return same(s);
      if (s.index + 1 < s.cards.length) {
        return {
          state: {
            kind: 'asking',
            cards: s.cards,
            index: s.index + 1,
            correct: s.correct,
            points: s.points,
            tries: [],
          },
          effects: [],
        };
      }
      const score = scoreFromPoints(s.points);
      const total = s.cards.length;
      return {
        state: { kind: 'saving', correct: s.correct, total, score, attempt: 1 },
        effects: [completeEffect(score, 1)],
      };
    }
    case 'answered': {
      if (s.kind !== 'saving' || s.attempt !== e.attempt) return same(s);
      const { correct, total, score } = s;
      switch (e.outcome) {
        case 'saved':
          return same({ kind: 'saved', correct, total, score, stars: starsFor(score) });
        case 'unauthorized':
          return same({ kind: 'signed-out', correct, total, score });
        case 'failed':
        case 'invalid':
          return same({ kind: 'failed', correct, total, score, attempt: s.attempt });
        default:
          return unreachable(e.outcome);
      }
    }
    case 'retry': {
      if (s.kind !== 'failed') return same(s);
      const attempt = s.attempt + 1;
      return {
        state: { kind: 'saving', correct: s.correct, total: s.total, score: s.score, attempt },
        effects: [completeEffect(s.score, attempt)],
      };
    }
    default:
      return unreachable(e);
  }
}

export const matchNoteMachine = { initial, step };

export function createMatchNoteMachine(targets: Target[]): Machine<State, Event, Effect> {
  return { initial: initial(targets), step };
}

/**
 * The sounding pitches a lesson asks for. `match-c`: C4 to G4, five notes around middle C;
 * `match-white-keys`: the naturals C4 to C5. Piano and guitar share them in this phase (a guitar's
 * C4 is the B string's first fret; the staff shows guitar music an octave up, `targetStaff`).
 */
export function matchNotePool(lessonId: string): number[] {
  return lessonId === 'match-white-keys' ? [60, 62, 64, 65, 67, 69, 71, 72] : [60, 62, 64, 65, 67];
}

function unreachable(x: never): never {
  throw new Error(`match-note: unhandled ${JSON.stringify(x)}`);
}
