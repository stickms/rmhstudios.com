/**
 * Reading intervals off the staff — pure, client-safe.
 *
 * An interval is read from two notes written one after the other: how far apart they sit on the
 * staff (its SIZE: a second is the next line or space, a third skips one, an octave is eight lines
 * and spaces counting both ends) and, once the learner counts semitones, its QUALITY (a minor
 * third and a major third are both thirds; they differ by a semitone). So a lesson asks in one of
 * two tiers:
 *
 *   size     the answer is a size word (second … octave). Both notes are naturals, so the size is
 *            just a count of lines and spaces and nothing else has to be known. A beginner starts
 *            here, because quality needs the semitone counts of the white keys (E to F is one, C to
 *            D is two) and accidentals, which size does not.
 *   quality  the answer is a quality and a size (minor third, perfect fifth, …), or "tritone". The
 *            notes are naturals, and in the last lesson the second note may carry a sharp or a flat.
 *
 * A question is built forward from the answer, so every question is checked by construction: the
 * second note is written the number of staff steps the size says above or below the first (so a
 * third is always written a third, never as an enharmonic fourth), and its accidental is whatever
 * brings it to the semitones the quality says. A name that cannot be spelled that way from a first
 * note (an accidental past one sharp or flat, a note off the staff) simply is not a candidate.
 *
 * Direction is never asked: the learner names the interval, and an interval reads the same going
 * down. It still matters for practice (reading down is harder), so it is part of the FSRS item.
 */
import { staffStep } from '../staff';
import { clefStep, type Clef } from './clef';

export type IntervalDirection = 'up' | 'down';

/** The size words, narrowest first. A unison is never asked. */
export const SIZE_NAMES = ['second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave'] as const;
export type SizeName = (typeof SIZE_NAMES)[number];

/** The quality names, by semitones (1 to 12). */
export const QUALITY_NAMES = [
  'minor-second',
  'major-second',
  'minor-third',
  'major-third',
  'perfect-fourth',
  'tritone',
  'perfect-fifth',
  'minor-sixth',
  'major-sixth',
  'minor-seventh',
  'major-seventh',
  'perfect-octave',
] as const;
export type QualityName = (typeof QUALITY_NAMES)[number];

/** What a question's answer buttons are named: a size or a quality. */
export type StaffIntervalName = SizeName | QualityName;

export function isSizeName(v: unknown): v is SizeName {
  return typeof v === 'string' && (SIZE_NAMES as readonly string[]).includes(v);
}
export function isQualityName(v: unknown): v is QualityName {
  return typeof v === 'string' && (QUALITY_NAMES as readonly string[]).includes(v);
}
export function isStaffIntervalName(v: unknown): v is StaffIntervalName {
  return isSizeName(v) || isQualityName(v);
}

/** Staff steps (lines and spaces moved) from the first note to the second, by size. */
export const SIZE_STEPS: Readonly<Record<SizeName, number>> = {
  second: 1,
  third: 2,
  fourth: 3,
  fifth: 4,
  sixth: 5,
  seventh: 6,
  octave: 7,
};

/** Semitones, by quality name: the position in `QUALITY_NAMES` plus one. */
export function semitonesOf(name: QualityName): number {
  return QUALITY_NAMES.indexOf(name) + 1;
}

/**
 * The staff steps a quality name may be written across. A tritone is written either as an
 * augmented fourth (F up to B) or a diminished fifth (B up to F): both are six semitones.
 */
export function sizesOfQuality(name: QualityName): SizeName[] {
  switch (name) {
    case 'minor-second':
    case 'major-second':
      return ['second'];
    case 'minor-third':
    case 'major-third':
      return ['third'];
    case 'perfect-fourth':
      return ['fourth'];
    case 'tritone':
      return ['fourth', 'fifth'];
    case 'perfect-fifth':
      return ['fifth'];
    case 'minor-sixth':
    case 'major-sixth':
      return ['sixth'];
    case 'minor-seventh':
    case 'major-seventh':
      return ['seventh'];
    case 'perfect-octave':
      return ['octave'];
  }
}

/** A written note: the natural it sits on (MIDI) and the accidental printed beside it. */
export interface IntervalNote {
  written: number;
  accidental: -1 | 0 | 1;
}

/** The pitch a written note sounds. */
export function soundsAs(n: IntervalNote): number {
  return n.written + n.accidental;
}

