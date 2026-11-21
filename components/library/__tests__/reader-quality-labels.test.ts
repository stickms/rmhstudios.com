/**
 * The book reader's page-quality names are literal `t()` calls (so
 * `pnpm i18n:extract` sees them). `Record<PageQuality, …>` makes a new quality a
 * type error until it is added; this pins the keys and the English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { readerQualityLabels } from '@/components/library/reader-quality-labels';

describe('reader quality labels', () => {
  it('has one key per quality and the English the menu has always shown', () => {
    const { t, calls } = recordingT();
    expect(readerQualityLabels(t)).toEqual({ low: 'Low', medium: 'Medium', high: 'High' });
    expect(englishByKey(calls)).toEqual({ 'quality-low': 'Low', 'quality-medium': 'Medium', 'quality-high': 'High' });
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['c-library']));
  });
});
