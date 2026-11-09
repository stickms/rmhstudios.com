/**
 * The learning path: units of lessons, in order.
 *
 * Content is ids plus English default strings. The UI renders `title` and
 * `summary` through `t()` with these as `defaultValue`s; this file never calls
 * `t()` itself so the server (which validates lesson ids against it) can import
 * it. Lesson ids are stored in `music_learn_lesson_progress`, so renaming one
 * orphans learners' progress: add a new id instead.
 */

export type LessonMode =
  'staff-flashcards' | 'keyboard-map' | 'fretboard' | 'rhythm-basics' | 'play-note';

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
}

export interface Unit {
  id: string;
  title: string;
  lessons: Lesson[];
}

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
    id: 'rhythm-basics',
    title: 'Rhythm basics',
    lessons: [
      {
        id: 'rhythm-note-values',
        unit: 'rhythm-basics',
        title: 'Note values',
        summary: 'Whole, half, quarter and eighth notes, and how long each lasts.',
        mode: 'rhythm-basics',
        available: false,
      },
      {
        id: 'rhythm-44-vs-34',
        unit: 'rhythm-basics',
        title: '4/4 vs 3/4',
        summary: 'Feel the difference between counting four beats and three.',
        mode: 'rhythm-basics',
        available: false,
      },
      {
        id: 'rhythm-tap-the-beat',
        unit: 'rhythm-basics',
        title: 'Tap the beat',
        summary: 'Keep a steady beat by tapping along.',
        mode: 'rhythm-basics',
        available: false,
      },
    ],
  },
];

const BY_ID = new Map<string, Lesson>(PATH.flatMap((u) => u.lessons).map((l) => [l.id, l]));

export function getLesson(id: string): Lesson | undefined {
  return BY_ID.get(id);
}

export function isKnownLesson(id: string): boolean {
  return BY_ID.has(id);
}
