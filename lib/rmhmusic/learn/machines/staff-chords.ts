/**
 * Reading a triad off the staff as a machine: ten questions, each a chord written on one stem that
 * the learner names (its root, with the sharp or flat where it is written, and its quality; in the
 * inversion lesson also which inversion). The lifecycle is the shared session machine in
 * `session.ts` (ask, feedback, next, saving, saved / failed / signed out; one `complete` per
 * attempt); this file holds the question, how it is written, the dealing and the grading. Pure.
 *
 * A question is built forward from the answer: the triad is spelled by letter (`spellTriad`), its
 * notes are stacked above a root chosen so every note fits the staff drawn, and an inversion lifts
 * the lowest notes an octave. A note's `written` is the natural it sits on and `accidental` the sign
 * before it (`SheetNote`), so what is drawn is what is spelled: F♯ major is F♯ A♯ C♯, three sharps.
 *
 * Two lessons use it. `chords-read-root-position` asks the four qualities in root position, on the
 * treble staff, and on the piano path the bass staff in every other question. `chords-read-inversions`
 * asks major and minor triads in root position, first or second inversion and the learner names the
 * chord and the inversion. The guitar path has no bass staff (a guitarist reads the treble clef).
 */
import type { SheetNote } from '../staff-card-layout';
import {
  CHORDS,
  CHORD_QUALITIES,
  hasDoubleAccidental,
  spellTriad,
  triadsOf,
  type ChordQuality,
  type Inversion,
  type Triad,
} from '../theory/chords';
import type { Clef } from '../theory/clef';
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

/** Questions in one lesson. */
export const STAFF_CHORD_QUESTIONS = 10;

export const STAFF_CHORD_LESSON_IDS = ['chords-read-root-position', 'chords-read-inversions'] as const;

/** What a lesson asks. */
export interface StaffChordsLesson {
  /** The qualities on the answer buttons, and the ones drawn. */
  qualities: readonly ChordQuality[];
  /** Whether first and second inversions are drawn (and named); false is root position only. */
  inversions: boolean;
}

const LESSONS: Record<(typeof STAFF_CHORD_LESSON_IDS)[number], StaffChordsLesson> = {
  'chords-read-root-position': { qualities: CHORD_QUALITIES, inversions: false },
  'chords-read-inversions': { qualities: ['major', 'minor'], inversions: true },
};

/** The lesson's setting, or null for an id that is not a staff-chords lesson. */
export function staffChordsLesson(lessonId: string): StaffChordsLesson | null {
  return Object.prototype.hasOwnProperty.call(LESSONS, lessonId) ? LESSONS[lessonId as keyof typeof LESSONS] : null;
}

/** One question: a triad written on a staff. */
export interface StaffChordQuestion {
  clef: Clef;
  root: SpelledNote;
  quality: ChordQuality;
  inversion: Inversion;
  /** The written notes, lowest first, as the sheet draws them. */
  notes: SheetNote[];
  /** The sounding pitches, lowest first. */
  midis: number[];
}

/** The learner's answer: a root (letter and sign), a quality and, in the inversion lesson, an inversion. */
export interface StaffChordAnswer {
  letter: SpelledNote['letter'];
  accidental: -1 | 0 | 1;
  quality: ChordQuality;
  inversion?: Inversion;
}

export type State = SessionState<StaffChordQuestion, StaffChordAnswer>;
export type Event = SessionEvent<StaffChordAnswer>;
export type Effect = SessionEffect;

/** Whether the answer names the written root (letter and sign), the quality and, when asked, the inversion. */
export function isRight(q: StaffChordQuestion, a: StaffChordAnswer): boolean {
  return (
    a.letter === q.root.letter &&
    a.accidental === q.root.accidental &&
    a.quality === q.quality &&
    (a.inversion === undefined || a.inversion === q.inversion)
  );
}

/**
 * Like `isRight`, but a lesson that asks the inversion needs one in the answer: an answer without
 * it (a screen that forgot) is not right.
 */
export function isRightFor(lesson: StaffChordsLesson): (q: StaffChordQuestion, a: StaffChordAnswer) => boolean {
  return (q, a) => isRight(q, a) && (!lesson.inversions || a.inversion !== undefined);
}

export function initial(questions: StaffChordQuestion[]): State {
  return sessionInitial(questions);
}

export function createStaffChordsMachine(
  questions: StaffChordQuestion[],
  lesson: StaffChordsLesson,
): Machine<State, Event, Effect> {
  return createSessionMachine(questions, sessionStep<StaffChordQuestion, StaffChordAnswer>(isRightFor(lesson)));
}

