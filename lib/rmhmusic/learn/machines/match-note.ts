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
import { dealRounds } from '../content/decks';
import type { VoiceRange } from '../schemas';
import { INTERVALS, type IntervalName } from '../theory/intervals';
import { VOICE_RANGE, rangeNaturals } from '../voice/range';
import type { Machine } from './runner';

/** Targets in one lesson. */
export const MATCH_TARGETS = 10;
/** Tries per target. */
export const MATCH_TRIES = 3;
/** Notes closer together than this (ms, on the events' `performance.now()` clock) are one try. */
export const SAME_TICK_MS = 100;
/** How long a hint note sounds (ms). */
export const HEAR_MS = 900;
/** The answer to an interval: the first note sounds this long (ms), then the second for `HEAR_MS`. */
export const INTERVAL_GAP_MS = 700;

/**
 * One note to match: the pitch it sounds. Interval singing (`sing-interval`) also gives the first
 * note (`from`), which the staff shows and Hear it plays alone (echo matching: the learner hears
 * the first note and sings the second), and the interval's name.
 */
export interface Target {
  midi: number;
  from?: number;
  interval?: IntervalName;
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
      /**
       * Interval targets only: whether the first note has sounded for this target. Answers are
       * ignored until it has (the learner sings against what they heard). Absent on a plain target.
       */
      heard?: boolean;
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
      /** The note of the last try (as `SessionState` keeps the answer). */
      answer: Played;
    }
  | {
      kind: 'saving';
      correct: number;
      total: number;
      score: number;
      attempt: number;
    }
  | {
      kind: 'saved';
      correct: number;
      total: number;
      score: number;
      stars: Stars;
    }
  | {
      kind: 'failed';
      correct: number;
      total: number;
      score: number;
      attempt: number;
    }
  | {
      kind: 'signed-out';
      correct: number;
      total: number;
      score: number;
    };

export type Event =
  | {
      type: 'answer';
      answer: Played;
    }
  | {
      type: 'hear';
    }
  /** Interval targets, after a miss: sound both notes, the answer. */
  | {
      type: 'hear-answer';
    }
  | {
      type: 'next';
    }
  | {
      type: 'answered';
      attempt: number;
      outcome: CompleteOutcome;
    }
  | {
      type: 'retry';
    };

export type Effect =
  /**
   * Sound a hint: `midi` alone, or `from` and then `midi` (an interval's answer). The screen sends
   * `hear` only when sound can start now, so the machine counts the first note as heard.
   */
  | {
      type: 'play';
      midi: number;
      from?: number;
    }
  /** Save the completion; answer with `answered` carrying `attempt`. */
  | {
      type: 'complete';
      attempt: number;
      score: number;
      stars: number;
    };

export function initial(targets: Target[]): State {
  return {
    kind: 'asking',
    cards: targets,
    index: 0,
    correct: 0,
    points: [],
    tries: [],
    ...unheard(targets[0]),
  };
}

const same = (state: State) => ({
  state,
  effects: [] as Effect[],
});

const completeEffect = (score: number, attempt: number): Effect => ({
  type: 'complete',
  attempt,
  score,
  stars: starsFor(score),
});

export function step(
  s: State,
  e: Event,
): {
  state: State;
  effects: Effect[];
} {
  switch (e.type) {
    case 'answer': {
      if (s.kind !== 'asking') return same(s);
      const card = s.cards[s.index];
      const note = e.answer;
      // Echo matching: nothing counts before the first note was heard.
      if (s.heard === false) return same(s);
      if (card === undefined || note.type !== 'on') return same(s);
      if (!Number.isFinite(note.midi) || !Number.isFinite(note.time)) return same(s);
      const last = s.tries[s.tries.length - 1];
      if (last && Math.abs(note.time - last.time) < SAME_TICK_MS) return same(s);
      const attempt: Try = {
        midi: note.midi,
        ...(note.cents === undefined
          ? {}
          : {
              cents: note.cents,
            }),
        time: note.time,
        points: pitchPoints(card.midi, note),
      };
      const tries = [...s.tries, attempt];
      const best = Math.max(...tries.map((t) => t.points));
      if (best < 100 && tries.length < MATCH_TRIES)
        return {
          state: {
            ...s,
            tries,
          },
          effects: [],
        };
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
          answer: note,
        },
        effects: [],
      };
    }
    case 'hear': {
      if (s.kind !== 'asking' && s.kind !== 'feedback') return same(s);
      const card = s.cards[s.index];
      if (!card) return same(s);
      // An interval's Hear it is its first note alone; hearing it opens the answers.
      return {
        state:
          s.kind === 'asking' && s.heard === false
            ? {
                ...s,
                heard: true,
              }
            : s,
        effects: [
          {
            type: 'play',
            midi: card.from ?? card.midi,
          },
        ],
      };
    }
    case 'hear-answer': {
      const card = s.kind === 'asking' || s.kind === 'feedback' ? s.cards[s.index] : undefined;
      const missed = (s.kind === 'asking' && s.tries.length > 0) || (s.kind === 'feedback' && !s.right);
      if (card?.from === undefined || !missed) return same(s);
      return {
        state: s,
        effects: [
          {
            type: 'play',
            from: card.from,
            midi: card.midi,
          },
        ],
      };
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
            ...unheard(s.cards[s.index + 1]),
          },
          effects: [],
        };
      }
      const score = scoreFromPoints(s.points);
      const total = s.cards.length;
      return {
        state: {
          kind: 'saving',
          correct: s.correct,
          total,
          score,
          attempt: 1,
        },
        effects: [completeEffect(score, 1)],
      };
    }
    case 'answered': {
      if (s.kind !== 'saving' || s.attempt !== e.attempt) return same(s);
      const { correct, total, score } = s;
      switch (e.outcome) {
        case 'saved':
          return same({
            kind: 'saved',
            correct,
            total,
            score,
            stars: starsFor(score),
          });
        case 'unauthorized':
          return same({
            kind: 'signed-out',
            correct,
            total,
            score,
          });
        case 'failed':
        case 'invalid':
          return same({
            kind: 'failed',
            correct,
            total,
            score,
            attempt: s.attempt,
          });
        default:
          return unreachable(e.outcome);
      }
    }
    case 'retry': {
      if (s.kind !== 'failed') return same(s);
      const attempt = s.attempt + 1;
      return {
        state: {
          kind: 'saving',
          correct: s.correct,
          total: s.total,
          score: s.score,
          attempt,
        },
        effects: [completeEffect(s.score, attempt)],
      };
    }
    default:
      return unreachable(e);
  }
}

