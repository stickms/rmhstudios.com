/**
 * Every sentence friends' progress says (RMH Music Phase 6, plan 1.5), as pure functions of the
 * translator and the data, so each case is checked without a DOM. Plurals by i18next `count`;
 * numbers stay plain. Unit and song titles are data (shown as written, as the path and the
 * songbook show them).
 *
 * Every call names its namespace (`ns`): this file has no `useTranslation` of its own.
 */
import type { TFunction } from 'i18next';
import type { FriendProgress } from '@/lib/rmhmusic/social/friends.contract';

type T = TFunction<'c-rmhmusic'>;

/** "Daily challenge: 12 days in a row, done today" (one string per case: word order is the language's). */
export function friendDailyLine(t: T, daily: FriendProgress['daily']): string {
  if (daily.streak === 0)
    return t('friends-daily-none', {
      ns: 'c-rmhmusic',
      defaultValue: 'Daily challenge: no streak yet',
    });
  return daily.today
    ? t('friends-daily-streak-today', {
        ns: 'c-rmhmusic',
        count: daily.streak,
        defaultValue_one: 'Daily challenge: {{count}} day in a row, done today',
        defaultValue: 'Daily challenge: {{count}} days in a row, done today',
      })
    : t('friends-daily-streak', {
        ns: 'c-rmhmusic',
        count: daily.streak,
        defaultValue_one: 'Daily challenge: {{count}} day in a row',
        defaultValue: 'Daily challenge: {{count}} days in a row',
      });
}

/** "3 of 5 units finished, last Train your ear". */
export function friendUnitsLine(t: T, units: FriendProgress['units']): string {
  return units.last === null
    ? t('friends-units', {
        ns: 'c-rmhmusic',
        finished: units.finished,
        total: units.total,
        count: Number(units.total),
        defaultValue_one: '{{finished}} of {{total}} unit finished',
        defaultValue: '{{finished}} of {{total}} units finished',
      })
    : t('friends-units-last', {
        ns: 'c-rmhmusic',
        finished: units.finished,
        total: units.total,
        last: units.last,
        count: Number(units.total),
        defaultValue_one: '{{finished}} of {{total}} unit finished, last {{last}}',
        defaultValue: '{{finished}} of {{total}} units finished, last {{last}}',
      });
}

/** The home's short line: "Daily: 12 days · 3 of 5 units". */
export function friendShortLine(t: T, friend: FriendProgress): string {
  return t('friends-short', {
    ns: 'c-rmhmusic',
    count: friend.daily.streak,
    finished: friend.units.finished,
    total: friend.units.total,
    defaultValue_one: 'Daily: {{count}} day · {{finished}} of {{total}} units',
    defaultValue: 'Daily: {{count}} days · {{finished}} of {{total}} units',
  });
}

/** One song best: "Ode to Joy, Play along: 98". */
export function friendSongLine(t: T, song: FriendProgress['songs'][number]): string {
  const mode =
    song.mode === 'play'
      ? t('song-mode-play', {
          ns: 'c-rmhmusic',
          defaultValue: 'Play along',
        })
      : t('song-mode-wait', {
          ns: 'c-rmhmusic',
          defaultValue: 'Wait for me',
        });
  return t('friends-song', {
    ns: 'c-rmhmusic',
    title: song.title,
    mode,
    score: song.bestScore,
    defaultValue: '{{title}}, {{mode}}: {{score}}',
  });
}
