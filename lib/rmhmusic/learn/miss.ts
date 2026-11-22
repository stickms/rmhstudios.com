/**
 * What a wrong answer was, measured against the right one — pure, shared by every drill that
 * shows a miss on the staff (flashcards, Practice, Sprint).
 *
 * An answer is either a note actually sounded or struck (`midi`: the exact pitch, octave
 * included), a note played where the octave is not known (`pitch-class`: the computer keys and the
 * microphone), or only a letter with an optional accidental (`letter`: a button, a key, a voice or a
 * guitar in some octave). A letter or a pitch class has no octave of its own, so for drawing and
 * measuring it is put at the octave nearest the right note: the smallest honest mistake it could have
 * been. "How far off" is then counted in staff steps (lines and spaces), because that is what a reader
 * sees: a note one step above is the neighbouring line or space, seven steps is an octave.
 *
 * A sharp or flat is drawn on the natural it is written on with its sign before it, so a wrong answer
 * of "G♭" is drawn on the G line with a flat, not on the F line. The target may be spelled too (a B♭
 * is written on B): pass its `written` natural so the distance is counted between written notes.
 */
import { staffStep, isSharp } from './staff';
import { noteLetter } from './theory/clef';

const LETTER_PC: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export type MissAnswer =
  | { kind: 'letter'; letter: string; accidental?: number }
  | { kind: 'midi'; midi: number }
  | { kind: 'pitch-class'; pc: number };

const mod12 = (n: number): number => ((Math.round(n) % 12) + 12) % 12;

/** The note with pitch class `pc` nearest `target` (a tie goes to the lower note). */
function nearestWithPc(target: number, pc: number): number {
  const t = Math.round(target);
  const base = t - mod12(t) + mod12(pc);
  let best = base;
  for (const m of [base - 12, base + 12]) {
    if (Math.abs(m - t) < Math.abs(best - t)) best = m;
  }
  return best;
}

/** The pitch an answer stands for: a played note as played, a letter or pitch class at the octave nearest `target`. */
export function playedMidi(target: number, answer: MissAnswer): number | null {
  if (answer.kind === 'midi') {
    return Number.isFinite(answer.midi) ? Math.round(answer.midi) : null;
  }
  if (!Number.isFinite(target)) return null;
  if (answer.kind === 'pitch-class') {
    return Number.isFinite(answer.pc) ? nearestWithPc(target, answer.pc) : null;
  }
  const pc = LETTER_PC[answer.letter];
  if (pc === undefined) return null;
  const accidental = Number.isFinite(answer.accidental) ? Math.round(answer.accidental ?? 0) : 0;
  return nearestWithPc(target, pc + accidental);
}

export interface Miss {
  /** The pitch drawn on the staff for the answer (what it sounds). */
  midi: number;
  /** The natural the answer is drawn on: the note itself, or the one its sign alters. */
  written: number;
  /** The sign drawn before it: −1 flat, 0 none, +1 sharp. */
  accidental: -1 | 0 | 1;
  /** Its name with octave: "E4", "F♯4", "B♭3". */
  name: string;
  /** Staff steps from the right note, always positive (a step is a line to the next space). */
  steps: number;
  /** Above the right note on the staff, below it, or on the same line or space (an accidental). */
  direction: 'above' | 'below' | 'level';
  /** The same letter an octave or more away: the right note name, the wrong register. */
  sameLetter: boolean;
  /** The answer had no octave (a letter or a pitch class), so `midi` is where it would be nearest, not what sounded. */
  letterOnly: boolean;
}

export interface MissOptions {
  /** The natural the right note is written on, when it is a sharp, a flat or a note a key alters. */
  written?: number;
  /** How to spell a black key played where no spelling was given: −1 as a flat, +1 (the default) as a sharp. */
  spell?: -1 | 1;
}

/** "E4", "F♯4", "B♭3": the written natural's letter and octave with the sign between. */
export function spelledNoteName(written: number, accidental: number): string {
  const octave = Math.floor(Math.round(written) / 12) - 1;
  return `${noteLetter(written)}${accidental > 0 ? '♯' : accidental < 0 ? '♭' : ''}${octave}`;
}

/** How a wrong answer compares with the right note; null when the answer has no pitch. */
export function describeMiss(target: number, answer: MissAnswer, options: MissOptions = {}): Miss | null {
  const midi = playedMidi(target, answer);
  if (midi === null || !Number.isFinite(target)) return null;
  let accidental: -1 | 0 | 1 = 0;
  let written = midi;
  if (answer.kind === 'letter') {
    const a = Number.isFinite(answer.accidental) ? Math.round(answer.accidental ?? 0) : 0;
    accidental = a > 0 ? 1 : a < 0 ? -1 : 0;
    written = midi - accidental;
  } else if (isSharp(midi)) {
    accidental = options.spell === -1 ? -1 : 1;
    written = midi - accidental;
  }
  const diff = staffStep(written) - staffStep(options.written ?? target);
  return {
    midi,
    written,
    accidental,
    name: spelledNoteName(written, accidental),
    steps: Math.abs(diff),
    direction: diff > 0 ? 'above' : diff < 0 ? 'below' : 'level',
    sameLetter: mod12(midi) === mod12(target) && midi !== Math.round(target),
    letterOnly: answer.kind !== 'midi',
  };
}