/** An interval target starts unheard; a plain one carries no flag. */
function unheard(card: Target | undefined): {
  heard?: false;
} {
  return card?.from === undefined
    ? {}
    : {
        heard: false,
      };
}

/**
 * What a `play` effect sounds and for how long: the notes with their start (ms after the hint
 * starts) and the hint's whole length, which is also the microphone's deaf window before its tail.
 */
export function hintSchedule(fx: { midi: number; from?: number }): {
  notes: {
    midi: number;
    atMs: number;
  }[];
  lengthMs: number;
} {
  if (fx.from === undefined)
    return {
      notes: [
        {
          midi: fx.midi,
          atMs: 0,
        },
      ],
      lengthMs: HEAR_MS,
    };
  return {
    notes: [
      {
        midi: fx.from,
        atMs: 0,
      },
      {
        midi: fx.midi,
        atMs: INTERVAL_GAP_MS,
      },
    ],
    lengthMs: INTERVAL_GAP_MS + HEAR_MS,
  };
}

export const matchNoteMachine = {
  initial,
  step,
};

export function createMatchNoteMachine(targets: Target[]): Machine<State, Event, Effect> {
  return {
    initial: initial(targets),
    step,
  };
}

/**
 * The sounding pitches a lesson asks for. `match-c`: C4 to G4, five notes around middle C;
 * `match-white-keys`: the naturals C4 to C5. Piano and guitar share them in this phase (a guitar's
 * C4 is the B string's first fret; the staff shows guitar music an octave up, `targetStaff`).
 */
export function matchNotePool(lessonId: string, range?: VoiceRange): number[] {
  if (lessonId === 'voice-match-five' || lessonId === 'voice-match-range') {
    const naturals = rangeNaturals(range ?? 'alto');
    return lessonId === 'voice-match-five' ? naturals.slice(0, 5) : naturals;
  }
  return lessonId === 'match-white-keys' ? [60, 62, 64, 65, 67, 69, 71, 72] : [60, 62, 64, 65, 67];
}

/**
 * Interval singing: `count` targets, each a natural first note of the range and a note one of the
 * pool's intervals above it (the interval's sizes, so a third may be minor or major), both inside
 * the range. The first notes are dealt like a deck (every usable one before any repeats).
 */
export function singIntervalTargets(
  pool: readonly string[],
  range: VoiceRange,
  count: number,
  rand: () => number,
): Target[] {
  const { high } = VOICE_RANGE[range];
  const names = pool.filter((n): n is IntervalName => n in INTERVALS);
  const naturals = rangeNaturals(range);
  const pairs: {
    from: number;
    midi: number;
    interval: IntervalName;
  }[] = [];
  for (const from of naturals)
    for (const interval of names)
      for (const size of INTERVALS[interval].semitones) {
        const midi = from + size;
        // A natural second note keeps the staff and the sung note in plain letters.
        if (midi <= high && naturals.includes(midi))
          pairs.push({
            from,
            midi,
            interval,
          });
      }
  if (pairs.length === 0) return [];
  return dealRounds(
    pairs.map((_, i) => i),
    count,
    rand,
  ).map((i) => pairs[i] as Target);
}

function unreachable(x: never): never {
  throw new Error(`match-note: unhandled ${JSON.stringify(x)}`);
}
