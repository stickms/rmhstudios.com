/**
 * Sprint prompts, dealt from a seeded random source — pure, client-safe.
 *
 * A prompt is what the staff shows: a clef and one or more written notes. A written note is a
 * NATURAL on a line or space (`written`, MIDI) plus the accidental printed beside it (−1 flat, +1
 * sharp), so a flat is drawn on its own letter (E♭ on the E line) and the sounding pitch is
 * `written + accidental`. Every note stays inside the sprint's ledger-line limit
 * (`SPRINT_MIN_STEP`…`SPRINT_MAX_STEP`).
 *
 * The daily challenge is the same for everyone: its prompts come from `mulberry32(dailySeed(date))`
 * and `utcDate(now)` is the only place the day is decided (the server's date is authoritative when
 * a result is saved).
 */
import { mulberry32 } from '@/lib/core/rng';
import type { Instrument, VoiceRange } from '../schemas';
import { resolveVoiceRange, voiceReading, writtenRange } from '../voice/range';
import { clefStep, type Clef } from '../theory/clef';
import {
  BAR_NOTES,
  DAILY_LEVELS,
  DAILY_PROMPTS_PER_LEVEL,
  SPRINT_MAX_STEP,
  SPRINT_MIN_STEP,
  sprintLevel,
  type SprintKind,
  type SprintLevelId,
} from './levels';

export type Accidental = -1 | 0 | 1;

export interface SprintNote {
  /** The natural the note is written on (MIDI). */
  written: number;
  /** Printed beside it: −1 flat, 0 none, +1 sharp. */
  accidental: Accidental;
}

export interface SprintPrompt {
  level: SprintLevelId;
  kind: SprintKind;
  clef: Clef;
  /**
   * Written with the treble clef's small 8 (a tenor's range): the notes sound an octave lower than
   * written. Guitar prompts do not set it (the guitar is known from the instrument).
   */
  octaveClef?: boolean;
  /** One note; a chord's notes lowest first; a bar's notes in the order they are played. */
  notes: readonly SprintNote[];
}

/** The pitch a written note sounds (at the written octave). */
export function noteMidi(n: SprintNote): number {
  return n.written + n.accidental;
}

/**
 * The pitches a prompt asks for on the learner's instrument. Guitar music is written an octave
 * above where it sounds, on the treble staff; everything else sounds as written.
 */
export function promptMidis(p: SprintPrompt, instrument: Instrument = 'piano'): number[] {
  const shift = (instrument === 'guitar' && p.clef === 'treble') || p.octaveClef ? -12 : 0;
  return p.notes.map((n) => noteMidi(n) + shift);
}

const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];

/** The natural written on `step` of `clef`, per clef, built once. */
const NATURALS: Record<Clef, Map<number, number>> = {
  treble: naturalsByStep('treble'),
  bass: naturalsByStep('bass'),
};

function naturalsByStep(clef: Clef): Map<number, number> {
  const out = new Map<number, number>();
  for (let m = 21; m <= 108; m++) {
    if (NATURAL_PCS.includes(m % 12)) out.set(clefStep(clef, m), m);
  }
  return out;
}

function naturalAt(clef: Clef, step: number): number {
  const m = NATURALS[clef].get(step);
  if (m === undefined) throw new RangeError(`no natural at step ${step}`);
  return m;
}

/** An integer in lo..hi inclusive. */
function int(rand: () => number, lo: number, hi: number): number {
  return lo + Math.min(hi - lo, Math.floor(rand() * (hi - lo + 1)));
}

function pick<T>(rand: () => number, xs: readonly T[]): T {
  const x = xs[int(rand, 0, xs.length - 1)];
  if (x === undefined) throw new RangeError('pick from an empty list');
  return x;
}

/** Semitones above the root of a triad's third and fifth. */
const TRIADS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
} as const;

/**
 * A triad on the natural at `rootStep`, spelled in thirds (root, third, fifth on every other
 * line or space), each note with the accidental its quality needs. Natural roots and these two
 * qualities never need more than one sharp or flat.
 */
