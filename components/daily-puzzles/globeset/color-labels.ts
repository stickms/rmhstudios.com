/**
 * GlobeSet's colour names (read out for assistive tech), translated.
 *
 * `DOT_COLORS` in `lib/globeset/cards.ts` is the list; a key built from a
 * colour id (`globeset-color-${id}`) is invisible to `pnpm i18n:extract`. Each
 * colour is written out here as a literal call. The English is the colour's
 * own id. `components/daily-puzzles/globeset/__tests__/color-labels.test.ts`
 * holds the map equal to `DOT_COLORS`.
 */
import type { TFunction } from 'i18next';

/** Translated name per dot colour id (namespace `c-daily-puzzles`). */
export function globesetColorLabels(t: TFunction): Record<string, string> {
  return {
    red: t('globeset-color-red', { ns: 'c-daily-puzzles', defaultValue: 'red' }),
    orange: t('globeset-color-orange', { ns: 'c-daily-puzzles', defaultValue: 'orange' }),
    yellow: t('globeset-color-yellow', { ns: 'c-daily-puzzles', defaultValue: 'yellow' }),
    green: t('globeset-color-green', { ns: 'c-daily-puzzles', defaultValue: 'green' }),
    blue: t('globeset-color-blue', { ns: 'c-daily-puzzles', defaultValue: 'blue' }),
    purple: t('globeset-color-purple', { ns: 'c-daily-puzzles', defaultValue: 'purple' }),
  };
}
