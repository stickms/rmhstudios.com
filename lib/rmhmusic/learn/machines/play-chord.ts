/**
 * Playing a chord as a machine: a few chords to play, each asked by name; the learner plays it on
 * the on-screen keys, the computer keys or a MIDI controller (the screen collects the notes of
 * one chord in a window, `input/chord-window.ts`, and answers with them). Right when the notes
 * are exactly the chord's pitch classes, in any octave, order or inversion. Fewer than three
 * distinct pitch classes is not graded at all.
 *
 * The lifecycle — one answer per chord, `next` only after it, one `complete` per attempt, a
 * stale save answer ignored — is the shared session machine in `session.ts`. Pure.
 */
import {
  isChordAttempt,
  matchesChord,
  type ChordQuality,
} from '../theory/chords';
import type { Machine } from './runner';
import {
  createSessionMachine,
  sessionInitial,
  sessionStep,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from './session';

/** A chord to play: its root (the pitch the chord is named for) and quality. */
export interface ChordQuestion {
  root: number;
  quality: ChordQuality;
}

/** The notes the learner played inside the window. */
export interface ChordAnswer {
  midis: number[];
}

export type State =
  SessionState<
    ChordQuestion,
    ChordAnswer
  >;
export type Event =
  SessionEvent<ChordAnswer>;
export type Effect =
  SessionEffect;

export function initial(
  questions: ChordQuestion[],
): State {
  return sessionInitial(
    questions,
  );
}

export function isRight(
  q: ChordQuestion,
  a: ChordAnswer,
): boolean {
  return matchesChord(
    a.midis,
    q.root,
    q.quality,
  );
}

const gradedStep =
  sessionStep<
    ChordQuestion,
    ChordAnswer
  >(
    isRight,
  );

/**
 * Only an attempt is graded: fewer than three distinct pitch classes is a lone tap or a dyad (the
 * learner finding the keys), so the question stays asked and nothing is scored. The screen says so
 * (`input/chord-window.ts` reports it); the machine holds the rule too, whatever the screen sends.
 */
export const step: typeof gradedStep =
  (
    s,
    e,
  ) => {
    if (
      e.type ===
        'answer' &&
      s.kind ===
        'asking' &&
      !isChordAttempt(
        e
          .answer
          .midis,
      )
    ) {
      return {
        state:
          s,
        effects:
          [],
      };
    }
    return gradedStep(
      s,
      e,
    );
  };

export const playChordMachine =
  {
    initial,
    step,
  };

export function createPlayChordMachine(
  questions: ChordQuestion[],
): Machine<
  State,
  Event,
  Effect
> {
  return createSessionMachine(
    questions,
    step,
  );
}

/**
 * The chords a lesson asks for, in order. `chord-play-c-major`: C major, then F major and G major
 * (the three big chords of C, all on natural notes).
 */
export function playChordQuestions(
  _lessonId: string,
): ChordQuestion[] {
  return [
    {
      root: 60,
      quality:
        'major',
    },
    {
      root: 65,
      quality:
        'major',
    },
    {
      root: 67,
      quality:
        'major',
    },
  ];
}
