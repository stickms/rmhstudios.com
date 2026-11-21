/**
 * The book reader's page-quality names, translated.
 *
 * A key built from the quality (`quality-${q}`) is invisible to
 * `pnpm i18n:extract`; each one is written out here as a literal call.
 * `Record<PageQuality, …>` makes a new quality a type error until its literal
 * is added, and `components/library/__tests__/reader-quality-labels.test.ts`
 * pins the keys and the English.
 */
import type { TFunction } from 'i18next';
import type { PageQuality } from '@/components/library/BookReader';

/** Translated name per page-raster quality (namespace `c-library`). */
export function readerQualityLabels(t: TFunction): Record<PageQuality, string> {
  return {
    low: t('quality-low', { ns: 'c-library', defaultValue: 'Low' }),
    medium: t('quality-medium', { ns: 'c-library', defaultValue: 'Medium' }),
    high: t('quality-high', { ns: 'c-library', defaultValue: 'High' }),
  };
}
