/**
 * Every endorsable skill has its name written out as a literal `t()` call (so
 * `pnpm i18n:extract` sees it), with the English `SKILLS` carries. A skill
 * added to `SKILLS` without an entry here would ship untranslated in every
 * locale but English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { skillLabels } from '@/components/profile/plus/skill-labels';
import { SKILLS } from '@/lib/profile/skills';

describe('skill labels', () => {
  it('covers every skill with the same English name', () => {
    const { t, calls } = recordingT();
    const labels = skillLabels(t);
    expect(labels).toEqual(Object.fromEntries(SKILLS.map((s) => [s.id, s.label])));
    expect(englishByKey(calls)).toEqual(Object.fromEntries(SKILLS.map((s) => [`skill-${s.id}`, s.label])));
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['f-profile-plus']));
  });
});
