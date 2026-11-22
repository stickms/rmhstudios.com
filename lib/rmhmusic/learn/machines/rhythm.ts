/**
 * The two question lessons of the rhythm unit, on the session lifecycle of `session.ts` (ask,
 * feedback, next, then saving / saved / failed with Retry / signed out; one `complete` effect per
 * attempt). Pure.
 *
 * - **Note values** (`rhythm-note-values`): four questions, each a note value shown on the page,
 *   answered with how many beats it lasts. Each value is asked once, in a random order, so the
 *   whole set is seen and a guess cannot be repeated.
 * - **4/4 versus 3/4** (`rhythm-44-vs-34`): five questions, each a bar pattern the metronome plays
 *   (an accent on the first beat of each bar), answered "3" or "4". As in the ear lessons, a
 *   question must be heard before it can be answered (`played`), and `replay` plays it again
 *   without touching the state or the score. The screen carries `play` out and answers `played`
 *   for the pattern it sounded.
 *
 * Both run in Learning or Test mode (`practice-mode.ts`): in Test mode one answer settles a question;
 * in Learning mode a wrong answer shows its feedback and the same question comes back until it is
 * answered right (a bar that comes back has already been heard), and only a first-try answer scores.
 * `createValueMachine` and `createMeterMachine` take either, or a getter read at every event.
 */
import { shuffle } from '../content/decks';
import type { Machine } from './runner';
import {
  createSessionMachine,
  sessionInitial,
  sessionStep,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from './session';

/** What a `rhythm-basics` lesson does, by lesson id; none for an id that is not a rhythm lesson. */
export type RhythmActivity = 'values' | 'meter' | 'tap';
const ACTIVITIES: Readonly<Record<string, RhythmActivity>> = {
  'rhythm-note-values': 'values',
  'rhythm-44-vs-34': 'meter',
  'rhythm-tap-the-beat': 'tap',
};
export function rhythmActivity(lessonId: string): RhythmActivity | null {
  return Object.hasOwn(ACTIVITIES, lessonId) ? ACTIVITIES[lessonId] : null;
}

/** The four note values of the lesson, longest first. */
export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth';
export const NOTE_VALUES: readonly NoteValue[] = ['whole', 'half', 'quarter', 'eighth'];
/** How many beats each lasts (in a bar of quarter-note beats). */
export const BEATS_OF: Readonly<Record<NoteValue, number>> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
};
/** Questions in the note-values lesson: one per value. */
export const VALUE_QUESTIONS = 4;
/** Questions in the 4/4-versus-3/4 lesson. */
export const METER_QUESTIONS = 5;

export interface ValueQuestion {
  value: NoteValue;
}
export interface ValueAnswer {
  beats: number;
}

export function dealValues(rand: () => number): ValueQuestion[] {
  return shuffle([...NOTE_VALUES], rand).map((value) => ({
    value,
  }));
}

const valueIsRight = (q: ValueQuestion, a: ValueAnswer) => BEATS_OF[q.value] === a.beats;
/** One note-values step in Test mode. */
const valueStep = sessionStep<ValueQuestion, ValueAnswer>(valueIsRight);
/** One note-values step in Learning mode: a wrong answer brings the same note back. */
const valueLearningStep = sessionStep<ValueQuestion, ValueAnswer>(valueIsRight, { learning: true });

/**
 * The note-values machine. `learning` is Learning mode (retry until right) or Test mode, or a
 * getter read at every event, so a mode switched mid-lesson is obeyed from the next answer.
 */
export function createValueMachine(
  questions: ValueQuestion[],
  learning: boolean | (() => boolean) = false,
): Machine<SessionState<ValueQuestion, ValueAnswer>, SessionEvent<ValueAnswer>, SessionEffect> {
  return createSessionMachine(
    questions,
    typeof learning === 'function'
      ? (s, e) => (learning() ? valueLearningStep : valueStep)(s, e)
      : learning
        ? valueLearningStep
        : valueStep,
  );
}

/** How many beats a bar of the pattern has. */
export type BeatsPerBar = 3 | 4;

export interface MeterQuestion {
  beatsPerBar: BeatsPerBar;
}
export interface MeterAnswer {
  beatsPerBar: BeatsPerBar;
}

