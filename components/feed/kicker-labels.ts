/**
 * The feed row's kicker (the kind of thing a row is), translated.
 *
 * A row's kicker is its `category` or, without one, its `type`. A key built
 * from it (`kicker.${raw}`) is invisible to `pnpm i18n:extract`, so no kicker
 * reached `locales/en/feed.json`. The kinds the feed names itself (`FeedItemType`
 * in `lib/feed-types.ts`) are written out here as literal calls; a category
 * the server sends that is not one of them is shown humanised, never as a key.
 * `components/feed/__tests__/kicker-labels.test.ts` pins the keys and English.
 */
import type { TFunction } from 'i18next';
import type { FeedItemType } from '@/lib/feed-types';

/**
 * The translated kicker for a row's raw kicker, or `undefined` for one this
 * list does not know (namespace `feed`). A switch, not a map: a feed renders
 * one of these per row, so only the row's own string is translated.
 */
export function feedKickerLabel(t: TFunction, raw: string): string | undefined {
  // The `FeedItemType` of the kinds the feed names itself.
  const kind = raw as FeedItemType;
  switch (kind) {
    case 'rmhark':
      return t('kicker.rmhark', { ns: 'feed', defaultValue: 'Rmhark' });
    case 'game_announcement':
      return t('kicker.game_announcement', { ns: 'feed', defaultValue: 'Game announcement' });
    case 'app_announcement':
      return t('kicker.app_announcement', { ns: 'feed', defaultValue: 'App announcement' });
    case 'news':
      return t('kicker.news', { ns: 'feed', defaultValue: 'News' });
    case 'blog':
      return t('kicker.blog', { ns: 'feed', defaultValue: 'Blog' });
    case 'research':
      return t('kicker.research', { ns: 'feed', defaultValue: 'Research' });
    case 'election_announcement':
      return t('kicker.election_announcement', { ns: 'feed', defaultValue: 'Election announcement' });
    default:
      return undefined;
  }
}
