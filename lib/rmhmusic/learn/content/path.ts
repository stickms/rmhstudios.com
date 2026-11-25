/**
 * The learning path: units of lessons, in order.
 *
 * Content is ids plus English default strings. The UI renders `title` and
 * `summary` through `t()` with these as `defaultValue`s; this file never calls
 * `t()` itself so the server (which validates lesson ids against it) can import
 * it. Lesson ids are stored in `music_learn_lesson_progress`, so renaming one
 * orphans learners' progress: add a new id instead.
 *
 * Three paths: `PATH` for guitar learners (each lesson adapts to the instrument), `PIANO_PATH` (the same
 * plus the bass clef unit) and
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
  | 'rhythm-reading'
  | 'play-note'
  | 'match-note'
  | 'ear-interval'
  | 'ear-chord'
  | 'play-chord'
  | 'sing-interval'
  | 'play-scale'
  | 'key-signature'
  | 'staff-intervals'
  | 'grand-staff-find'
  | 'staff-chords';

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
   * A `staff-flashcards` lesson whose deck joins Practice only once the lesson is completed
   * (`practiceDecks`): the sharps, flats and key cards, which a beginner must meet in their lesson first.
   */
  practiceWhenDone?: boolean;
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

/**
 * Read rhythms: five lessons of eight one-bar patterns (`rhythm-patterns.ts`), each drawn on a
 * one-line percussion staff, heard once, then tapped after a count-in. Like Rhythm basics it needs no
 * instrument and no voice range, and it is the same unit (and progress) on every path, directly
 * after it. Ids are stored with progress: add new ones, never rename.
 */
export const READ_RHYTHMS_UNIT_ID = 'read-rhythms';

const READ_RHYTHMS_UNIT: Unit = {
  id: READ_RHYTHMS_UNIT_ID,
  title: 'Read rhythms',
  lessons: [
    {
      id: 'rhythm-read-quarters-halves',
      unit: READ_RHYTHMS_UNIT_ID,
      title: 'Quarters and halves',
      summary: 'Read bars of quarter, half and whole notes, then tap them in time.',
      mode: 'rhythm-reading',
      available: true,
    },
    {
      id: 'rhythm-read-eighths',
      unit: READ_RHYTHMS_UNIT_ID,
      title: 'Eighth notes',
      summary: 'Read beamed pairs of eighth notes and tap two to a beat.',
      mode: 'rhythm-reading',
      available: true,
    },
    {
      id: 'rhythm-read-rests',
      unit: READ_RHYTHMS_UNIT_ID,
      title: 'Rests',
      summary: 'Read quarter and half rests: stay silent for them, and tap again on time.',
      mode: 'rhythm-reading',
      available: true,
    },
    {
      id: 'rhythm-read-dotted',
      unit: READ_RHYTHMS_UNIT_ID,
      title: 'Dotted notes',
      summary: 'Read the dotted half, and the dotted quarter followed by an eighth.',
      mode: 'rhythm-reading',
      available: true,
    },
    {
      id: 'rhythm-read-ties-34',
      unit: READ_RHYTHMS_UNIT_ID,
      title: 'Ties and 3/4',
      summary: 'Read ties that hold a note across the beat, and bars of three beats.',
      mode: 'rhythm-reading',
      available: true,
    },
  ],
};

/**
 * Read sharps, flats and keys: the staff-flashcard lessons whose notes carry a spelling
 * (`content/spelling.ts` holds the cards): a sign printed before the note, and notes read in a key
 * whose signature has already changed them. Piano and guitar path only (a singer's range deck is
 * naturals), at the end of the path: after Scales and keys has taught what a signature means. Each deck joins Practice only
 * once its lesson is completed (`practiceWhenDone`), so a beginner is never dealt a card they have not
 * met. Ids are stored with progress: add new ones, never rename.
 */
const SPELLED_UNIT_ID = 'read-sharps-flats-keys';

