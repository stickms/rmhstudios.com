/**
 * What a wrong answer was, measured against the right one — pure, shared by every drill that
 * shows a miss on the staff (flashcards, Practice, Sprint).
 *
 * An answer is either a note actually sounded or struck (`midi`: the exact pitch, octave
 * included) or only a letter (`letter`: a button, a computer key, a voice or a guitar in some
 * octave). A letter has no pitch of its own, so for drawing and measuring it is put at the octave
 * nearest the right note: the smallest honest mistake that letter could have been. "How far off"
 * is then counted in staff steps (lines and spaces), because that is what a reader sees: a note
 * one step above is the neighbouring line or space, seven steps is an octave.
 */
import { staffStep } from './staff';
import { midiToName } from './pitch/notes';

const LETTER_PC: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export type MissAnswer = { kind: 'letter'; letter: string } | { kind: 'midi'; midi: number };

/** The pitch an answer stands for: a played note as played, a letter at the octave nearest `target`. */
export function playedMidi(target: number, answer: MissAnswer): number | null {
  if (answer.kind === 'midi') {
    return Number.isFinite(answer.midi) ? Math.round(answer.midi) : null;
  }
  const pc = LETTER_PC[answer.letter];
  if (pc === undefined || !Number.isFinite(target)) return null;
  const t = Math.round(target);
  const base = t - (((t % 12) + 12) % 12) + pc;
  // The nearest of this octave's note and the ones either side (a tie goes to the lower note).
  let best = base;
  for (const m of [base - 12, base + 12]) {
    if (Math.abs(m - t) < Math.abs(best - t)) best = m;
  }
  return best;
}

export interface Miss {
  /** The pitch drawn on the staff for the answer. */
  midi: number;
  /** Its name with octave: "E4". */
  name: string;
  /** Staff steps from the right note, always positive (a step is a line to the next space). */
  steps: number;
  /** Above the right note on the staff, below it, or on the same line or space (an accidental). */
  direction: 'above' | 'below' | 'level';
  /** The same letter an octave or more away: the right note name, the wrong register. */
  sameLetter: boolean;
  /** The answer named only a letter, so `midi` is where it would be nearest, not what sounded. */
  letterOnly: boolean;
}

/** How a wrong answer compares with the right note; null when the answer has no pitch. */
export function describeMiss(target: number, answer: MissAnswer): Miss | null {
  const midi = playedMidi(target, answer);
  if (midi === null || !Number.isFinite(target)) return null;
  const diff = staffStep(midi) - staffStep(target);
  const pc = (n: number) => ((Math.round(n) % 12) + 12) % 12;
  return {
    midi,
    name: midiToName(midi),
    steps: Math.abs(diff),
    direction: diff > 0 ? 'above' : diff < 0 ? 'below' : 'level',
    sameLetter: pc(midi) === pc(target) && midi !== Math.round(target),
    letterOnly: answer.kind === 'letter',
  };
}
