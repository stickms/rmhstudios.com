/**
 * The Temple of Joy's tab, blessing-filter, choir-stall and ladder-tier names
 * are literal `t()` calls (so `pnpm i18n:extract` sees them), with the English
 * the data lists carry. A filter, stall or tier added to the data without an
 * entry here would ship untranslated in every locale but English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import {
  blessingFilterLabels,
  choirStallLabels,
  ladderTierLabels,
  templeTabLabels,
} from '@/components/temple-of-joy/temple-labels';
import { BLESSING_KINDS } from '@/lib/temple-of-joy/data/blessings';
import { LEGACY } from '@/lib/temple-of-joy/data/legacy';
import { STALL_NAMES } from '@/lib/temple-of-joy/minigames/choir';
import type { TabId } from '@/lib/temple-of-joy/types';

// `Record<TabId, …>` makes a new tab a compile error until `templeTabLabels` names it; this is the list it must match.
const TAB_IDS: TabId[] = [
  'temple',
  'sources',
  'blessings',
  'garden',
  'choir',
  'exchange',
  'hours',
  'legacy',
  'trophies',
  'settings',
];

describe('temple labels', () => {
  it('names every room tab under tab-<id>', () => {
    const { t, calls } = recordingT();
    const labels = templeTabLabels(t);
    expect(Object.keys(labels).sort()).toEqual([...TAB_IDS].sort());
    expect(Object.keys(englishByKey(calls)).sort()).toEqual(TAB_IDS.map((id) => `tab-${id}`).sort());
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['c-temple-of-joy']));
    // The English the rail has always shown: the catalog's, not the old tab list's "Ladder".
    expect(labels.legacy).toBe('The Ladder');
  });

  it('names every blessing filter under filter-<id> with the label the filter rail carries', () => {
    const { t, calls } = recordingT();
    const labels = blessingFilterLabels(t);
    expect(labels).toEqual(Object.fromEntries(BLESSING_KINDS.map((k) => [k.id, k.label])));
    expect(Object.keys(englishByKey(calls)).sort()).toEqual(BLESSING_KINDS.map((k) => `filter-${k.id}`).sort());
  });

  it('names every choir stall under stall-<index> with the name the choir carries', () => {
    const { t, calls } = recordingT();
    expect(choirStallLabels(t)).toEqual(STALL_NAMES);
    expect(calls.map((c) => c.key)).toEqual(STALL_NAMES.map((_, i) => `stall-${i}`));
  });

  it('names every ladder tier the legacy data uses under ladder-tier-<tier>', () => {
    const { t, calls } = recordingT();
    const labels = ladderTierLabels(t);
    const tiers = [...new Set(LEGACY.map((l) => l.tier))].sort((a, b) => a - b);
    expect(
      Object.keys(labels)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(tiers);
    expect(Object.keys(englishByKey(calls)).sort()).toEqual(tiers.map((n) => `ladder-tier-${n}`).sort());
  });
});
