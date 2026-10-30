'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ActivityEvent, FriendActivity } from '@/lib/games/activity-types';
import { formatPlaytime } from '@/lib/games/format-playtime';
import { timeAgoShort } from '@/lib/utils';
import { Stars } from './CommunityHome';
import { PersonAvatar } from './SteamPeople';

/** The people you follow who have a game open right now, with the game's name. */
export function InGameCard({ friends }: { friends: FriendActivity }) {
  const { t } = useTranslation('games-hub');
  return (
    <section className="stm-web-card" aria-labelledby="stm-ingame">
      <h2 id="stm-ingame" className="stm-web-head">
        {t('steam-in-game', { defaultValue: 'In-Game' })}
        <span className="stm-count">{friends.inGame.length}</span>
      </h2>
      {friends.inGame.length === 0 ? (
        <p className="stm-web-pad stm-muted">
          {t('steam-in-game-empty', { defaultValue: 'No one you follow is playing right now.' })}
        </p>
      ) : (
        <ul className="stm-people">
          {friends.inGame.map(({ user, game }) => (
            <li key={user.userId}>
              <Link to="/games/profile/$id" params={{ id: user.handle ?? user.userId }} className="stm-person">
                <PersonAvatar src={user.image} name={user.name} />
                <span className="stm-person-body">
                  <span className="stm-person-name">{user.name}</span>
                  <span className="stm-person-sub stm-playing">{game.title}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Verb({ e }: { e: ActivityEvent }) {
  const { t } = useTranslation('games-hub');
  switch (e.kind) {
    case 'played':
      return <>{t('steam-act-played', { defaultValue: 'played' })}</>;
    case 'achievement':
      return <>{t('steam-act-achievement', { defaultValue: 'unlocked the achievement' })}</>;
    case 'badge':
      return <>{t('steam-act-badge', { defaultValue: 'crafted a badge for' })}</>;
    case 'review':
      return <>{t('steam-act-review', { defaultValue: 'reviewed' })}</>;
    default:
      return <>{t('steam-act-thread', { defaultValue: 'started a discussion in' })}</>;
  }
}

function Tail({ e }: { e: ActivityEvent }) {
  const { t } = useTranslation('games-hub');
  if (e.kind === 'played') {
    return <> {t('steam-act-played-tail', { defaultValue: '{{time}} this week', time: formatPlaytime(Number(e.detail)) })}</>;
  }
  if (e.kind === 'badge') {
    return <> {t('steam-act-badge-tail', { defaultValue: '(level {{n}})', n: e.detail })}</>;
  }
  if (e.kind === 'review') return <> <Stars value={Number(e.detail)} /></>;
  return null;
}

/** What the people you follow have done lately: played, unlocked, crafted, reviewed, posted. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const { t } = useTranslation('games-hub');
  return (
    <section className="stm-web-card" aria-labelledby="stm-activity">
      <h2 id="stm-activity" className="stm-web-head">
        {t('steam-friend-activity', { defaultValue: 'Friend Activity' })}
      </h2>
      {events.length === 0 ? (
        <p className="stm-web-pad stm-muted">
          {t('steam-friend-activity-empty', {
            defaultValue: 'Nothing yet. Follow people to see what they are up to.',
          })}
        </p>
      ) : (
        <ul className="stm-activity-feed">
          {events.map((e) => (
            <li key={e.id} className="stm-activity-item">
              <PersonAvatar src={e.user.image} name={e.user.name} />
              <span className="stm-activity-text">
                <Link to="/games/profile/$id" params={{ id: e.user.handle ?? e.user.userId }} className="stm-link">
                  {e.user.name}
                </Link>{' '}
                <Verb e={e} />{' '}
                {e.kind === 'achievement' ? (
                  <strong>{String(e.detail)}</strong>
                ) : e.kind === 'thread' && e.threadId ? (
                  <>
                    <Link to="/games/$gameId" params={{ gameId: e.gameId }} className="stm-link">
                      {e.gameTitle}
                    </Link>
                    : <Link to="/games/hub/$gameId/t/$threadId" params={{ gameId: e.gameId, threadId: e.threadId }} className="stm-link">
                      {String(e.detail)}
                    </Link>
                  </>
                ) : e.gameId ? (
                  <Link to="/games/$gameId" params={{ gameId: e.gameId }} className="stm-link">
                    {e.gameTitle}
                  </Link>
                ) : null}
                <Tail e={e} />
              </span>
              <span className="stm-person-sub stm-activity-when">{timeAgoShort(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
