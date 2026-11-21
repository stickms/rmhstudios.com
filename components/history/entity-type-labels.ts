/**
 * The history filter's entity-type names, translated.
 *
 * `HISTORY_ENTITY_TYPES` in `lib/history/constants.ts` is the list; a key
 * built from a type (`type-${type}`) is invisible to `pnpm i18n:extract`. Each
 * type is written out here as a literal call. The English is the type's own
 * id, which is what the filter has always shown.
 * `components/history/__tests__/entity-type-labels.test.ts` holds the map
 * equal to the list.
 */
import type { TFunction } from 'i18next';
import type { HistoryEntityType } from '@/lib/history/constants';

/** Translated name per history entity type (namespace `c-history`). */
export function historyEntityTypeLabels(t: TFunction): Record<HistoryEntityType, string> {
  return {
    tube_video: t('type-tube_video', { ns: 'c-history', defaultValue: 'tube_video' }),
    song: t('type-song', { ns: 'c-history', defaultValue: 'song' }),
    game: t('type-game', { ns: 'c-history', defaultValue: 'game' }),
    library_doc: t('type-library_doc', { ns: 'c-history', defaultValue: 'library_doc' }),
    news: t('type-news', { ns: 'c-history', defaultValue: 'news' }),
  };
}