const READ_SPELLED_UNIT: Unit = {
  id: SPELLED_UNIT_ID,
  title: 'Sharps, flats and keys on the staff',
  lessons: [
    {
      id: 'staff-sharps-flats',
      unit: SPELLED_UNIT_ID,
      title: 'Sharps and flats: treble',
      summary: 'Name the notes with a sharp or a flat before them on the treble staff: letter and sign.',
      mode: 'staff-flashcards',
      available: true,
      deck: 'accidentals-treble',
      practiceWhenDone: true,
    },
    {
      id: 'staff-sharps-flats-bass',
      unit: SPELLED_UNIT_ID,
      title: 'Sharps and flats: bass',
      summary: 'The same on the bass staff: a sign before the note changes its name.',
      mode: 'staff-flashcards',
      available: true,
      deck: 'accidentals-bass',
      practiceWhenDone: true,
    },
    {
      id: 'staff-keys-sharps',
      unit: SPELLED_UNIT_ID,
      title: 'Notes in G, D and A major',
      summary: 'The key signature has already sharpened some notes: name each note the way the key plays it.',
      mode: 'staff-flashcards',
      available: true,
      deck: 'keys-sharps',
      practiceWhenDone: true,
    },
    {
      id: 'staff-keys-flats',
      unit: SPELLED_UNIT_ID,
      title: 'Notes in F, B♭ and E♭ major',
      summary: 'The key signature has already flattened some notes: name each note the way the key plays it.',
      mode: 'staff-flashcards',
      available: true,
      deck: 'keys-flats',
      practiceWhenDone: true,
    },
  ],
};

/**
 * Read intervals: two notes written one after the other, named by size first and then by quality
 * (`theory/staff-intervals.ts` holds what each lesson asks: its names, directions and staves, so none
 * of these lessons has a `pool`). Read from the page: no instrument, no sound. On the piano and
 * guitar path only: a singer's own interval lessons sing them (`voice-intervals`). Ids are stored
 * with progress: add new ones, never rename.
 */
const INTERVALS_UNIT_ID = 'read-intervals';

const READ_INTERVALS_UNIT: Unit = {
  id: INTERVALS_UNIT_ID,
  title: 'Read intervals',
  lessons: [
    {
      id: 'intervals-read-second-third',
      unit: INTERVALS_UNIT_ID,
      title: 'Steps and skips',
      summary: 'Two notes on the staff: a step to the next line or space is a second, a skip is a third.',
      mode: 'staff-intervals',
      available: true,
    },
    {
      id: 'intervals-read-fourth-fifth-octave',
      unit: INTERVALS_UNIT_ID,
      title: 'Fourths, fifths and octaves',
      summary: 'Count lines and spaces to tell a third, a fourth, a fifth and an octave apart.',
      mode: 'staff-intervals',
      available: true,
    },
    {
      id: 'intervals-read-all-sizes',
      unit: INTERVALS_UNIT_ID,
      title: 'Every size, up and down',
      summary: 'Name any size from a second to an octave, on both staves, going up or down.',
      mode: 'staff-intervals',
      available: true,
    },
    {
      id: 'intervals-read-seconds-thirds-quality',
      unit: INTERVALS_UNIT_ID,
      title: 'Minor and major seconds and thirds',
      summary: 'Tell a half step from a whole step, and a minor third from a major third.',
      mode: 'staff-intervals',
      available: true,
    },
    {
      id: 'intervals-read-quality-wider',
      unit: INTERVALS_UNIT_ID,
      title: 'Perfect, minor, major and the tritone',
      summary: 'Name fourths to octaves by quality, with sharps and flats written in.',
      mode: 'staff-intervals',
      available: true,
    },
  ],
};

/**
 * Scales and keys: the lessons are shared objects, so the singer's path (which gets only the two
 * key-signature lessons, no instrument needed) and the piano and guitar path (all five) agree on
 * every id and every learner's progress. Ids are stored: add new ones, never rename.
 */
