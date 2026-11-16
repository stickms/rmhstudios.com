/**
 * The learning path: units of lessons, in order.
 *
 * Content is ids plus English default strings. The UI renders `title` and
 * `summary` through `t()` with these as `defaultValue`s; this file never calls
 * `t()` itself so the server (which validates lesson ids against it) can import
 * it. Lesson ids are stored in `music_learn_lesson_progress`, so renaming one
 * orphans learners' progress: add a new id instead.
 *
 * Two paths: `PATH` for piano and guitar learners (each lesson adapts to the instrument) and
 * `VOICE_PATH` for singers (`pathFor`), whose lessons are their own ids except the shared rhythm
 * unit. A singer gets no chord-playing, keyboard or fretboard lesson.
 */
import type { Instrument } from '../schemas';

/** A `staff-flashcards` lesson whose deck is the learner's voice range (`decks.ts` `voiceDeck`). */
export const VOICE_RANGE_DECK = 'voice-range';

export type LessonMode =
  | 'staff-flashcards'
  | 'keyboard-map'
  | 'fretboard'
  | 'rhythm-basics'
  | 'play-note'
  | 'match-note'
  | 'ear-interval'
  | 'ear-chord'
  | 'play-chord'
  | 'sing-interval';

export interface Lesson {
  id: string;
  /** Id of the unit this lesson belongs to. */
  unit: string;
  title: string;
  summary: string;
  mode: LessonMode;
  /** False until the lesson's activity ships; the path shows it as coming soon. */
  available: boolean;
  /** A `staff-flashcards` lesson's deck: a key of `DECKS` in `decks.ts` (path.test.ts checks it). */
  deck?: string;
  /**
   * An `ear-interval` / `ear-chord` / `sing-interval` lesson's answer names, narrowest first: its questions are
   * drawn from them and its buttons offer them. Interval names for `ear-interval`, chord
   * qualities for `ear-chord` (path.test.ts checks both).
   */
  pool?: string[];
}

export interface Unit {
  id: string;
  title: string;
  lessons: Lesson[];
}

/** Rhythm basics: the same unit (and progress) on every path. */
const RHYTHM_UNIT: Unit = {
  id: 'rhythm-basics',
  title: 'Rhythm basics',
  lessons: [
    {
      id: 'rhythm-note-values',
      unit: 'rhythm-basics',
      title: 'Note values',
      summary: 'Whole, half, quarter and eighth notes, and how long each lasts.',
      mode: 'rhythm-basics',
      available: true,
    },
    {
      id: 'rhythm-44-vs-34',
      unit: 'rhythm-basics',
      title: '4/4 vs 3/4',
      summary: 'Feel the difference between counting four beats and three.',
      mode: 'rhythm-basics',
      available: true,
    },
    {
      id: 'rhythm-tap-the-beat',
      unit: 'rhythm-basics',
      title: 'Tap the beat',
      summary: 'Keep a steady beat by tapping along.',
      mode: 'rhythm-basics',
      available: true,
    },
  ],
};

export const PATH: Unit[] = [
  {
    id: 'meet-staff-and-keys',
    title: 'Meet the staff & the keys',
    lessons: [
      {
        id: 'staff-what-is-a-staff',
        unit: 'meet-staff-and-keys',
        title: 'What is a staff?',
        summary: 'Five lines and four spaces: where written music lives.',
        mode: 'staff-flashcards',
        available: true,
        deck: 'treble-lines',
      },
      {
        id: 'staff-treble-notes',
        unit: 'meet-staff-and-keys',
        title: 'Treble clef notes',
        summary: 'Read the notes on the lines and spaces of the treble staff.',
        mode: 'staff-flashcards',
        available: true,
        deck: 'treble-all',
      },
      {
        id: 'staff-find-middle-c',
        unit: 'meet-staff-and-keys',
        title: 'Find middle C',
        summary: 'Spot middle C on the staff and on the keyboard.',
        mode: 'staff-flashcards',
        available: true,
        deck: 'middle-c',
      },
      {
        id: 'keys-layout-and-strings',
        unit: 'meet-staff-and-keys',
        title: 'Keyboard layout & open strings',
        summary: 'Learn the pattern of black and white keys, and the six open guitar strings.',
        mode: 'keyboard-map',
        available: true,
      },
      {
        id: 'fretboard-first-frets',
        unit: 'meet-staff-and-keys',
        title: 'First frets & two octaves',
        summary: 'Find natural notes on the first five frets, or across two octaves of keys.',
        mode: 'fretboard',
        available: true,
      },
      {
        id: 'play-first-note',
        unit: 'meet-staff-and-keys',
        title: 'First note played',
        summary: 'Play your first note on your own instrument.',
        mode: 'play-note',
        available: true,
      },
    ],
  },
  {
    id: 'play-it-back',
    title: 'Play it back',
    lessons: [
      {
        id: 'match-c',
        unit: 'play-it-back',
        title: 'Match middle C',
        summary: 'Play the note you see, from middle C up to G. Hear it first if you like.',
        mode: 'match-note',
        available: true,
      },
      {
        id: 'match-white-keys',
        unit: 'play-it-back',
        title: 'Match white keys',
        summary: 'Play the natural notes from middle C up to the next C.',
        mode: 'match-note',
        available: true,
      },
    ],
  },
  {
    id: 'train-your-ear',
    title: 'Train your ear',
    lessons: [
      {
        id: 'ear-second-third',
        unit: 'train-your-ear',
        title: 'Seconds and thirds',
        summary: 'Hear two notes and tell a step from a skip: a second from a third.',
        mode: 'ear-interval',
        available: true,
        pool: ['second', 'third'],
      },
      {
        id: 'ear-fifth-octave',
        unit: 'train-your-ear',
        title: 'Fifths and octaves',
        summary: 'Tell a fifth and an octave from a third, by ear alone.',
        mode: 'ear-interval',
        available: true,
        pool: ['third', 'fifth', 'octave'],
      },
      {
        id: 'ear-major-minor',
        unit: 'train-your-ear',
        title: 'Major and minor chords',
        summary: 'Hear three notes together and tell a bright major chord from a darker minor one.',
        mode: 'ear-chord',
        available: true,
        pool: ['major', 'minor'],
      },
      {
        id: 'chord-play-c-major',
        unit: 'train-your-ear',
        title: 'Play a C major chord',
        summary: 'Play C, E and G together, then F major and G major.',
        mode: 'play-chord',
        available: true,
      },
    ],
  },
  RHYTHM_UNIT,
];

