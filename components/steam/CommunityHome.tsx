'use client';

import { Link } from '@tanstack/react-router';
import { Star, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CommunityHomeData, GroupRef } from '@/lib/games/community-types';
import { formatPlaytime } from '@/lib/games/format-playtime';
import { CommunityNav } from './CommunityNav';
import { ActivityFeed, InGameCard } from './FriendActivity';
import { PersonAvatar } from './SteamPeople';
import { TitleArt } from './TitleArt';

export function GroupRow({ group }: { group: GroupRef }) {
  const { t } = useTranslation('games-hub');
  return (
    <li>
      <Link to="/games/groups/$slug" params={{ slug: group.slug }} className="stm-person">
        <span className="stm-group-icon" aria-hidden>
          {group.icon ?? <Users size={16} />}
        </span>
        <span className="stm-person-body">
          <span className="stm-person-name">{group.name}</span>
          <span className="stm-person-sub">
            {t('steam-members-n', { defaultValue: 'Members: {{n}}', n: group.memberCount })}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="stm-stars" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="stm-star" data-on={n <= value}>
          <Star />
        </span>
      ))}
    </span>
  );
}

/** Steam's Community Home: what is being played, what people are saying, groups. */
export function CommunityHome({ data }: { data: CommunityHomeData }) {
  const { t } = useTranslation('games-hub');
  return (
    <div className="stm-web">
      <CommunityNav />
      <div className="stm-web-cols">
        <div>
          <h1 className="stm-web-title">{t('steam-community-home', { defaultValue: 'Community Home' })}</h1>

          {data.friends ? <ActivityFeed events={data.friends.events} /> : null}

          <section aria-labelledby="stm-trending" className="stm-web-card">
            <h2 id="stm-trending" className="stm-web-head">
              {t('steam-trending', { defaultValue: 'Played the most these two weeks' })}
            </h2>
            {data.trending.length === 0 ? (
              <p className="stm-muted stm-web-pad">
                {t('steam-trending-empty', { defaultValue: 'Nobody has played in the last two weeks yet.' })}
              </p>
            ) : (
              <ul className="stm-capsules stm-web-pad">
                {data.trending.map((g) => (
                  <li key={g.id}>
                    <Link to="/games/$gameId" params={{ gameId: g.id }} className="stm-capsule">
                      <TitleArt build={g} width={240} height={360} />
                      <span className="stm-capsule-name">{g.title}</span>
                      <span className="stm-capsule-sub">
                        {t('steam-trending-line', {
                          defaultValue: 'Players: {{n}} · {{time}}',
                          n: g.players,
                          time: formatPlaytime(g.seconds),
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="stm-reviews" className="stm-web-card">
            <h2 id="stm-reviews" className="stm-web-head">
              {t('steam-latest-reviews', { defaultValue: 'Latest reviews' })}
            </h2>
            {data.reviews.length === 0 ? (
              <p className="stm-muted stm-web-pad">
                {t('steam-latest-reviews-empty', { defaultValue: 'No written reviews yet.' })}
              </p>
            ) : (
              <ul className="stm-reviews">
                {data.reviews.map((r) => (
                  <li key={r.id} className="stm-review">
                    <PersonAvatar src={r.author.image} name={r.author.name} />
                    <div className="stm-review-body">
                      <div className="stm-review-head">
                        <Link
                          to="/games/profile/$id"
                          params={{ id: r.author.handle ?? r.author.userId }}
                          className="stm-link"
                        >
                          {r.author.name}
                        </Link>
                        <Stars value={r.stars} />
                        <Link to="/games/$gameId" params={{ gameId: r.gameId }} className="stm-link">
                          {r.gameTitle}
                        </Link>
                      </div>
                      <p>{r.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside>
          {data.friends ? <InGameCard friends={data.friends} /> : null}
          {data.signedIn ? (
            <section aria-labelledby="stm-my-groups" className="stm-web-card">
              <h2 id="stm-my-groups" className="stm-web-head">
                {t('steam-your-groups', { defaultValue: 'Your groups' })}
              </h2>
              {data.myGroups.length === 0 ? (
                <p className="stm-muted stm-web-pad">
                  {t('steam-your-groups-empty', { defaultValue: 'You have not joined a group yet.' })}
                </p>
              ) : (
                <ul className="stm-people">
                  {data.myGroups.map((g) => (
                    <GroupRow key={g.slug} group={g} />
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section aria-labelledby="stm-pop-groups" className="stm-web-card">
            <h2 id="stm-pop-groups" className="stm-web-head">
              {t('steam-popular-groups', { defaultValue: 'Popular groups' })}
            </h2>
            <ul className="stm-people">
              {data.groups.map((g) => (
                <GroupRow key={g.slug} group={g} />
              ))}
            </ul>
            <p className="stm-web-pad">
              <Link to="/games/communities" className="stm-link">
                {t('steam-browse-groups', { defaultValue: 'Browse all groups' })}
              </Link>
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