/**
 * `count` questions, the two meters going round (so neither is ever more than one question ahead
 * of the other, and a coin-flip cannot get them all), in a random order.
 */
export function dealMeters(count: number, rand: () => number): MeterQuestion[] {
  if (!Number.isFinite(count) || count < 1) return [];
  const r = rand();
  const first: BeatsPerBar = Number.isFinite(r) && r >= 0.5 ? 4 : 3;
  const meters = Array.from(
    {
      length: Math.floor(count),
    },
    (_, i): BeatsPerBar => {
      const odd = i % 2 === 1;
      return odd === (first === 3) ? 4 : 3;
    },
  );
  return shuffle(meters, rand).map((beatsPerBar) => ({
    beatsPerBar,
  }));
}

type Base = SessionState<MeterQuestion, MeterAnswer>;

export type MeterState =
  | Exclude<
      Base,
      {
        kind: 'asking';
      }
    >
  | (Extract<
      Base,
      {
        kind: 'asking';
      }
    > & {
      /** The pattern of this question has played, so it can be answered. */
      heard: boolean;
    });

export type MeterEvent =
  | SessionEvent<MeterAnswer>
  | {
      type: 'replay';
    }
  | {
      type: 'played';
      index: number;
    };

export type MeterEffect =
  | SessionEffect
  | {
      type: 'play';
      index: number;
      beatsPerBar: BeatsPerBar;
    };

const meterIsRight = (q: MeterQuestion, a: MeterAnswer) => q.beatsPerBar === a.beatsPerBar;
const meterTestBase = sessionStep<MeterQuestion, MeterAnswer>(meterIsRight);
const meterLearningBase = sessionStep<MeterQuestion, MeterAnswer>(meterIsRight, { learning: true });

function meterStepWith(
  base: typeof meterTestBase,
  s: MeterState,
  e: MeterEvent,
): {
  state: MeterState;
  effects: MeterEffect[];
} {
  const same = {
    state: s,
    effects: [] as MeterEffect[],
  };
  if (e.type === 'replay') {
    if (s.kind !== 'asking' && s.kind !== 'feedback') return same;
    const q = s.cards[s.index];
    if (!q) return same;
    return {
      state: s,
      effects: [
        {
          type: 'play',
          index: s.index,
          beatsPerBar: q.beatsPerBar,
        },
      ],
    };
  }
  if (e.type === 'played') {
    if (s.kind !== 'asking' || s.index !== e.index || s.heard) return same;
    return {
      state: {
        ...s,
        heard: true,
      },
      effects: [],
    };
  }
  if (e.type === 'answer' && s.kind === 'asking' && !s.heard) return same;
  const r = base(s, e);
  if (r.state === s)
    return {
      state: s,
      effects: r.effects,
    };
  // A question reached by Next starts unheard. The same question asked again (Learning mode, after
  // a miss) was already heard, so it can be answered at once; Replay still plays it.
  const retry = r.state.kind === 'asking' && s.kind === 'feedback' && r.state.index === s.index;
  const state = (
    r.state.kind === 'asking'
      ? {
          ...r.state,
          heard: retry,
        }
      : r.state
  ) as MeterState;
  return {
    state,
    effects: r.effects,
  };
}

/** One 4/4-versus-3/4 step in Test mode. */
function meterStep(s: MeterState, e: MeterEvent) {
  return meterStepWith(meterTestBase, s, e);
}

/** One 4/4-versus-3/4 step in Learning mode: a wrong answer brings the same bar back, already heard. */
function meterLearningStep(s: MeterState, e: MeterEvent) {
  return meterStepWith(meterLearningBase, s, e);
}

/**
 * The 4/4-versus-3/4 machine. `learning` is Learning mode or Test mode, or a getter read at every event.
 */
export function createMeterMachine(
  questions: MeterQuestion[],
  learning: boolean | (() => boolean) = false,
): Machine<MeterState, MeterEvent, MeterEffect> {
  return {
    initial: {
      ...sessionInitial<MeterQuestion, MeterAnswer>(questions),
      heard: false,
    } as MeterState,
    step:
      typeof learning === 'function'
        ? (s, e) => (learning() ? meterLearningStep : meterStep)(s, e)
        : learning
          ? meterLearningStep
          : meterStep,
  };
}
