/**
 * The RMH PMC manifest's category chips are literal `t()` calls (so
 * `pnpm i18n:extract` sees them), one per category id.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { INTELLIGENCE_CATEGORY_IDS, intelligenceCategoryLabels } from '@/components/rmh-pmc/intelligence-labels';

describe('intelligence category labels', () => {
  it('has one cat-<id> key per category and the English the chips have always shown', () => {
    const { t, calls } = recordingT();
    const labels = intelligenceCategoryLabels(t);
    expect(Object.keys(labels).sort()).toEqual([...INTELLIGENCE_CATEGORY_IDS].sort());
    expect(englishByKey(calls)).toEqual({
      'cat-all': 'All',
      'cat-threat': 'Threat',
      'cat-geopolitics': 'Geopolitics',
      'cat-maritime': 'Maritime',
      'cat-cyber': 'Cyber & Signals',
      'cat-stabilization': 'Stabilization',
      'cat-protective': 'Protective',
    });
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['c-rmh-pmc']));
  });
});
