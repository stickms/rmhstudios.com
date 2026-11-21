/**
 * Every daily-puzzle desk mode has its title and description written out as
 * literal `t()` calls (so `pnpm i18n:extract` sees them), with the English and
 * the description key `DESK_MODES` carries. A mode added to the desk without an
 * entry here would ship untranslated in every locale but English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { deskModeText } from '@/components/daily-puzzles/mode-labels';
import { DESK_MODES } from '@/lib/daily-puzzles/desk-modes';

describe('desk mode labels', () => {
  it('covers every mode with the same English title and description', () => {
    const { t } = recordingT();
    const text = deskModeText(t);
    expect(Object.keys(text).sort()).toEqual(DESK_MODES.map((m) => m.id).sort());
    for (const m of DESK_MODES) {
      expect(text[m.id], m.id).toEqual({ title: m.title, description: m.descriptionDefault });
    }
  });

  it('uses the title key the hub always used and the description key the mode carries', () => {
    const { t, calls } = recordingT();
    deskModeText(t);
    const english = englishByKey(calls);
    for (const m of DESK_MODES) {
      expect(english[`mode-title-${m.id}`], m.id).toBe(m.title);
      expect(english[m.descriptionKey], m.id).toBe(m.descriptionDefault);
    }
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['c-daily-puzzles']));
  });
});