function triadNotes(clef: Clef, rootStep: number, quality: keyof typeof TRIADS): SprintNote[] {
  const root = naturalAt(clef, rootStep);
  return TRIADS[quality].map((semis, i) => {
    const written = naturalAt(clef, rootStep + 2 * i);
    return {
      written,
      accidental: (root + semis - written) as Accidental,
    };
  });
}

/** Raise the lowest note of a chord by an octave (seven steps up on the staff). */
function invert(clef: Clef, notes: readonly SprintNote[]): SprintNote[] {
  const [low, ...rest] = notes;
  if (low === undefined) return [];
  const step = clefStep(clef, low.written) + 7;
  return [
    ...rest,
    {
      written: naturalAt(clef, step),
      accidental: low.accidental,
    },
  ];
}

/** A natural that takes this sharp or flat is never asked: E♯, B♯, C♭ and F♭ are other keys. */
function plainAccidental(written: number, accidental: Accidental): boolean {
  const pc = written % 12;
  if (accidental === 1) return pc !== 4 && pc !== 11;
  if (accidental === -1) return pc !== 0 && pc !== 5;
  return true;
}

/** One prompt of a level. */
export function makePrompt(levelId: SprintLevelId, rand: () => number): SprintPrompt {
  const level = sprintLevel(levelId);
  if (!level) throw new RangeError(`unknown sprint level ${levelId}`);
  const clef = pick(rand, level.clefs);
  const base = {
    level: levelId,
    kind: level.kind,
    clef,
  };
  switch (levelId) {
    case 'note':
    case 'note-both': {
      const written = naturalAt(clef, int(rand, SPRINT_MIN_STEP, SPRINT_MAX_STEP));
      return {
        ...base,
        notes: [
          {
            written,
            accidental: 0,
          },
        ],
      };
    }
    case 'accidental': {
      for (;;) {
        const written = naturalAt(clef, int(rand, SPRINT_MIN_STEP, SPRINT_MAX_STEP));
        const accidental: Accidental = rand() < 0.5 ? -1 : 1;
        if (plainAccidental(written, accidental))
          return {
            ...base,
            notes: [
              {
                written,
                accidental,
              },
            ],
          };
      }
    }
    case 'triad': {
      const rootStep = int(rand, SPRINT_MIN_STEP, SPRINT_MAX_STEP - 4);
      return {
        ...base,
        notes: triadNotes(clef, rootStep, rand() < 0.5 ? 'major' : 'minor'),
      };
    }
    case 'inversion': {
      const second = rand() < 0.5;
      // First inversion spans steps root+2 … root+7; second, root+4 … root+9.
      const low = second ? 4 : 2;
      const high = second ? 9 : 7;
      const rootStep = int(rand, SPRINT_MIN_STEP - low, SPRINT_MAX_STEP - high);
      let notes = triadNotes(clef, rootStep, rand() < 0.5 ? 'major' : 'minor');
      notes = invert(clef, notes);
      if (second) notes = invert(clef, notes);
      return {
        ...base,
        notes,
      };
    }
    case 'bar': {
      const steps: number[] = [int(rand, SPRINT_MIN_STEP, SPRINT_MAX_STEP)];
      while (steps.length < BAR_NOTES) {
        const prev = steps[steps.length - 1] ?? 0;
        const moves = [-3, -2, -1, 1, 2, 3].filter((d) => prev + d >= SPRINT_MIN_STEP && prev + d <= SPRINT_MAX_STEP);
        steps.push(prev + pick(rand, moves));
      }
      return {
        ...base,
        notes: steps.map((s) => ({
          written: naturalAt(clef, s),
          accidental: 0,
        })),
      };
    }
    default:
      return unreachable(levelId);
  }
}

const samePrompt = (a: SprintPrompt, b: SprintPrompt): boolean =>
  a.clef === b.clef &&
  a.notes.length === b.notes.length &&
  a.notes.every((n, i) => n.written === b.notes[i]?.written && n.accidental === b.notes[i]?.accidental);

