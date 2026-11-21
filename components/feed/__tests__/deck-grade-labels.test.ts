/**
 * The flashcard review buttons are literal `t()` calls (so `pnpm i18n:extract`
 * sees them): one per grade, 0 (again) to 3 (easy).
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { deckGradeLabels } from '@/components/feed/deck-grade-labels';

describe('deck grade labels', () => {
  it('has one key per grade and the English the buttons have always shown', () => {
    const { t, calls } = recordingT();
    expect(deckGradeLabels(t)).toEqual({ 0: 'Again', 1: 'Hard', 2: 'Good', 3: 'Easy' });
    expect(englishByKey(calls)).toEqual({
      'grade-0': 'Again',
      'grade-1': 'Hard',
      'grade-2': 'Good',
      'grade-3': 'Easy',
    });
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['feed']));
  });
});
