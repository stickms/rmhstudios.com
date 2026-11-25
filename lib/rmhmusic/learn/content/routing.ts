/**
 * Which lessons the lesson screen can run. `LessonScreen` and `path.test.ts` both read this
 * module, so a mode that ships in `path.ts` without an activity behind it fails a test instead
 * of showing a learner a lesson that cannot start. `Record<LessonMode, true>` makes the compiler
 * ask about every new mode here.
 */

import { rhythmActivity } from '../machines/rhythm';
import { staffChordsLesson } from '../machines/staff-chords';
import { staffIntervalLesson } from '../theory/staff-intervals';
import { DECKS } from './decks';
import { VOICE_RANGE_DECK, type Lesson, type LessonMode } from './path';

const ROUTED: Record<LessonMode, true> = {
  'staff-flashcards': true,
  'keyboard-map': true,
  fretboard: true,
  'rhythm-basics': true,
  'play-note': true,
  'match-note': true,
  'ear-interval': true,
  'ear-chord': true,
  'play-chord': true,
  'sing-interval': true,
  'play-scale': true,
  'key-signature': true,
  'staff-intervals': true,
  'grand-staff-find': true,
  'staff-chords': true,
};

/** The modes `LessonScreen` has an activity for. */
export const ROUTED_MODES: ReadonlySet<LessonMode> = new Set(Object.keys(ROUTED) as LessonMode[]);

/** Whether the lesson has shipped and its activity (and the data it needs) is wired. */
export function isPlayable(lesson: Lesson | undefined): lesson is Lesson {
  if (!lesson?.available || !ROUTED_MODES.has(lesson.mode)) return false;
  if (lesson.mode === 'rhythm-basics') return rhythmActivity(lesson.id) !== null;
  if (lesson.mode === 'staff-intervals') return staffIntervalLesson(lesson.id) !== null;
  if (lesson.mode === 'staff-chords') return staffChordsLesson(lesson.id) !== null;
  if (lesson.mode === 'staff-flashcards')
    return !!lesson.deck && (lesson.deck in DECKS || lesson.deck === VOICE_RANGE_DECK);
  return true;
}
