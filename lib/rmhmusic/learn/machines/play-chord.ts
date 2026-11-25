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
import { isChordAttempt, matchesChord, triadsOf, type ChordQuality } from '../theory/chords';
import { pitchClass, type SpelledNote } from '../theory/scales';
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
  /**
   * The root as it is written, where the lesson names the chord by its spelling (F♯, not G♭). The
   * first lesson's chords are all natural notes and carry none: their name is the root's letter.
   */
  spelled?: SpelledNote;
}

/** The notes the learner played inside the window. */
export interface ChordAnswer {
  midis: number[];
}

export type State = SessionState<ChordQuestion, ChordAnswer>;
export type Event = SessionEvent<ChordAnswer>;
export type Effect = SessionEffect;

export function initial(questions: ChordQuestion[]): State {
  return sessionInitial(questions);
}

export function isRight(q: ChordQuestion, a: ChordAnswer): boolean {
  return matchesChord(a.midis, q.root, q.quality);
}

const gradedStep = sessionStep<ChordQuestion, ChordAnswer>(isRight);

/**
 * Only an attempt is graded: fewer than three distinct pitch classes is a lone tap or a dyad (the
 * learner finding the keys), so the question stays asked and nothing is scored. The screen says so
 * (`input/chord-window.ts` reports it); the machine holds the rule too, whatever the screen sends.
 */
export const step: typeof gradedStep = (s, e) => {
  if (e.type === 'answer' && s.kind === 'asking' && !isChordAttempt(e.answer.midis)) {
    return {
      state: s,
      effects: [],
    };
  }
  return gradedStep(s, e);
};

export const playChordMachine = {
  initial,
  step,
};

export function createPlayChordMachine(questions: ChordQuestion[]): Machine<State, Event, Effect> {
  return createSessionMachine(questions, step);
}

/** The chords the first lesson asks for, in this order: C major, then F major and G major. */
const C_MAJOR_QUESTIONS: ChordQuestion[] = [
  {
    root: 60,
    quality: 'major',
  },
  {
    root: 65,
    quality: 'major',
  },
  {
    root: 67,
    quality: 'major',
  },
];

/** The lessons that ask for chords in other keys: the qualities each plays, every triad once. */
const KEYED_LESSONS: Record<string, readonly ChordQuality[]> = {
  'chords-play-major-minor': ['major', 'minor'],
  'chords-play-dim-aug': ['diminished', 'augmented'],
};

/** Whether the lesson asks for chords by their spelled names (everything but `chord-play-c-major`). */
export function isKeyedChordLesson(lessonId: string): boolean {
  return Object.prototype.hasOwnProperty.call(KEYED_LESSONS, lessonId);
}

/** A Fisher-Yates shuffle with the given random source. */
function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const r = rand();
    const j = Math.floor((Number.isFinite(r) ? Math.min(Math.max(r, 0), 1 - Number.EPSILON) : 0) * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * The chords a lesson asks for, in order. `chord-play-c-major`: C major, then F major and G major
 * (the three big chords of C, all on natural notes), always. `chords-play-major-minor`: all twelve
 * major and all twelve minor triads, in a random order; `chords-play-dim-aug`: the diminished and
 * augmented triads on the seven natural roots. Each carries its root as written (`spelled`) and
 * sounds it in the octave from middle C. Any other id gets the first lesson's chords.
 */
export function playChordQuestions(lessonId: string, rand: () => number = Math.random): ChordQuestion[] {
  const qualities = isKeyedChordLesson(lessonId) ? KEYED_LESSONS[lessonId] : undefined;
  if (!qualities) return C_MAJOR_QUESTIONS.map((q) => ({ ...q }));
  return shuffled(
    triadsOf(qualities).map((t) => ({
      root: 60 + pitchClass(t.root),
      quality: t.quality,
      spelled: t.root,
    })),
    rand,
  );
}