type Rand = () => number;

const unit = (r: number) => (Number.isFinite(r) ? Math.min(Math.max(r, 0), 1 - Number.EPSILON) : 0);
const pick = <T>(xs: readonly T[], rand: Rand): T => xs[Math.floor(unit(rand()) * xs.length)] as T;

function shuffled<T>(xs: readonly T[], rand: Rand): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(unit(rand()) * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * The window the chord's root sounds in before any inversion lifts notes, by clef and whether the
 * chord is inverted: chosen so that every note of every inversion sits inside the drawn staff
 * (treble up to C6, bass from C2 up to E4) and the lowest note is never far below the staff.
 */
const ROOT_WINDOW: Record<Clef, Record<'root' | 'inverted', readonly [number, number]>> = {
  treble: { root: [60, 71], inverted: [55, 66] },
  bass: { root: [38, 49], inverted: [36, 47] },
};

/** The triads a lesson draws: the tables' triads of its qualities that need no double accidental. */
export function staffChordTriads(lesson: StaffChordsLesson): Triad[] {
  return triadsOf(lesson.qualities).filter((t) => !hasDoubleAccidental(spellTriad(t.root, t.quality)));
}

/** The chord written: `triad` on `clef` in `inversion`, its root sounding as the lowest of the window's pitches that has its pitch class. */
export function writeTriad(
  triad: Triad,
  clef: Clef,
  inversion: Inversion,
  rand: Rand = Math.random,
): StaffChordQuestion {
  const spelled = spellTriad(triad.root, triad.quality);
  const [lo, hi] = ROOT_WINDOW[clef][inversion === 0 ? 'root' : 'inverted'];
  const rootPc = pitchClass(triad.root);
  const candidates: number[] = [];
  for (let m = lo; m <= hi; m++) if (m % 12 === rootPc) candidates.push(m);
  // A window is an octave wide, so one pitch fits; the pick only matters if a window ever widens.
  const rootMidi = pick(candidates, rand);
  const stack = CHORDS[triad.quality].map((semitones, i) => {
    const midi = rootMidi + semitones;
    const accidental = (spelled[i] as SpelledNote).accidental;
    return { midi, written: midi - accidental, accidental };
  });
  // First inversion lifts the root, second lifts the root and the third.
  const lifted = stack.map((n, i) => (i < inversion ? { ...n, midi: n.midi + 12, written: n.written + 12 } : n));
  lifted.sort((a, b) => a.midi - b.midi);
  return {
    clef,
    root: triad.root,
    quality: triad.quality,
    inversion,
    notes: lifted.map((n) => ({ written: n.written, accidental: n.accidental as -1 | 0 | 1 })),
    midis: lifted.map((n) => n.midi),
  };
}

/**
 * The questions of one lesson: `STAFF_CHORD_QUESTIONS` triads, each quality (and each inversion)
 * about equally often, the roots drawn at random without repeating a triad. On the piano path
 * (`bass`) every other question is on the bass staff; otherwise all are treble. An unknown lesson
 * has none.
 */
export function staffChordQuestions(
  lessonId: string,
  options: { bass: boolean },
  rand: Rand = Math.random,
  count = STAFF_CHORD_QUESTIONS,
): StaffChordQuestion[] {
  const lesson = staffChordsLesson(lessonId);
  if (!lesson || !Number.isFinite(count) || count < 1) return [];
  const triads = staffChordTriads(lesson);
  // Each quality (and, in the inversion lesson, each inversion) goes round, then the order is shuffled.
  const order = shuffled(lesson.qualities, rand);
  const offset = Math.floor(unit(rand()) * 3);
  const plan = shuffled(
    Array.from({ length: count }, (_, i) => ({
      quality: order[i % order.length] as ChordQuality,
      inversion: (lesson.inversions ? (i + offset) % 3 : 0) as Inversion,
    })),
    rand,
  );
  const used = new Set<string>();
  return plan.map(({ quality, inversion }, i) => {
    const pool = triads.filter((t) => t.quality === quality);
    const key = (t: Triad) => `${t.root.letter}${t.root.accidental}${t.quality}`;
    const fresh = pool.filter((t) => !used.has(key(t)));
    const triad = pick(fresh.length > 0 ? fresh : pool, rand);
    used.add(key(triad));
    // On the piano path every other question is on the bass staff.
    return writeTriad(triad, options.bass && i % 2 === 1 ? 'bass' : 'treble', inversion, rand);
  });
}