/** `count` prompts of a level, never the same one twice in a row. */
/**
 * A prompt as the learner's instrument reads it. Guitar music is written on the treble staff only,
 * with the small 8 under the clef (it sounds an octave lower than written), so a bass-staff prompt
 * is written an octave up on the treble staff for a guitarist: the same letters and accidentals,
 * sounding the same pitches as on the piano (`promptMidis`). A treble prompt is the same page on
 * both instruments. The lowest bass note (E2) lands on the low card's E3, three ledger lines down.
 */
export function forInstrument(p: SprintPrompt, instrument: Instrument, range?: VoiceRange): SprintPrompt {
  if (instrument === 'voice') return forVoice(p, resolveVoiceRange(range));
  if (instrument !== 'guitar' || p.clef !== 'bass') return p;
  return {
    ...p,
    clef: 'treble',
    notes: p.notes.map((n) => ({
      ...n,
      written: n.written + 12,
    })),
  };
}

/**
 * A prompt as a singer reads it: on the range's staff (`voice/range.ts`), moved by whole octaves so
 * every note is written inside the range (one shift for the whole prompt when it fits, else note by
 * note). Letters and accidentals stay, so the same seed deals the same notes to every reader.
 */
export function forVoice(p: SprintPrompt, range: VoiceRange): SprintPrompt {
  const { clef, octaveClef } = voiceReading(range);
  const [lo, hi] = writtenRange(range);
  const fold = (m: number) => {
    let x = m;
    while (x < lo) x += 12;
    while (x > hi) x -= 12;
    return x;
  };
  const written = p.notes.map((n) => n.written);
  const min = Math.min(...written);
  const max = Math.max(...written);
  let shift: number | null = null;
  for (let k = -4; k <= 4; k++)
    if (min + 12 * k >= lo && max + 12 * k <= hi && (shift === null || Math.abs(k) < Math.abs(shift / 12)))
      shift = 12 * k;
  const notes = p.notes.map((n) => ({
    ...n,
    written: shift === null ? fold(n.written) : n.written + shift,
  }));
  return {
    ...p,
    clef,
    notes,
    ...(octaveClef
      ? {
          octaveClef: true,
        }
      : {}),
  };
}

/**
 * `count` prompts of a level, never the same one twice in a row, as `instrument` reads them. The
 * dealing never depends on the instrument, so one seed deals the same prompts to everyone.
 */
export function makeRun(
  levelId: SprintLevelId,
  count: number,
  rand: () => number,
  instrument: Instrument = 'piano',
  range?: VoiceRange,
): SprintPrompt[] {
  const out: SprintPrompt[] = [];
  while (out.length < count) {
    const p = makePrompt(levelId, rand);
    const prev = out[out.length - 1];
    if (prev && samePrompt(prev, p)) continue;
    out.push(p);
  }
  return out.map((p) => forInstrument(p, instrument, range));
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `s` is a real calendar date written `YYYY-MM-DD`. */
export function isUtcDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

/** The UTC calendar day `now` (ms since the epoch) falls on, `YYYY-MM-DD`. The only place the day is decided. */
export function utcDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** FNV-1a (32-bit) of the date: the daily run's seed. Throws RangeError for anything but a real date. */
export function dailySeed(date: string): number {
  if (!isUtcDate(date)) throw new RangeError(`not a YYYY-MM-DD date: ${date}`);
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The day's challenge: every daily level in order, five prompts each, the same for everyone. Runs
 * stay comparable across instruments: the same seed deals the same prompts in the same order (the
 * same indices), and a guitarist sees each one as guitar music writes it (`forInstrument`: on the
 * treble staff, a bass prompt written an octave up), with the same notes to find.
 */
export function dailyRun(date: string, instrument: Instrument = 'piano', range?: VoiceRange): SprintPrompt[] {
  const rand = mulberry32(dailySeed(date));
  return DAILY_LEVELS.flatMap((id) => makeRun(id, DAILY_PROMPTS_PER_LEVEL, rand, instrument, range));
}

function unreachable(x: never): never {
  throw new Error(`sprint: unhandled level ${String(x)}`);
}
