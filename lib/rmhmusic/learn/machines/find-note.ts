/**
 * The note finder as a machine: ten target notes, each found on the instrument — a key of the
 * piano, or a string and fret of the guitar — then the result saved like any lesson's. Pure.
 *
 * The lifecycle is the shared session machine (`session.ts`), the same one the flashcards run on:
 * an answer leaves `asking` synchronously, so a double tap, a key repeat, or a fret tap and a
 * played note in one tick answer a target once; `next` saves exactly once past the last target;
 * Retry saves again as a new attempt and a stale save answer is ignored.
 *
 * A target is a SOUNDING pitch (MIDI). Answers:
 * - `{ kind: 'position', string, fret }` — a fret cell tapped. Right when that place sounds the
 *   target, on any string: E4 is the open high E, the B string's 5th fret or the G string's 9th.
 * - `{ kind: 'midi', midi }` — a key tapped, or a note played on MIDI, the computer keys or the
 *   microphone. Right only on the exact sounding pitch (the octave counts: a guitar's open low E is
 *   E2, written E3; playing E3 is a different note).
 *
 * What is asked follows the learner's instrument (`findNotePool`):
 * - `keyboard-map` (Keyboard layout & open strings): on guitar the six open strings, E2 A2 D3 G3
 *   B3 E4; on piano the seven white keys from middle C, C4…B4 — one group of two black keys and
 *   one of three, the window the on-screen piano opens on.
 * - `fretboard` (First frets): on guitar every natural some string sounds in frets 0–5 (E2…A4, so
 *   each target has at least one position on the board shown); on piano the naturals of the two
 *   octaves from C3 (C3…B4), which take the octave buttons on a phone.
 * Naturals only (Phase 2), so no enharmonic naming. Ten targets are dealt with `dealRounds`: the
 * whole pool before any repeat, never the same target twice in a row.
 */
import { dealRounds } from '../content/decks';
import { inKeysRange } from '../input/keyboard-map';
import type { Instrument } from '../schemas';
import type { Clef } from '../theory/clef';
import {
  FIRST_FRETS,
  STANDARD_TUNING,
  fretMidi,
  isPosition,
  naturalsInFrets,
  writtenMidi,
} from '../theory/fretboard';
import type { Machine } from './runner';
import {
  createSessionMachine,
  sessionInitial,
  sessionStep,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from './session';

/** Targets in one lesson. */
export const FIND_NOTE_TARGETS = 10;

/** One note to find: the pitch it sounds. */
export interface Target {
  midi: number;
}

export type Answer =
  | { kind: 'position'; string: number; fret: number }
  /** `tapped`: from the on-screen piano rather than played (only the wording differs). */
  | { kind: 'midi'; midi: number; tapped?: boolean };

export type State = SessionState<Target, Answer>;
export type Event = SessionEvent<Answer>;
export type Effect = SessionEffect;

/** The lessons the note finder runs (their `LessonMode`). */
export type FindNoteMode = 'keyboard-map' | 'fretboard';

/** The pitch an answer sounds, or null for a place that is not on the board. */
export function answerMidi(answer: Answer): number | null {
  if (answer.kind === 'midi') return Number.isFinite(answer.midi) ? answer.midi : null;
  return isPosition(answer.string, answer.fret) ? fretMidi(answer.string, answer.fret) : null;
}

/** Whether `answer` sounds `target`. */
export function isRight(target: Target, answer: Answer): boolean {
  const midi = answerMidi(answer);
  return midi !== null && midi === target.midi;
}

export const step = sessionStep<Target, Answer>(isRight);

export function initial(targets: Target[]): State {
  return sessionInitial(targets);
}

export const findNoteMachine = { initial, step };

export function createFindNoteMachine(targets: Target[]): Machine<State, Event, Effect> {
  return createSessionMachine(targets, step);
}

const naturalsBetween = (low: number, high: number): number[] => {
  const out: number[] = [];
  for (let m = low; m <= high; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) out.push(m);
  return out;
};

/** The sounding pitches a lesson asks for, for the learner's instrument (see the header). */
export function findNotePool(mode: FindNoteMode, instrument: Instrument): number[] {
  if (instrument === 'guitar') {
    return mode === 'keyboard-map' ? [...STANDARD_TUNING] : naturalsInFrets(FIRST_FRETS);
  }
  return mode === 'keyboard-map' ? naturalsBetween(60, 71) : naturalsBetween(48, 71);
}

/**
 * Where a target is drawn: guitar music on the treble staff an octave above the sounding pitch
 * (the open low E, sounding E2, sits on E3 under three ledger lines); piano at pitch, on the treble
 * staff from middle C up and on the bass staff below it.
 */
export function targetStaff(midi: number, instrument: Instrument): { clef: Clef; midi: number } {
  if (instrument === 'guitar') return { clef: 'treble', midi: writtenMidi(midi) };
  return { clef: midi < 60 ? 'bass' : 'treble', midi };
}

/** Deal `count` targets from `pool`: the whole pool before any repeat, never one twice in a row. */
export function dealTargets(pool: readonly number[], count: number, rand: () => number): Target[] {
  return dealRounds(pool, count, rand).map((midi) => ({ midi }));
}

/**
 * Whether "or play it" is true for a target on this input: the microphone and a MIDI controller
 * play anything, the computer keys only reach C4 to C5, and the on-screen input has nothing to
 * play (the board is the input).
 */
export function playHintFits(input: 'screen' | 'keys' | 'mic' | 'midi', midi: number): boolean {
  if (input === 'screen') return false;
  return input === 'keys' ? inKeysRange(midi) : true;
}
