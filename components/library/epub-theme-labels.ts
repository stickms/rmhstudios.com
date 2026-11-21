/**
 * The EPUB reader's theme names, translated.
 *
 * A key built from the theme (`theme-${th}`) is invisible to
 * `pnpm i18n:extract`; each one is written out here as a literal call, and
 * `Record<EpubTheme, …>` makes a new theme a type error until it is added.
 * `components/library/__tests__/epub-theme-labels.test.ts` pins the keys and
 * the English.
 */
import type { TFunction } from 'i18next';
import type { EpubTheme } from '@/lib/library/epub-raster';

/** Translated name per reader theme (namespace `c-library`). */
export function epubThemeLabels(t: TFunction): Record<EpubTheme, string> {
  return {
    light: t('theme-light', { ns: 'c-library', defaultValue: 'light' }),
    sepia: t('theme-sepia', { ns: 'c-library', defaultValue: 'sepia' }),
    dark: t('theme-dark', { ns: 'c-library', defaultValue: 'dark' }),
  };
}
