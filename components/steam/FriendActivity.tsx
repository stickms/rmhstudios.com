import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { getFriendActivityApi } from '@/lib/games/friends.contract';
import { groupEventsByDay } from '@/lib/games/activity';
import type { ActivityEvent, FriendActivity as FriendActivityData } from '@/lib/games/activity-types';
import { formatPlaytime } from '@/lib/games/format-playtime';
import { PersonAvatar } from './SteamPeople';

const STALE_MS = 60_000;

/** The Friends section of the library home: who the viewer follows is playing now, then what they did lately. */
export function FriendActivity({ signedIn }: { signedIn: boolean }) {
  const query = useQuery({
    ...apiQuery(getFriendActivityApi),
    enabled: signedIn,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (!signedIn) return null;
  return <FriendActivityView data={query.data} loading={query.isPending} failed={query.isError} />;
}

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** The view alone, so it renders the same from data in a test. */
export function FriendActivityView({
  data,
  loading = false,
  failed = false,
  timeZone,
}: {
  data: FriendActivityData | undefined;
  loading?: boolean;
  failed?: boolean;
  timeZone?: string;
}) {
  const { t, i18n } = useTranslation('games-friends');
  const arrival = useArrival(!loading);
  const zone = timeZone ?? browserZone();
  const days = useMemo(() => groupEventsByDay(data?.events ?? [], zone), [data, zone]);

  // A member who follows nobody (or only people who are left out) gets no section at all.
  if (!loading && !failed && data && data.followed === 0) return null;

  const dayLabel = (day: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full', timeZone: 'UTC' }).format(
        new Date(`${day}T12:00:00Z`),
      );
    } catch {
      return day;
    }
  };

  return (
    <section id="friends" aria-labelledby="stm-friends-home-h" aria-busy={loading || undefined}>
      <h2 id="stm-friends-home-h" className="stm-shelf-head">
        {t('friends-title', { defaultValue: 'Friends' })}
      </h2>
      {loading ? (
        <div className="stm-card-note" data-testid="friends-loading">
          <Skeleton className="mb-2 h-11 w-full" />
          <Skeleton className="mb-2 h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : failed || !data ? (
        <p className="stm-muted stm-card-note">
          {t('friends-error', { defaultValue: 'Could not load what the people you follow are playing.' })}
        </p>
      ) : data.inGame.length === 0 && data.events.length === 0 ? (
        <p className={`stm-muted stm-card-note ${arrival ?? ''}`.trim()}>
          {t('friends-empty', { defaultValue: 'Nobody you follow has played lately.' })}
        </p>
      ) : (
        <div className={arrival}>
          {data.inGame.length > 0 ? (
            <>
              <h3 className="stm-card-note stm-muted">{t('friends-playing-now', { defaultValue: 'Playing now' })}</h3>
              <ul className="stm-people">
                {data.inGame.map((p) => (
                  <li key={p.user.userId}>
                    <Link to="/games/$gameId" params={{ gameId: p.game.gameId }} className="stm-person">
                      <PersonAvatar src={p.user.image} name={p.user.name} />
                      <span className="stm-person-body">
                        <span className="stm-person-name">
                          <bdi>{p.user.name}</bdi>
                        </span>
                        <span className="stm-person-sub">
                          {t('friends-playing-game', { defaultValue: 'is playing {{game}}', game: p.game.title })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {days.map((d) => (
            <div key={d.day}>
              <h3 className="stm-card-note stm-muted">{dayLabel(d.day)}</h3>
              <ul className="stm-people">
                {d.events.map((e) => (
                  <li key={e.id}>
                    <EventLink event={e} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EventLink({ event: e }: { event: ActivityEvent }) {
  const { t } = useTranslation('games-friends');
  const game = e.gameTitle;
  let sentence: string;
  switch (e.kind) {
    case 'achievement':
      sentence = t('friends-event-achievement', { defaultValue: 'unlocked {{name}}', name: String(e.detail ?? '') });
      break;
    case 'badge':
      sentence = t('friends-event-badge', {
        defaultValue: 'crafted a level {{level}} badge for {{game}}',
        level: Number(e.detail ?? 0),
        game,
      });
      break;
    case 'review':
      sentence = t('friends-event-review', {
        defaultValue: 'rated {{game}} {{stars}} out of 5',
        game,
        stars: Number(e.detail ?? 0),
      });
      break;
    case 'thread':
      sentence = t('friends-event-thread', { defaultValue: 'started a thread in {{game}}', game });
      break;
    case 'played':
      sentence = t('friends-event-played', {
        defaultValue: 'played {{game}} for {{time}}',
        game,
        time: formatPlaytime(Number(e.detail ?? 0)),
      });
      break;
  }
  const body = (
    <>
      <PersonAvatar src={e.user.image} name={e.user.name} />
      <span className="stm-person-body">
        <span className="stm-person-name">
          <bdi>{e.user.name}</bdi> {sentence}
        </span>
        {e.kind === 'thread' && typeof e.detail === 'string' ? (
          <span className="stm-person-sub" dir="auto">
            {e.detail}
          </span>
        ) : null}
      </span>
    </>
  );
  // An achievement belongs to no title, so it goes to the member's profile; everything else to its game or thread.
  if (e.kind === 'thread' && e.threadId) {
    return (
      <Link
        to="/games/hub/$gameId/t/$threadId"
        params={{ gameId: e.gameId, threadId: e.threadId }}
        className="stm-person"
      >
        {body}
      </Link>
    );
  }
  if (e.gameId) {
    return (
      <Link to="/games/$gameId" params={{ gameId: e.gameId }} className="stm-person">
        {body}
      </Link>
    );
  }
  return (
    <Link to="/games/profile/$id" params={{ id: e.user.handle ?? e.user.userId }} className="stm-person">
      {body}
    </Link>
  );
}