/** One question: the two notes in order, and what they are. */
export interface IntervalQuestion {
  clef: Clef;
  first: IntervalNote;
  second: IntervalNote;
  direction: IntervalDirection;
  /** The right answer: a size word in the size tier, a quality name in the quality tier. */
  answer: StaffIntervalName;
}

/** What the learner answers. */
export interface IntervalAnswer {
  name: StaffIntervalName;
}

/** The staff steps the drawing can show without clamping: two ledger lines either way. */
const MIN_STEP = -4;
const MAX_STEP = 12;

const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11] as const;
/** The step of middle C, so a count of steps from it can be turned back into a natural. */
const C4_STEP = staffStep(60);

/** The natural at a diatonic step (the inverse of `staffStep` for naturals). */
export function naturalAtStep(step: number): number {
  const k = step - C4_STEP;
  const octave = 4 + Math.floor(k / 7);
  const idx = ((k % 7) + 7) % 7;
  return (octave + 1) * 12 + NATURAL_PCS[idx]!;
}

/** Whether a written note is drawn inside the staff window on `clef` (two ledger lines at most). */
export function onTheStaff(clef: Clef, written: number): boolean {
  const s = clefStep(clef, written);
  return s >= MIN_STEP && s <= MAX_STEP;
}

/** Every natural a note may start on, for a clef, lowest first. */
export function startingNotes(clef: Clef): number[] {
  const out: number[] = [];
  for (let m = 24; m <= 96; m++) {
    if (NATURAL_PCS.includes((m % 12) as (typeof NATURAL_PCS)[number]) && onTheStaff(clef, m)) out.push(m);
  }
  return out;
}

/**
 * The second note of an interval written `size` above or below `first` (a natural), carrying the
 * accidental that makes it sound `semitones` away; null when that needs more than one sharp or flat,
 * or when `accidentals` is off and it needs any, or when it is off the staff.
 */
export function spellSecond(
  clef: Clef,
  first: number,
  direction: IntervalDirection,
  size: SizeName,
  semitones: number | null,
  accidentals: boolean,
  /** Refuse a note off the staff window; the red "your answer" note is drawn clamped to the edge instead. */
  inWindow = true,
): IntervalNote | null {
  const sign = direction === 'up' ? 1 : -1;
  const written = naturalAtStep(staffStep(first) + sign * SIZE_STEPS[size]);
  if (inWindow && !onTheStaff(clef, written)) return null;
  if (semitones === null) return { written, accidental: 0 };
  const acc = first + sign * semitones - written;
  if (acc === 0) return { written, accidental: 0 };
  if (!accidentals || (acc !== 1 && acc !== -1)) return null;
  return { written, accidental: acc };
}

/** One way of writing an answer: where it starts and where it lands. */
export interface Spelling {
  first: IntervalNote;
  second: IntervalNote;
}

/**
 * Every way to write `name` going `direction` on `clef`, from any natural start. For a size name the
 * notes are naturals; for a quality name the second note carries whatever accidental the quality
 * needs when `accidentals` allows one.
 */
export function spellings(
  clef: Clef,
  name: StaffIntervalName,
  direction: IntervalDirection,
  accidentals: boolean,
): Spelling[] {
  const out: Spelling[] = [];
  for (const first of startingNotes(clef)) {
    if (isSizeName(name)) {
      const second = spellSecond(clef, first, direction, name, null, false);
      if (second) out.push({ first: { written: first, accidental: 0 }, second });
      continue;
    }
    const semis = semitonesOf(name);
    for (const size of sizesOfQuality(name)) {
      const second = spellSecond(clef, first, direction, size, semis, accidentals);
      if (second) out.push({ first: { written: first, accidental: 0 }, second });
    }
  }
  return out;
}

/**
 * The note an answer would have put second, drawn in red pencil beside the right one: the same
 * start, direction and clef, the size or quality the learner named. A quality that cannot be
 * spelled with one accidental falls back to the natural at the right distance, so something is
 * always drawn. A tritone is drawn as the spelling nearer the staff.
 */
