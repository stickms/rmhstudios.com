/**
 * Every TF2 class has its translated name written out as a literal `t()` call
 * (so `pnpm i18n:extract` sees it), with the English `CLASS_DEFAULT` carries.
 * A class added to the list without an entry here would ship untranslated in
 * every locale but English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { CLASS_DEFAULT, tfClassLabels } from '@/components/tf2-hud/loadout/labels';

describe('TF2 class labels', () => {
  it('covers every class with its own key and the same English', () => {
    const { t, calls } = recordingT();
    const labels = tfClassLabels(t);
    expect(labels).toEqual(CLASS_DEFAULT);
    expect(englishByKey(calls)).toEqual(
      Object.fromEntries(Object.entries(CLASS_DEFAULT).map(([id, name]) => [`class-${id}`, name])),
    );
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['c-tf2-hud']));
  });
});
