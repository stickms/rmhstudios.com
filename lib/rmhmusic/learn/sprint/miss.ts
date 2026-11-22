/**
 * What a wrong Sprint answer looked like against the written prompt — pure.
 *
 * The staff shows WRITTEN notes (a natural on a line or space, plus the printed accidental), while
 * the learner's instrument sounds them somewhere else (guitar and tenor music sounds an octave
 * below the page: `promptMidis`). So a played pitch is first moved back to the page (`written =
 * sounding + shift`) and then spelled the way a keyboard player would write it: a white key on its
 * own line or space, a black key as a sharp on the line or space below. Steps are counted on the
 * page, between WRITTEN positions, because that is what a reader sees: a flat E (E♭ on the E line)
 * answered with E natural is zero steps off — the right line, the wrong accidental.
 *
 * Only a MIDI keyboard plays the octave it means: every other input answers by pitch class (the
 * machine's `sameNote`), so for those the played pitch is drawn at the octave nearest the written
 * note, the smallest honest mistake, and no octave is claimed.
 */
import { BAR_X, CARD_NOTE_X, type SheetNote } from '../staff-card-layout';
import { staffStep } from '../staff';
import type { SprintPrompt } from './generate';

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

const pcOf = (m: number): number => ((Math.round(m) % 12) + 12) % 12;

/** How far the page sits above the sound: a guitar's treble and a tenor's octave clef read 12 up. */
export function writtenShift(prompt: SprintPrompt, instrument: 'piano' | 'guitar' | 'voice'): number {
  return (instrument === 'guitar' && prompt.clef === 'treble') || prompt.octaveClef ? 12 : 0;
}

/** A sounding pitch as the page writes it: a white key on its line, a black key as a sharp. */
export function writtenNoteOf(sounding: number, shift: number): SheetNote {
  const w = Math.round(sounding) + shift;
  return NATURAL_PCS.has(pcOf(w))
    ? {
        written: w,
        accidental: 0,
      }
    : {
        written: w - 1,
        accidental: 1,
      };
}

/** The pitch with `pc` nearest `near` (a tie goes to the lower one). */
function nearestWithPc(near: number, pc: number): number {
  const n = Math.round(near);
  const base = n - pcOf(n) + pc;
  let best = base;
  for (const m of [base - 12, base + 12]) if (Math.abs(m - n) < Math.abs(best - n)) best = m;
  return best;
}

/** A pitch's name: letter and accidental, with its octave when the octave is meant. */
export function pitchName(midi: number, withOctave: boolean): string {
  const m = Math.round(midi);
  return `${NAMES[pcOf(m)]}${withOctave ? Math.floor(m / 12) - 1 : ''}`;
}

/** A written note's name as the sheet spells it (flat for a flat), octave from its sounding pitch. */
export function writtenName(n: SheetNote, sounding: number, withOctave: boolean): string {
  const letter = NAMES[pcOf(n.written)];
  const mark = n.accidental > 0 ? '♯' : n.accidental < 0 ? '♭' : '';
  return `${letter}${mark}${withOctave ? Math.floor(Math.round(sounding) / 12) - 1 : ''}`;
}

export type SprintMissFacts =
  | {
      type: 'note';
      /** What was played and what was written, named (with octave only when the octave counted). */
      played: string;
      wanted: string;
      /** Staff steps between the written positions; 0 with `direction: 'level'`. */
      steps: number;
      direction: 'above' | 'below' | 'level';
      /** The same letter whole octaves away (steps a multiple of seven, same accidental). */
      octaves: boolean;
      /** The octave was part of the answer (a MIDI keyboard). */
      exact: boolean;
    }
  | {
      type: 'chord';
      /** Every note played, by name, in the order played. */
      played: string[];
      /** The chord asked, lowest first. */
      wanted: string[];
    };

export interface SprintMissView {
  /** The played notes as the page writes them, to draw in red pencil. */
  heads: SheetNote[];
  /** How far left of the sheet's own notes to draw them (SVG units). */
  dx: number;
  facts: SprintMissFacts;
}

/** Where the played column sits left of the written one: clear of its head, or of its accidental. */
const DX_PLAIN = -16;
const DX_WIDE = -34;
const DX_BAR = -15;

/**
 * The view of a wrong answer to prompt `index`, or null when there is nothing to draw (a skipped
 * prompt, no notes played). `targets` is the prompt's sounding pitches (`promptMidis`), `played`
 * what the learner played (the machine's `played`: for a bar, the notes played right and then the
 * wrong one).
 */
export function sprintMiss(args: {
  prompt: SprintPrompt;
  targets: readonly number[];
  played: readonly number[];
  instrument: 'piano' | 'guitar' | 'voice';
  /** The input plays exact octaves (a MIDI keyboard). */
  exact: boolean;
}): SprintMissView | null {
  const { prompt, targets, played, instrument, exact } = args;
  if (played.length === 0 || prompt.notes.length === 0) return null;
  const shift = writtenShift(prompt, instrument);

  if (prompt.kind === 'chord') {
    const heads = played.map((m) => writtenNoteOf(m, shift));
    return {
      heads,
      dx: DX_WIDE,
      facts: {
        type: 'chord',
        played: played.map((m) => pitchName(m, false)),
        wanted: prompt.notes.map((n, i) => writtenName(n, targets[i] ?? n.written, false)),
      },
    };
  }

  // One note, one note with an accidental, or the note of a bar that was missed.
  const k = prompt.kind === 'bar' ? Math.min(prompt.notes.length - 1, played.length - 1) : 0;
  const want = prompt.notes[k];
  const wantSounding = targets[k];
  const got = played[played.length - 1];
  if (!want || wantSounding === undefined || got === undefined) return null;
  const drawn = exact ? Math.round(got) : nearestWithPc(wantSounding, pcOf(got));
  const head = writtenNoteOf(drawn, shift);
  const diff = staffStep(head.written) - staffStep(want.written);
  const steps = Math.abs(diff);
  return {
    heads: [head],
    dx:
      prompt.kind === 'bar'
        ? BAR_X[k] - CARD_NOTE_X + DX_BAR
        : prompt.kind === 'accidental' || want.accidental !== 0 || head.accidental !== 0
          ? DX_WIDE
          : DX_PLAIN,
    facts: {
      type: 'note',
      played: pitchName(drawn, exact),
      wanted: writtenName(want, wantSounding, exact),
      steps,
      direction: diff > 0 ? 'above' : diff < 0 ? 'below' : 'level',
      octaves: steps > 0 && steps % 7 === 0 && head.accidental === want.accidental,
      exact,
    },
  };
}
