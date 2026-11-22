/**
 * Every profile module kind has its name written out as a literal `t()` call
 * (so `pnpm i18n:extract` sees it), with the English `MODULE_LABELS` carries. A
 * kind added to `MODULE_KINDS` without an entry here would ship untranslated in
 * every locale but English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { profileModuleLabels } from '@/components/profile/module-labels';
import { MODULE_KINDS, MODULE_LABELS } from '@/lib/profile/modules';

describe('profile module labels', () => {
  it('covers every kind with the same English name', () => {
    const { t, calls } = recordingT();
    const labels = profileModuleLabels(t);
    expect(labels).toEqual(MODULE_LABELS);
    expect(Object.keys(labels).sort()).toEqual([...MODULE_KINDS].sort());
    expect(Object.keys(englishByKey(calls)).sort()).toEqual(MODULE_KINDS.map((k) => `module-${k}`).sort());
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['c-profile-modules']));
  });
});
