/**
 * Naming a key from its signature as a machine: ten staff cards, each a key signature on the
 * treble or the bass staff, and four buttons naming keys; the learner picks the major key (or, in
 * the minor lesson, the minor key) that has that signature. Pure recognition: no instrument.
 *
 * The lifecycle is the shared session machine in `session.ts`; this file holds the question, the
 * grading and the dealing. The wrong answers are the neighbours on the circle of fifths (a key
 * with one more or one fewer accidental), the mistake a learner actually makes, and they are all
 * keys of the mode asked, so exactly one button is right.
 */
import type { Clef } from '../theory/clef';
import { MAJOR_KEYS, MINOR_KEYS, keyId, type Key, type KeyMode } from '../theory/key-signatures';
import type { Machine } from './runner';
import {
  createSessionMachine,
  sessionInitial,
  sessionStep,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from './session';

export interface KeyQuestion {
  /** The key whose signature is drawn. */
  key: Key;
  clef: Clef;
  /** The four keys on the buttons, the answer among them, in the order shown. */
  choices: Key[];
}

/** The id of the key the learner picked (`keyId`). */
export interface KeyAnswer {
  id: string;
}

export type State = SessionState<KeyQuestion, KeyAnswer>;
export type Event = SessionEvent<KeyAnswer>;
export type Effect = SessionEffect;

export function isRight(q: KeyQuestion, a: KeyAnswer): boolean {
  return a.id === keyId(q.key);
}

export const step = sessionStep<KeyQuestion, KeyAnswer>(isRight);

export const keySignatureMachine = {
  initial: sessionInitial,
  step,
};

export function createKeySignatureMachine(questions: KeyQuestion[]): Machine<State, Event, Effect> {
  return createSessionMachine(questions, step);
}

/** Questions in a session. */
export const KEY_QUESTION_COUNT = 10;

/** The mode a lesson asks for: the first key-signature lesson is major, the second minor. */
export function keyLessonMode(lessonId: string): KeyMode {
  return lessonId === 'key-signatures-minor' ? 'minor' : 'major';
}

type Rand = () => number;

function shuffled<T>(xs: readonly T[], rand: Rand): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * Three wrong keys for `answer` out of `pool` (the 15 keys of one mode, in circle-of-fifths
 * order: C, the sharp keys, then the flat keys): the nearest on the circle first.
 */
function distractors(answer: Key, pool: readonly Key[], rand: Rand): Key[] {
  // Position on the circle: 0 is no accidentals, sharps count up (+1…+7), flats count down.
  const pos = (k: Key) => {
    const i = pool.findIndex((p) => keyId(p) === keyId(k));
    return i <= 7 ? i : -(i - 7);
  };
  const at = pos(answer);
  const others = pool
    .filter((p) => keyId(p) !== keyId(answer))
    .map((k) => ({
      k,
      d: Math.abs(pos(k) - at),
      r: rand(),
    }))
    .sort((a, b) => a.d - b.d || a.r - b.r);
  return others.slice(0, 3).map((o) => o.k);
}

/** Ten questions for a lesson: ten different keys, each on a random clef. */
export function keySignatureQuestions(lessonId: string, rand: Rand = Math.random): KeyQuestion[] {
  const pool = keyLessonMode(lessonId) === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  return shuffled(pool, rand)
    .slice(0, KEY_QUESTION_COUNT)
    .map((key) => ({
      key,
      clef: (rand() < 0.5 ? 'treble' : 'bass') as Clef,
      choices: shuffled([key, ...distractors(key, pool, rand)], rand),
    }));
}
