/**
 * The EPUB reader's theme names are literal `t()` calls (so
 * `pnpm i18n:extract` sees them). `Record<EpubTheme, …>` makes a new theme a
 * type error until it is added; this pins the keys and the English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { epubThemeLabels } from '@/components/library/epub-theme-labels';

describe('EPUB theme labels', () => {
  it('has one key per theme and the English the swatches have always read', () => {
    const { t, calls } = recordingT();
    expect(epubThemeLabels(t)).toEqual({ light: 'light', sepia: 'sepia', dark: 'dark' });
    expect(englishByKey(calls)).toEqual({ 'theme-light': 'light', 'theme-sepia': 'sepia', 'theme-dark': 'dark' });
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['c-library']));
  });
});
