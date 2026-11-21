/**
 * Every colour-vision mode has its name and hint written out as literal `t()`
 * calls (so `pnpm i18n:extract` sees them), with the English
 * `COLOR_VISION_LABELS` and `COLOR_VISION_HINTS` carry. A mode added to
 * `COLOR_VISION_MODES` without an entry here would ship untranslated in every
 * locale but English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { colorVisionText } from '@/components/settings/color-vision-labels';
import { COLOR_VISION_HINTS, COLOR_VISION_LABELS, COLOR_VISION_MODES } from '@/lib/appearance/prefs';

describe('colour-vision labels', () => {
  it('covers every mode with the same English label and hint', () => {
    const { t, calls } = recordingT();
    const text = colorVisionText(t);
    expect(Object.keys(text).sort()).toEqual([...COLOR_VISION_MODES].sort());
    for (const mode of COLOR_VISION_MODES) {
      expect(text[mode], mode).toEqual({ label: COLOR_VISION_LABELS[mode], hint: COLOR_VISION_HINTS[mode] });
    }
    expect(Object.keys(englishByKey(calls)).sort()).toEqual(
      COLOR_VISION_MODES.flatMap((m) => [`color-vision-${m}`, `color-vision-${m}-hint`]).sort(),
    );
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['settings-appearance']));
  });
});
