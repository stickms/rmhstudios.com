/**
 * Playing a scale as a machine: a few scales to play, each asked by name ("G major, one octave
 * up"). The learner plays its eight notes one after another (on the on-screen keys, the computer
 * keys, a MIDI controller, the fretboard or the microphone) and the screen answers with all eight;
 * one scale is one answer to the session machine.
 *
 * Grading is note by note, in order (`gradeScale`): the nth note played is held against the nth
 * note of the scale, by pitch class and direction (each note must be higher than the one before);
 * where the octave is not free (the piano) it must be the exact pitch asked. A wrong note is
 * marked and the learner carries on with the next degree, so one slip costs one note, and the
 * scale is right only when all eight are. The lifecycle (one answer per scale, `next` only after
 * it, one `complete` per attempt, a stale save answer ignored) is the shared session machine in
 * `session.ts`. Pure.
 */
import type { FretPosition } from '../theory/fretboard';
import { STANDARD_TUNING, positionsOf } from '../theory/fretboard';
import { pitchClass, scaleMidis, type ScaleKind, type SpelledNote } from '../theory/scales';
import type { Machine } from './runner';
import {
  createSessionMachine,
  sessionInitial,
  sessionStep,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from './session';

/** A scale to play, one octave up from `start` (the tonic's sounding MIDI number). */
export interface ScaleQuestion {
  tonic: SpelledNote;
  kind: ScaleKind;
  start: number;
  /** True where any octave will do (guitar): only pitch class and direction are graded. */
  octaveFree: boolean;
}

/** The notes the learner played, in order. */
export interface ScaleAnswer {
  midis: number[];
}

/** Notes in one octave of a scale, the tonic repeated at the top. */
export const SCALE_NOTE_COUNT = 8;

export type State = SessionState<ScaleQuestion, ScaleAnswer>;
export type Event = SessionEvent<ScaleAnswer>;
export type Effect = SessionEffect;

export type NoteMark = 'right' | 'wrong';

/** One mark per note played: is it the scale's note for that place? */
export function gradeScale(q: ScaleQuestion, midis: readonly number[]): NoteMark[] {
  const want = scaleMidis(q.kind, q.start);
  return midis.slice(0, SCALE_NOTE_COUNT).map((m, i) => {
    const target = want[i] as number;
    if (q.octaveFree ? mod12(m) !== mod12(target) : m !== target) return 'wrong';
    const before = midis[i - 1];
    return before !== undefined && m <= before ? 'wrong' : 'right';
  });
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** Whether the learner has played all the notes the scale needs. */
export function isScaleComplete(midis: readonly number[]): boolean {
  return midis.length >= SCALE_NOTE_COUNT;
}

/** A scale is right when all eight notes were played, each right. */
export function isRight(q: ScaleQuestion, a: ScaleAnswer): boolean {
  return a.midis.length === SCALE_NOTE_COUNT && gradeScale(q, a.midis).every((m) => m === 'right');
}

const gradedStep = sessionStep<ScaleQuestion, ScaleAnswer>(isRight);

/**
 * Only a whole attempt is graded: an answer of any other length is a half-played scale (the screen
 * collects the notes and answers on the eighth), so the machine holds that rule too.
 */
export const step: typeof gradedStep = (s, e) => {
  if (e.type === 'answer' && s.kind === 'asking' && e.answer.midis.length !== SCALE_NOTE_COUNT) {
    return {
      state: s,
      effects: [],
    };
  }
  return gradedStep(s, e);
};

export const playScaleMachine = {
  initial: sessionInitial,
  step,
};

export function createPlayScaleMachine(questions: ScaleQuestion[]): Machine<State, Event, Effect> {
  return createSessionMachine(questions, step);
}

const tonicOf = (id: string): SpelledNote => {
  const m = /^([A-G])(#|b)?$/.exec(id);
  return {
    letter: (m?.[1] ?? 'C') as SpelledNote['letter'],
    accidental: m?.[2] === '#' ? 1 : m?.[2] === 'b' ? -1 : 0,
  };
};

/** The scales a lesson asks for, in order (`ids` are tonic names). */
const LESSON_SCALES: Record<
  string,
  {
    kind: ScaleKind;
    tonics: readonly string[];
  }
> = {
  'scales-major-white': {
    kind: 'major',
    tonics: ['C', 'G', 'D', 'F'],
  },
  'scales-major-all': {
    kind: 'major',
    tonics: ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'],
  },
  'scales-minor-natural': {
    kind: 'natural-minor',
    tonics: ['A', 'E', 'D', 'G', 'C'],
  },
};

export type ScaleInstrument = 'piano' | 'guitar';

/**
 * Where a scale starts. Piano: the tonic in the octave of middle C (C4…B4), so its eight notes
 * sit on the keys a learner already knows. Guitar: the lowest tonic on the neck (E2 up), with
 * the octave free; every note of the run is within the first five frets.
 */
export function scaleStart(tonic: SpelledNote, instrument: ScaleInstrument): number {
  const pc = pitchClass(tonic);
  const floor = instrument === 'guitar' ? (STANDARD_TUNING[0] ?? 40) : 60;
  return floor + mod12(pc - floor);
}

/** The scales of a lesson for an instrument; empty for a lesson that is not a scale lesson. */
export function playScaleQuestions(lessonId: string, instrument: ScaleInstrument): ScaleQuestion[] {
  const lesson = LESSON_SCALES[lessonId];
  if (!lesson) return [];
  return lesson.tonics.map((id) => {
    const tonic = tonicOf(id);
    return {
      tonic,
      kind: lesson.kind,
      start: scaleStart(tonic, instrument),
      octaveFree: instrument === 'guitar',
    };
  });
}

/**
 * The right-hand fingering of a piano scale, for the white-key majors: 1 2 3 1 2 3 4 5, except F,
 * whose fourth finger reaches the B♭ (1 2 3 4 1 2 3 4). Null for any other scale.
 */
export function fingering(q: ScaleQuestion): number[] | null {
  if (q.kind !== 'major' || q.octaveFree || q.tonic.accidental !== 0) return null;
  return q.tonic.letter === 'F' ? [1, 2, 3, 4, 1, 2, 3, 4] : [1, 2, 3, 1, 2, 3, 4, 5];
}

/**
 * One position on the neck for a guitar scale: each note on its lowest string within frets 0–5,
 * so the eight notes form one run the learner can see and keep in one place.
 */
export function guitarPosition(q: ScaleQuestion): FretPosition[] {
  const out: FretPosition[] = [];
  for (const m of scaleMidis(q.kind, q.start)) {
    const p = positionsOf(m, 5)[0];
    if (p) out.push(p);
  }
  return out;
}
