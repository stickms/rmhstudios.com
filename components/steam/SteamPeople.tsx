'use client';

import { Link } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DetailCommunity } from '@/lib/games/detail-types';
import { formatPlaytime } from '@/lib/games/format-playtime';
import type { PlayerView } from '@/lib/playtime/types';

export function PersonAvatar({ src, name }: { src: string | null; name: string }) {
  return src ? (
    <img className="stm-avatar" src={src} alt="" width={32} height={32} loading="lazy" />
  ) : (
    <span className="stm-avatar stm-avatar-fallback" aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function PlayerLine({ player }: { player: PlayerView }) {
  const { t } = useTranslation('games-hub');
  const name = player.name ?? player.handle ?? t('steam-player', { defaultValue: 'Player' });
  return (
    <li>
      <Link to="/games/profile/$id" params={{ id: player.handle ?? player.userId }} className="stm-person">
        <PersonAvatar src={player.image} name={name} />
        <span className="stm-person-body">
          <span className="stm-person-name">{name}</span>
          <span className="stm-person-sub">
            {t('steam-on-record', { defaultValue: '{{time}} on record', time: formatPlaytime(player.totalSeconds) })}
            {player.last2WeeksSeconds > 0
              ? ` · ${t('steam-past-two-weeks', { defaultValue: '{{time}} past two weeks', time: formatPlaytime(player.last2WeeksSeconds) })}`
              : ''}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** The people the viewer follows who play this title, with their time on record. */
export function SteamFriends({
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
    <section id="friends" className="stm-card" aria-labelledby="stm-friends-h">
      <h2 id="stm-friends-h" className="stm-card-head">
        {kind === 'app'
          ? t('steam-friends-use', { defaultValue: 'Friends who use it' })
          : t('steam-friends-play', { defaultValue: 'Friends who play' })}
        {signedIn && friends.length > 0 ? <span className="stm-count">{friends.length}</span> : null}
      </h2>
      {!signedIn ? (
        <p className="stm-muted stm-card-note">
          {t('steam-friends-signin', { defaultValue: 'Sign in to see which of the people you follow are here.' })}
        </p>
      ) : friends.length === 0 ? (
        <p className="stm-muted stm-card-note">
          {t('steam-friends-none', { defaultValue: 'None of the people you follow have played this yet.' })}
        </p>
      ) : (
        <ul className="stm-people">
          {friends.map((p) => (
            <PlayerLine key={p.userId} player={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The groups that call the title home, and its most-played profiles. */
export function SteamCommunity({
  communities,
  topPlayers,
}: {
  communities: DetailCommunity[];
  topPlayers: PlayerView[];
}) {
  const { t } = useTranslation('games-hub');
  return (
    <section id="community" className="stm-card" aria-labelledby="stm-community-h">
      <h2 id="stm-community-h" className="stm-card-head">
        {t('steam-community', { defaultValue: 'Community' })}
      </h2>
      {communities.length === 0 ? (
        <p className="stm-muted stm-card-note">
          {t('steam-community-none', { defaultValue: 'No group has made this title its home yet.' })}
        </p>
      ) : (
        <ul className="stm-people">
          {communities.map((c) => (
            <li key={c.slug}>
              <Link to="/games/groups/$slug" params={{ slug: c.slug }} className="stm-person">
                <span className="stm-avatar stm-avatar-fallback" aria-hidden>
                  {c.icon ?? <Users size={16} />}
                </span>
                <span className="stm-person-body">
                  <span className="stm-person-name">{c.name}</span>
                  <span className="stm-person-sub">
                    {t('steam-members', { defaultValue: 'Members: {{n}}', n: c.memberCount })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {topPlayers.length > 0 ? (
        <>
          <h3 className="stm-subhead">{t('steam-most-played-by', { defaultValue: 'Most played by' })}</h3>
          <ul className="stm-people">
            {topPlayers.map((p) => (
              <PlayerLine key={p.userId} player={p} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
