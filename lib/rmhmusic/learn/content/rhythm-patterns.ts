/**
 * The forty rhythms of "Read rhythms": five lessons of eight one-bar patterns, each lesson adding
 * one thing to read (quarters and halves, eighths, rests, dotted notes, ties and 3/4). Plain data;
 * `theory/rhythm.ts` reads onsets, beams and words off it, and {@link badPatterns} (held by a test)
 * names any bar whose notes do not add up to its meter.
 *
 * Ids are stored with progress (`path.ts`): add new ones, never rename.
 */
import { patternProblem, type Meter, type RhythmNote, type RhythmPattern, type RhythmValue } from '../theory/rhythm';

/** The tempo of every lesson (beats per minute): fixed, so a pattern is the same each time. */
export const RHYTHM_READ_BPM = 72;
/** Patterns in each lesson. */
export const PATTERNS_PER_LESSON = 8;

const note = (value: RhythmValue, extra: Partial<Omit<RhythmNote, 'value'>> = {}): RhythmNote => ({
  value,
  dotted: false,
  rest: false,
  tieToNext: false,
  ...extra,
});
const w = note('whole');
const h = note('half');
const q = note('quarter');
const e = note('eighth');
const dh = note('half', { dotted: true });
const dq = note('quarter', { dotted: true });
const qr = note('quarter', { rest: true });
const hr = note('half', { rest: true });
/** The same note, tied to the one after it. */
const tied = (n: RhythmNote): RhythmNote => ({ ...n, tieToNext: true });

const bar = (meter: Meter, ...notes: RhythmNote[]): RhythmPattern => ({ meter, notes });
const four = (...notes: RhythmNote[]) => bar('4/4', ...notes);
const three = (...notes: RhythmNote[]) => bar('3/4', ...notes);

export interface RhythmReadingLesson {
  id: string;
  patterns: RhythmPattern[];
}

export const RHYTHM_READING_LESSONS: readonly RhythmReadingLesson[] = [
  {
    id: 'rhythm-read-quarters-halves',
    patterns: [
      four(q, q, q, q),
      four(h, q, q),
      four(q, q, h),
      four(h, h),
      four(q, h, q),
      four(w),
      four(h, q, q),
      four(q, q, q, q),
    ],
  },
  {
    id: 'rhythm-read-eighths',
    patterns: [
      four(q, q, e, e, q),
      four(e, e, e, e, q, q),
      four(q, e, e, q, q),
      four(e, e, q, e, e, q),
      four(q, q, e, e, e, e),
      four(e, e, e, e, e, e, e, e),
      four(h, e, e, q),
      four(e, e, q, h),
    ],
  },
  {
    id: 'rhythm-read-rests',
    patterns: [
      four(q, q, qr, q),
      four(q, qr, q, q),
      four(qr, q, q, q),
      four(q, q, hr),
      four(hr, q, q),
      four(q, hr, q),
      four(e, e, qr, e, e, q),
      four(qr, e, e, q, qr),
    ],
  },
  {
    id: 'rhythm-read-dotted',
    patterns: [
      four(dh, q),
      four(q, dh),
      four(dq, e, q, q),
      four(q, dq, e, q),
      four(dq, e, dq, e),
      four(q, q, dq, e),
      four(h, dq, e),
      four(dq, e, h),
    ],
  },
  {
    id: 'rhythm-read-ties-34',
    patterns: [
      four(q, tied(h), q),
      four(q, e, tied(e), q, q),
      four(q, tied(q), q, q),
      four(e, e, tied(h), q),
      three(q, q, q),
      three(q, e, e, q),
      three(q, tied(q), q),
      three(dq, e, q),
    ],
  },
];

const BY_ID = new Map(RHYTHM_READING_LESSONS.map((l) => [l.id, l] as const));

/** The lesson ids of the unit, in order. */
export const RHYTHM_READING_LESSON_IDS: readonly string[] = RHYTHM_READING_LESSONS.map((l) => l.id);

/** The eight patterns of a Read rhythms lesson; null for an id that is not one. */
export function rhythmReadingPatterns(lessonId: string): readonly RhythmPattern[] | null {
  return BY_ID.get(lessonId)?.patterns ?? null;
}

/** Every pattern whose notes do not add up (or whose tie is wrong), named; empty when all forty are good. */
export function badPatterns(): string[] {
  const out: string[] = [];
  for (const lesson of RHYTHM_READING_LESSONS) {
    if (lesson.patterns.length !== PATTERNS_PER_LESSON) out.push(`${lesson.id}: ${lesson.patterns.length} patterns`);
    lesson.patterns.forEach((p, i) => {
      const problem = patternProblem(p);
      if (problem) out.push(`${lesson.id} #${i + 1}: ${problem}`);
    });
  }
  return out;
}