export function impliedSecond(q: IntervalQuestion, said: StaffIntervalName): IntervalNote {
  const first = q.first.written;
  // Not limited to the staff window: the drawing clamps a note past the ledger lines to the edge.
  if (isSizeName(said)) return spellSecond(q.clef, first, q.direction, said, null, false, false) ?? q.second;
  const semis = semitonesOf(said);
  const sizes = sizesOfQuality(said);
  // Prefer a spelling that is on the staff, then any spelling with at most one accidental.
  for (const window of [true, false])
    for (const size of sizes) {
      const exact = spellSecond(q.clef, first, q.direction, size, semis, true, window);
      if (exact) return exact;
    }
  return spellSecond(q.clef, first, q.direction, sizes[0]!, null, false, false) ?? q.second;
}

/** The semitones between a question's two notes. */
export function semitonesBetween(q: IntervalQuestion): number {
  return Math.abs(soundsAs(q.second) - soundsAs(q.first));
}

/** The staff steps between a question's two notes. */
export function stepsBetween(q: IntervalQuestion): number {
  return Math.abs(staffStep(q.second.written) - staffStep(q.first.written));
}

/** How a wrong answer differs from the right one, for the sentence under the staff. */
export interface IntervalMiss {
  /** In the size tier by staff steps, in the quality tier by semitones. */
  unit: 'steps' | 'semitones';
  /** How many of that unit the answer is off by (always at least 1). */
  n: number;
  /** The answer is a wider interval than the notes shown. */
  wider: boolean;
}

/** Compare a wrong answer with the right one; null when they are the same name. */
export function describeIntervalMiss(right: StaffIntervalName, said: StaffIntervalName): IntervalMiss | null {
  if (right === said) return null;
  if (isSizeName(right) && isSizeName(said)) {
    const d = SIZE_STEPS[said] - SIZE_STEPS[right];
    return { unit: 'steps', n: Math.abs(d), wider: d > 0 };
  }
  if (isQualityName(right) && isQualityName(said)) {
    const d = semitonesOf(said) - semitonesOf(right);
    return { unit: 'semitones', n: Math.abs(d), wider: d > 0 };
  }
  // A name of the other tier cannot be a button of this lesson; treat it as a one-step miss.
  return { unit: 'steps', n: 1, wider: false };
}

/** A lesson's setting: what it asks, which way, on which staves. */
export interface StaffIntervalLesson {
  tier: 'size' | 'quality';
  /** The answer names its buttons offer and its questions draw from, narrowest first. */
  pool: StaffIntervalName[];
  directions: IntervalDirection[];
  clefs: Clef[];
  /** Quality tier: the second note may carry a sharp or a flat. */
  accidentals: boolean;
}

/**
 * The lessons of the "Read intervals" unit (`content/path.ts` lists them; this file holds what each
 * asks, as the rhythm lessons' activities are held beside their machine). Ids are stored with
 * learners' progress: add, never rename.
 */
const LESSONS: Readonly<Record<string, StaffIntervalLesson>> = {
  'intervals-read-second-third': {
    tier: 'size',
    pool: ['second', 'third'],
    directions: ['up'],
    clefs: ['treble'],
    accidentals: false,
  },
  'intervals-read-fourth-fifth-octave': {
    tier: 'size',
    pool: ['third', 'fourth', 'fifth', 'octave'],
    directions: ['up'],
    clefs: ['treble'],
    accidentals: false,
  },
  'intervals-read-all-sizes': {
    tier: 'size',
    pool: [...SIZE_NAMES],
    directions: ['up', 'down'],
    clefs: ['treble', 'bass'],
    accidentals: false,
  },
  'intervals-read-seconds-thirds-quality': {
    tier: 'quality',
    pool: ['minor-second', 'major-second', 'minor-third', 'major-third'],
    directions: ['up', 'down'],
    clefs: ['treble', 'bass'],
    accidentals: false,
  },
  'intervals-read-quality-wider': {
    tier: 'quality',
    pool: [
      'perfect-fourth',
      'tritone',
      'perfect-fifth',
      'minor-sixth',
      'major-sixth',
      'minor-seventh',
      'major-seventh',
      'perfect-octave',
    ],
    directions: ['up', 'down'],
    clefs: ['treble', 'bass'],
    accidentals: true,
  },
};

/** The lesson's setting, or null for an id that is not an interval-reading lesson. */
export function staffIntervalLesson(lessonId: string): StaffIntervalLesson | null {
  return Object.hasOwn(LESSONS, lessonId) ? LESSONS[lessonId]! : null;
}

/** The ids of every interval-reading lesson, in path order. */
export const STAFF_INTERVAL_LESSON_IDS: readonly string[] = Object.keys(LESSONS);
