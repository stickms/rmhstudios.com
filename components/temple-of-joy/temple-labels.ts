/**
 * The Temple of Joy's tab, filter, stall and ladder-tier names, translated.
 *
 * Keys built from an id (`tab-${id}`, `filter-${kind}`, `stall-${index}`,
 * `ladder-tier-${tier}`) are invisible to `pnpm i18n:extract`, so those
 * strings never reached `locales/en/c-temple-of-joy.json`. Each one is written
 * out here as a literal call, with the English the data lists carry;
 * `components/temple-of-joy/__tests__/temple-labels.test.ts` holds the maps
 * equal to `BLESSING_KINDS`, `STALL_NAMES` and the ladder's tiers.
 */
import type { TFunction } from 'i18next';
import type { BlessingKind, TabId } from '@/lib/temple-of-joy/types';

/** Translated name per room tab (namespace `c-temple-of-joy`). */
export function templeTabLabels(t: TFunction): Record<TabId, string> {
  return {
    temple: t('tab-temple', { ns: 'c-temple-of-joy', defaultValue: 'Temple' }),
    sources: t('tab-sources', { ns: 'c-temple-of-joy', defaultValue: 'Sources' }),
    blessings: t('tab-blessings', { ns: 'c-temple-of-joy', defaultValue: 'Blessings' }),
    garden: t('tab-garden', { ns: 'c-temple-of-joy', defaultValue: 'Garden' }),
    choir: t('tab-choir', { ns: 'c-temple-of-joy', defaultValue: 'Choir' }),
    exchange: t('tab-exchange', { ns: 'c-temple-of-joy', defaultValue: 'Exchange' }),
    hours: t('tab-hours', { ns: 'c-temple-of-joy', defaultValue: 'Hours' }),
    legacy: t('tab-legacy', { ns: 'c-temple-of-joy', defaultValue: 'The Ladder' }),
    trophies: t('tab-trophies', { ns: 'c-temple-of-joy', defaultValue: 'Trophies' }),
    settings: t('tab-settings', { ns: 'c-temple-of-joy', defaultValue: 'Settings' }),
  };
}

/** Translated name per blessing filter, `all` included. */
export function blessingFilterLabels(t: TFunction): Record<BlessingKind | 'all', string> {
  return {
    all: t('filter-all', { ns: 'c-temple-of-joy', defaultValue: 'All' }),
    source: t('filter-source', { ns: 'c-temple-of-joy', defaultValue: 'Sources' }),
    touch: t('filter-touch', { ns: 'c-temple-of-joy', defaultValue: 'Touch' }),
    cherub: t('filter-cherub', { ns: 'c-temple-of-joy', defaultValue: 'Cherubim' }),
    synergy: t('filter-synergy', { ns: 'c-temple-of-joy', defaultValue: 'Synergy' }),
    halo: t('filter-halo', { ns: 'c-temple-of-joy', defaultValue: 'Halos' }),
    rapture: t('filter-rapture', { ns: 'c-temple-of-joy', defaultValue: 'Rapture' }),
    rite: t('filter-rite', { ns: 'c-temple-of-joy', defaultValue: 'Rites' }),
    grace: t('filter-grace', { ns: 'c-temple-of-joy', defaultValue: 'Grace' }),
  };
}

/** Translated name per choir stall, nave to apse. */
export function choirStallLabels(t: TFunction): [string, string, string] {
  return [
    t('stall-0', { ns: 'c-temple-of-joy', defaultValue: 'Nave' }),
    t('stall-1', { ns: 'c-temple-of-joy', defaultValue: 'Transept' }),
    t('stall-2', { ns: 'c-temple-of-joy', defaultValue: 'Apse' }),
  ];
}

/** Translated heading per ladder tier, 0 to 6. */
export function ladderTierLabels(t: TFunction): Record<number, string> {
  return {
    0: t('ladder-tier-0', { ns: 'c-temple-of-joy', defaultValue: 'The First Rung' }),
    1: t('ladder-tier-1', { ns: 'c-temple-of-joy', defaultValue: 'Communion — turning Grace into rate' }),
    2: t('ladder-tier-2', { ns: 'c-temple-of-joy', defaultValue: 'What you carry with you' }),
    3: t('ladder-tier-3', { ns: 'c-temple-of-joy', defaultValue: 'What happens while you are gone' }),
    4: t('ladder-tier-4', { ns: 'c-temple-of-joy', defaultValue: 'The slow bread' }),
    5: t('ladder-tier-5', { ns: 'c-temple-of-joy', defaultValue: 'Providence' }),
    6: t('ladder-tier-6', { ns: 'c-temple-of-joy', defaultValue: 'Plain multipliers' }),
  };
}
