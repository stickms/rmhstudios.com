'use client';

import { useTranslation } from 'react-i18next';
import type { PlayerView } from '@/lib/playtime/types';
import { PlayerRow } from './PlayerRow';

/** The people the viewer follows who play this title, with their time on it. */
export function FriendsWhoPlay({
  friends,
  signedIn,
  kind,
}: {
  friends: PlayerView[];
  signedIn: boolean;
  kind: 'game' | 'app';
}) {
  const { t } = useTranslation('games-hub');
  return (
    <section aria-labelledby="library-friends">
      <h2 id="library-friends" className="site-section-label pb-2">
        {kind === 'app'
          ? t('detail-friends-use', { defaultValue: 'Friends who use it' })
          : t('detail-friends-play', { defaultValue: 'Friends who play' })}
      </h2>
      {!signedIn ? (
        <p className="text-sm text-site-text-muted">
          {t('detail-friends-signin', {
            defaultValue: 'Sign in to see which of the people you follow are here.',
          })}
        </p>
      ) : friends.length === 0 ? (
        <p className="text-sm text-site-text-muted">
          {t('detail-friends-none', {
            defaultValue: 'None of the people you follow have played this yet.',
          })}
        </p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {friends.map((p) => (
            <PlayerRow key={p.userId} player={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
