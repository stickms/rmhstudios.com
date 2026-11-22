/**
 * The flashcard review buttons' names, translated.
 *
 * A key built from the grade (`grade-${grade}`) is invisible to
 * `pnpm i18n:extract`; each one is written out here as a literal call.
 * `components/feed/__tests__/deck-grade-labels.test.ts` pins the keys and the
 * English.
 */
import type { TFunction } from 'i18next';

/** Translated name per review grade, 0 (again) to 3 (easy) (namespace `feed`). */
export function deckGradeLabels(t: TFunction): Record<number, string> {
  return {
    0: t('grade-0', { ns: 'feed', defaultValue: 'Again' }),
    1: t('grade-1', { ns: 'feed', defaultValue: 'Hard' }),
    2: t('grade-2', { ns: 'feed', defaultValue: 'Good' }),
    3: t('grade-3', { ns: 'feed', defaultValue: 'Easy' }),
  };
}
