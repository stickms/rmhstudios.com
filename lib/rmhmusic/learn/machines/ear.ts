/**
 * Ear training as a machine: ten questions, each a sound the learner hears and then names
 * (an interval — two notes one after the other — or a chord — three notes together), with the session lifecycle of `session.ts` (asking →
 * feedback → next → saving → saved / failed with Retry / signed out, one `complete` effect per
 * attempt, a stale save answer ignored). Pure.
 *
 * What the ear lessons add to the shared session:
 * - **A question must be heard before it can be answered.** `asking` carries `heard`; the screen
 *   sends `played` once the sound actually started (audio can be suspended or blocked, and then
 *   nothing sounded), and `answer` is ignored until then. So the machine never advances on a
 *   question the learner could not hear, whatever the screen does.
 * - **`replay`** emits `{ type: 'play' }` for the current question, any number of times and with
 *   no penalty: it changes no state (the same state object comes back), so it never touches the
 *   score. It also works after the answer, to hear the right one again. Past the session's end it
 *   does nothing.
 *
 * The screen carries `play` out (so a replay that waited for audio to wake can be dropped if the
 * learner has moved on) and answers `played` for the question it sounded.
 */
import { shuffle } from '../content/decks';
import { CHORDS, chordNotes, type ChordQuality } from '../theory/chords';
import { INTERVALS, type IntervalName } from '../theory/intervals';
import type { Machine } from './runner';
import {
  sessionInitial,
  sessionStep,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from './session';

/** Questions in one lesson. */
export const EAR_QUESTIONS = 10;

/** The roots (MIDI) a question may start on: C3 to C5. */
const ROOT_MIN = 48;
const ROOT_MAX = 72;
/** The whole range both notes stay in: C2 to C6. */
const RANGE_MIN = 36;
const RANGE_MAX = 84;

/** What a lesson asks about: two notes in turn, or three together. */
export type EarKind = 'interval' | 'chord';

/** A name from the answer buttons: an interval's or a chord quality's. */
export type EarName = IntervalName | ChordQuality;

/**
 * One question: what kind it is (an interval's notes sound in turn, a chord's together), the notes
 * to sound, and the name that is the right answer.
 */
export interface Question {
  kind: EarKind;
  notes: number[];
  answer: EarName;
}

/** The learner's answer: a name from the buttons. */
export interface Answer {
  name: EarName;
}

type Base = SessionState<Question, Answer>;

export type State =
  | Exclude<Base, { kind: 'asking' }>
  | (Extract<Base, { kind: 'asking' }> & {
      /** The sound of this question has played, so it can be answered. */
      heard: boolean;
    });

export type Event = SessionEvent<Answer> | { type: 'replay' } | { type: 'played'; index: number };

export type Effect =
  SessionEffect | { type: 'play'; index: number; kind: EarKind; notes: readonly number[] };

const unit = (r: number) => (Number.isFinite(r) ? Math.min(Math.max(r, 0), 1 - Number.EPSILON) : 0);
const pick = (n: number, rand: () => number) => Math.floor(unit(rand()) * n);

/** Whether `name` is a name of this kind (an interval word is never a chord quality). */
function isName(kind: EarKind, name: string): name is EarName {
  return kind === 'interval' ? name in INTERVALS : name in CHORDS;
}

/**
 * One question of `kind` from `pool`. An interval: ascending, of one of the pool's names (either
 * size of a third). A chord: a root-position triad of one of its qualities. Either on a root in C3
 * to C5, or the given `root`, kept so every note stays in C2 to C6.
 */
export function makeQuestion(
  kind: EarKind,
  pool: readonly EarName[],
  rand: () => number,
  root?: number,
): Question {
  if (pool.length === 0) throw new RangeError('ear: an empty pool');
  const answer = pool[pick(pool.length, rand)];
  if (!isName(kind, answer)) throw new RangeError(`ear: "${answer}" is not a ${kind}`);
  const size =
    kind === 'interval'
      ? (() => {
          const sizes = INTERVALS[answer as IntervalName].semitones;
          return sizes[pick(sizes.length, rand)];
        })()
      : Math.max(...CHORDS[answer as ChordQuality]);
  const low =
    root === undefined || !Number.isFinite(root)
      ? ROOT_MIN + pick(ROOT_MAX - ROOT_MIN + 1, rand)
      : Math.round(root);
  const start = Math.min(Math.max(low, RANGE_MIN), RANGE_MAX - size);
  return {
    kind,
    notes: kind === 'interval' ? [start, start + size] : chordNotes(start, answer as ChordQuality),
    answer,
  };
}

/**
 * `count` questions: each name of the pool about as often (so a two-name pool is never a coin the
 * learner can beat without listening), in a random order that may repeat a name.
 */
export function dealQuestions(
  kind: EarKind,
  pool: readonly EarName[],
  count: number,
  rand: () => number,
): Question[] {
  if (!Number.isFinite(count) || count < 1 || pool.length === 0) return [];
  const names = Array.from({ length: Math.floor(count) }, (_, i) => pool[i % pool.length]);
  return shuffle(names, rand).map((name) => makeQuestion(kind, [name], rand));
}

/** What a lesson asks about. */
export function earKind(lessonId: string): EarKind {
  return lessonId === 'ear-major-minor' ? 'chord' : 'interval';
}

/** The names a lesson's answer buttons offer (and its questions are drawn from). */
export function earPool(lessonId: string): EarName[] {
  switch (lessonId) {
    case 'ear-fifth-octave':
      return ['third', 'fifth', 'octave'];
    case 'ear-major-minor':
      return ['major', 'minor'];
    default:
      return ['second', 'third'];
  }
}

const base = sessionStep<Question, Answer>((q, a) => q.answer === a.name);

export function initial(questions: Question[]): State {
  const s = sessionInitial<Question, Answer>(questions);
  return { ...s, heard: false } as State;
}

const same = (state: State) => ({ state, effects: [] as Effect[] });

export function step(s: State, e: Event): { state: State; effects: Effect[] } {
  if (e.type === 'replay') {
    if (s.kind !== 'asking' && s.kind !== 'feedback') return same(s);
    const q = s.cards[s.index];
    if (!q) return same(s);
    return {
      state: s,
      effects: [{ type: 'play', index: s.index, kind: q.kind, notes: q.notes }],
    };
  }
  if (e.type === 'played') {
    if (s.kind !== 'asking' || s.index !== e.index || s.heard) return same(s);
    return { state: { ...s, heard: true }, effects: [] };
  }
  if (e.type === 'answer' && s.kind === 'asking' && !s.heard) return same(s);
  const r = base(s, e);
  if (r.state === s) return { state: s, effects: r.effects };
  // A question reached by Next starts unheard.
  const state = (r.state.kind === 'asking' ? { ...r.state, heard: false } : r.state) as State;
  return { state, effects: r.effects };
}

export const earMachine = { initial, step };

/** The machine for one lesson's questions, in the shape `createRunner` takes. */
export function createEarMachine(questions: Question[]): Machine<State, Event, Effect> {
  return { initial: initial(questions), step };
}
