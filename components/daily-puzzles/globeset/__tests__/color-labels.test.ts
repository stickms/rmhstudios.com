/**
 * Every GlobeSet dot colour has its spoken name written out as a literal `t()`
 * call (so `pnpm i18n:extract` sees it). The English is the colour's own id.
 * A colour added to `DOT_COLORS` without an entry here would ship untranslated
 * in every locale but English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { globesetColorLabels } from '@/components/daily-puzzles/globeset/color-labels';
import { DOT_COLORS } from '@/lib/globeset/cards';

describe('GlobeSet colour labels', () => {
  it('covers every dot colour, keyed globeset-color-<id>, with the id as English', () => {
    const { t, calls } = recordingT();
    const labels = globesetColorLabels(t);
    expect(labels).toEqual(Object.fromEntries(DOT_COLORS.map((c) => [c.id, c.id])));
    expect(englishByKey(calls)).toEqual(Object.fromEntries(DOT_COLORS.map((c) => [`globeset-color-${c.id}`, c.id])));
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['c-daily-puzzles']));
  });
});