/** The singer's path: read the staff of your range, sing notes back, sing intervals, rhythm. */
export const VOICE_PATH: Unit[] = [
  {
    id: 'voice-read',
    title: 'Read your staff',
    lessons: [
      {
        id: 'voice-staff-notes',
        unit: 'voice-read',
        title: 'Notes in your range',
        summary: 'Read the notes you can sing, on the staff your voice reads.',
        mode: 'staff-flashcards',
        available: true,
        deck: VOICE_RANGE_DECK,
      },
      {
        id: 'voice-first-note',
        unit: 'voice-read',
        title: 'Sing your first note',
        summary: 'Sing one note near the microphone and see it written.',
        mode: 'play-note',
        available: true,
      },
    ],
  },
  {
    id: 'voice-sing-back',
    title: 'Sing it back',
    lessons: [
      {
        id: 'voice-match-five',
        unit: 'voice-sing-back',
        title: 'Match five notes',
        summary: 'Sing the note you see: the five lowest notes of your range. Hear it first if you like.',
        mode: 'match-note',
        available: true,
      },
      {
        id: 'voice-match-range',
        unit: 'voice-sing-back',
        title: 'Match your range',
        summary: 'Sing the natural notes across your whole range.',
        mode: 'match-note',
        available: true,
      },
    ],
  },
  {
    id: 'voice-intervals',
    title: 'Sing intervals',
    lessons: [
      {
        id: 'voice-interval-steps',
        unit: 'voice-intervals',
        title: 'Steps and skips',
        summary: 'Hear two notes, then sing the second: a second or a third above the first.',
        mode: 'sing-interval',
        available: true,
        pool: ['second', 'third'],
      },
      {
        id: 'voice-interval-leaps',
        unit: 'voice-intervals',
        title: 'Fifths and octaves',
        summary: 'Hear two notes, then sing the second: a third, a fifth or an octave above.',
        mode: 'sing-interval',
        available: true,
        pool: ['third', 'fifth', 'octave'],
      },
    ],
  },
  RHYTHM_UNIT,
];

/** The path a learner sees. */
export function pathFor(instrument: Instrument): Unit[] {
  return instrument === 'voice' ? VOICE_PATH : PATH;
}

const RANGE_LESSONS = new Set(
  VOICE_PATH.filter((u) => u !== RHYTHM_UNIT)
    .flatMap((u) => u.lessons)
    .map((l) => l.id),
);

/**
 * Whether a lesson reads or sings in the learner's voice range (every singer lesson but rhythm):
 * such a lesson asks a singer with no range to choose one first, rather than assume one.
 */
export function needsVoiceRange(lesson: Lesson | undefined): boolean {
  return lesson !== undefined && RANGE_LESSONS.has(lesson.id);
}

const BY_ID = new Map<string, Lesson>(
  [...PATH, ...VOICE_PATH].flatMap((u) => u.lessons).map((l) => [l.id, l]),
);

export function getLesson(id: string): Lesson | undefined {
  return BY_ID.get(id);
}

export function isKnownLesson(id: string): boolean {
  return BY_ID.has(id);
}
