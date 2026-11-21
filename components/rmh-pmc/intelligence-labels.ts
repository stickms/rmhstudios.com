/**
 * The RMH PMC manifest's category chips, translated.
 *
 * A key built from the category id (`cat-${id}`) is invisible to
 * `pnpm i18n:extract`; each one is written out here as a literal call.
 * `components/rmh-pmc/__tests__/intelligence-labels.test.ts` pins the keys
 * and the English.
 */
import type { TFunction } from 'i18next';

/** Ids of the manifest's category chips, in display order. */
export const INTELLIGENCE_CATEGORY_IDS = [
  'all',
  'threat',
  'geopolitics',
  'maritime',
  'cyber',
  'stabilization',
  'protective',
] as const;
export type IntelligenceCategoryId = (typeof INTELLIGENCE_CATEGORY_IDS)[number];

/** Translated name per category chip (namespace `c-rmh-pmc`). */
export function intelligenceCategoryLabels(t: TFunction): Record<IntelligenceCategoryId, string> {
  return {
    all: t('cat-all', { ns: 'c-rmh-pmc', defaultValue: 'All' }),
    threat: t('cat-threat', { ns: 'c-rmh-pmc', defaultValue: 'Threat' }),
    geopolitics: t('cat-geopolitics', { ns: 'c-rmh-pmc', defaultValue: 'Geopolitics' }),
    maritime: t('cat-maritime', { ns: 'c-rmh-pmc', defaultValue: 'Maritime' }),
    cyber: t('cat-cyber', { ns: 'c-rmh-pmc', defaultValue: 'Cyber & Signals' }),
    stabilization: t('cat-stabilization', { ns: 'c-rmh-pmc', defaultValue: 'Stabilization' }),
    protective: t('cat-protective', { ns: 'c-rmh-pmc', defaultValue: 'Protective' }),
  };
}