const SCALES_UNIT_ID = 'scales-and-keys';

const KEY_SIGNATURES_MAJOR: Lesson = {
  id: 'key-signatures-major',
  unit: SCALES_UNIT_ID,
  title: 'Major key signatures',
  summary: 'Read the sharps or flats at the start of a staff and name the major key.',
  mode: 'key-signature',
  available: true,
};

const KEY_SIGNATURES_MINOR: Lesson = {
  id: 'key-signatures-minor',
  unit: SCALES_UNIT_ID,
  title: 'Minor key signatures',
  summary: 'Name the minor key a signature belongs to, and see it share its signature with a major.',
  mode: 'key-signature',
  available: true,
};

/**
 * Chords in every key: the four triads by ear, read on the staff in root position and in
 * inversions (`staff-chords`, `machines/staff-chords.ts`), and played in all twelve keys
 * (`play-chord`, `machines/play-chord.ts`). On the piano and guitar path only, after Scales and
 * keys: a singer plays no chords. `chord-play-c-major` stays in "Train your ear". Ids are stored
 * with progress: add new ones, never rename.
 */
export const CHORDS_UNIT_ID = 'chords-in-every-key';

const CHORDS_UNIT: Unit = {
  id: CHORDS_UNIT_ID,
  title: 'Chords in every key',
  lessons: [
    {
      id: 'chords-ear-four-qualities',
      unit: CHORDS_UNIT_ID,
      title: 'Four kinds of chord by ear',
      summary: 'Hear three notes together and tell a major, a minor, a diminished and an augmented chord apart.',
      mode: 'ear-chord',
      available: true,
      pool: ['major', 'minor', 'diminished', 'augmented'],
    },
    {
      id: 'chords-read-root-position',
      unit: CHORDS_UNIT_ID,
      title: 'Read a chord on the staff',
      summary: 'Three notes stacked in thirds: name the root, with its sharp or flat, and the kind of chord.',
      mode: 'staff-chords',
      available: true,
    },
    {
      id: 'chords-play-major-minor',
      unit: CHORDS_UNIT_ID,
      title: 'Every major and minor chord',
      summary: 'Play all twelve major and all twelve minor chords, with the sharps and flats spelled right.',
      mode: 'play-chord',
      available: true,
    },
    {
      id: 'chords-play-dim-aug',
      unit: CHORDS_UNIT_ID,
      title: 'Diminished and augmented chords',
      summary: 'Play the diminished and augmented chords on the seven natural notes.',
      mode: 'play-chord',
      available: true,
    },
    {
      id: 'chords-read-inversions',
      unit: CHORDS_UNIT_ID,
      title: 'Read inversions',
      summary: 'The same three notes with another one lowest: name the chord and whether it is in root position or inverted.',
      mode: 'staff-chords',
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
  {
    id: SCALES_UNIT_ID,
    title: 'Scales and keys',
    lessons: [
      {
        id: 'scales-major-white',
        unit: SCALES_UNIT_ID,
        title: 'Play C, G, D and F major',
        summary: 'Play four major scales one octave up, note by note in order.',
        mode: 'play-scale',
        available: true,
      },
      KEY_SIGNATURES_MAJOR,
      {
        id: 'scales-major-all',
        unit: SCALES_UNIT_ID,
        title: 'Every major scale',
        summary: 'Play all fifteen major scales, with the sharps and flats spelled right.',
        mode: 'play-scale',
        available: true,
      },
      KEY_SIGNATURES_MINOR,
      {
        id: 'scales-minor-natural',
        unit: SCALES_UNIT_ID,
        title: 'Natural minor scales',
        summary: 'Play A, E, D, G and C natural minor, one octave up.',
        mode: 'play-scale',
        available: true,
      },
    ],
  },
  CHORDS_UNIT,
  READ_INTERVALS_UNIT,
  RHYTHM_UNIT,
  READ_RHYTHMS_UNIT,
  READ_SPELLED_UNIT,
];

/**
 * The bass clef and the grand staff: piano only (`PIANO_PATH`). A guitarist reads the treble clef,
 * an octave up, and a singer's clef comes from their range, so neither path has this unit. The first
 * three lessons are staff flashcards (the third on the grand staff, `grand-middle`); the fourth is the
 * note finder drawing its target on the grand staff. Ids are stored with progress: add new ones, never rename.
 */
export const BASS_CLEF_UNIT_ID = 'bass-clef-grand-staff';

const BASS_CLEF_UNIT: Unit = {
  id: BASS_CLEF_UNIT_ID,
  title: 'Bass clef and the grand staff',
  lessons: [
    {
      id: 'bass-clef-lines-spaces',
      unit: BASS_CLEF_UNIT_ID,
      title: 'Bass clef: lines and spaces',
      summary: 'Read the five lines and four spaces of the bass staff, where the left hand lives.',
      mode: 'staff-flashcards',
      available: true,
      deck: 'bass-lines',
    },
    {
      id: 'bass-clef-all',
      unit: BASS_CLEF_UNIT_ID,
      title: 'All the bass notes',
      summary: 'Name every note from the low E up to middle C, ledger lines included.',
      mode: 'staff-flashcards',
      available: true,
      deck: 'bass-all',
    },
    {
      id: 'grand-staff-middle',
      unit: BASS_CLEF_UNIT_ID,
      title: 'The grand staff around middle C',
      summary: 'Two staves joined by a brace: read the notes either side of middle C on the staff they sit on.',
      mode: 'staff-flashcards',
      available: true,
      deck: 'grand-middle',
    },
    {
      id: 'grand-staff-play',
      unit: BASS_CLEF_UNIT_ID,
      title: 'Play what you read',
      summary: 'A note appears on the grand staff: find it on the keyboard, or play it.',
      mode: 'grand-staff-find',
      available: true,
    },
  ],
};

/** The piano learner's path: the shared path with the bass clef unit after the first, "Meet the staff & the keys". */
export const PIANO_PATH: Unit[] = [...PATH.slice(0, 1), BASS_CLEF_UNIT, ...PATH.slice(1)];

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
  {
    id: SCALES_UNIT_ID,
    title: 'Key signatures',
    lessons: [
      KEY_SIGNATURES_MAJOR,
      KEY_SIGNATURES_MINOR,
    ],
  },
  RHYTHM_UNIT,
  READ_RHYTHMS_UNIT,
];

/** The path a learner sees. */
export function pathFor(instrument: Instrument): Unit[] {
  if (instrument === 'voice') return VOICE_PATH;
  return instrument === 'piano' ? PIANO_PATH : PATH;
}

const RANGE_LESSONS = new Set(
  VOICE_PATH.filter((u) => u !== RHYTHM_UNIT && u !== READ_RHYTHMS_UNIT)
    .flatMap((u) => u.lessons)
    // A key signature is read from the page: it needs no range, and no instrument either.
    .filter((l) => l.mode !== 'key-signature')
    .map((l) => l.id),
);

/**
 * Whether a lesson reads or sings in the learner's voice range (every singer lesson but the rhythm units):
 * such a lesson asks a singer with no range to choose one first, rather than assume one.
 */
export function needsVoiceRange(lesson: Lesson | undefined): boolean {
  return lesson !== undefined && RANGE_LESSONS.has(lesson.id);
}

const BY_ID = new Map<string, Lesson>(
  [...PIANO_PATH, ...PATH, ...VOICE_PATH].flatMap((u) => u.lessons).map((l) => [l.id, l]),
);

export function getLesson(id: string): Lesson | undefined {
  return BY_ID.get(id);
}

export function isKnownLesson(id: string): boolean {
  return BY_ID.has(id);
}
