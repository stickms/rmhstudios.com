'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { SteamProfile } from '@/lib/games/community-types';
import { formatLastPlayed, formatPlaytime } from '@/lib/games/format-playtime';
import { levelBadgeTier } from '@/lib/games/level-badge';
import { AchievementIcon } from './AchievementIcon';
import { CommunityNav } from './CommunityNav';
import { GroupRow } from './CommunityHome';
import { PersonAvatar } from './SteamPeople';
import { ShowcaseEditor } from './ShowcaseEditor';
import { TitleArt } from './TitleArt';

/** A player's profile, laid out as steamcommunity.com lays out one. */
export function ProfilePage({ profile: p, signedIn }: { profile: SteamProfile; signedIn: boolean }) {
  const { t } = useTranslation('games-hub');
  const joined = new Date(p.joinedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="stm-web">
      <CommunityNav />
      <header className="stm-pf-head">
        <div className="stm-pf-avatar" data-online={p.isOnline}>
          {p.image ? (
            <img src={p.image} alt="" width={164} height={164} suppressHydrationWarning />
          ) : (
            <span aria-hidden>{p.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="stm-pf-summary">
          <h1 className="stm-pf-name">{p.name}</h1>
          <p className="stm-muted">
            {[p.handle ? `@${p.handle}` : null, p.pronouns, p.location].filter(Boolean).join(' · ')}
          </p>
          <p className="stm-pf-bio">{p.bio ?? ''}</p>
          <p className="stm-pf-status" data-online={p.isOnline} data-playing={p.nowPlaying ? 'true' : undefined}>
            {p.nowPlaying ? (
              <>
                {t('steam-status-playing', { defaultValue: 'Currently In-Game' })}
                {': '}
                <Link to="/games/$gameId" params={{ gameId: p.nowPlaying.gameId }} className="stm-link">
                  {p.nowPlaying.title}
                </Link>
              </>
            ) : p.isOnline
              ? t('steam-status-online', { defaultValue: 'Currently Online' })
              : t('steam-status-offline', { defaultValue: 'Currently Offline' })}
            {' · '}
            {t('steam-member-since', { defaultValue: 'Member since {{date}}', date: joined })}
          </p>
        </div>
        <div className="stm-pf-side">
          <div className="stm-pf-level">
            <span>{t('steam-level', { defaultValue: 'Level' })}</span>
            <span className="stm-level-badge" data-tier={levelBadgeTier(p.level)}>
              {p.level}
            </span>
          </div>
          <div
            className="stm-bar stm-bar-thin"
            role="progressbar"
            aria-label={t('steam-level-progress', { defaultValue: 'Progress to the next level' })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p.levelProgress * 100)}
          >
            <div className="stm-bar-fill" style={{ width: `${Math.round(p.levelProgress * 100)}%` }} />
          </div>
          {!p.isOwnProfile && signedIn ? (
            <Link to="/games/trades/new/$id" params={{ id: p.id }} className="stm-btn">
              {t('steam-trade', { defaultValue: 'Trade' })}
            </Link>
          ) : null}
          {!p.isOwnProfile ? (
            <Link
              to="/u/$userid"
              params={{ userid: p.handle ?? p.id }}
              className="stm-btn stm-btn-blue"
            >
              {p.isFollowing
                ? t('steam-friends-already', { defaultValue: 'Friends' })
                : t('steam-friends-add', { defaultValue: 'Add friend' })}
            </Link>
          ) : (
            <Link to="/settings/profile" className="stm-btn stm-btn-blue">
              {t('steam-edit-profile', { defaultValue: 'Edit profile' })}
            </Link>
          )}
        </div>
      </header>

      <div className="stm-web-cols">
        <div>
          <section className="stm-web-card" aria-labelledby="stm-pf-activity">
            <h2 id="stm-pf-activity" className="stm-web-head">
              {t('steam-recent-activity', { defaultValue: 'Recent Activity' })}
              {p.games ? (
                <span className="stm-count">
                  {t('steam-hours-two-weeks', {
                    defaultValue: '{{time}} past two weeks',
                    time: formatPlaytime(p.games.last2WeeksSeconds),
                  })}
                </span>
              ) : null}
            </h2>
            {p.games === null ? (
              <p className="stm-muted stm-web-pad">
                {signedIn
                  ? t('steam-playtime-hidden', { defaultValue: 'This player keeps their playtime private.' })
                  : t('steam-playtime-signin', { defaultValue: 'Sign in to see playtime.' })}
              </p>
            ) : p.games.recent.length === 0 ? (
              <p className="stm-muted stm-web-pad">
                {t('steam-no-games', { defaultValue: 'No games played yet.' })}
              </p>
            ) : (
              <ul className="stm-activity">
                {p.games.recent.map((g) => {
                  const last = formatLastPlayed(g.lastPlayedAt);
                  return (
                    <li key={g.id}>
                      <Link to="/games/$gameId" params={{ gameId: g.id }} className="stm-activity-row">
                        <TitleArt build={g} width={120} height={180} className="stm-art-sm" />
                        <span className="stm-person-body">
                          <span className="stm-person-name">{g.title}</span>
                          <span className="stm-person-sub">
                            {t('steam-on-record', {
                              defaultValue: '{{time}} on record',
                              time: formatPlaytime(g.totalSeconds),
                            })}
                            {last.key === 'today'
                              ? ` · ${t('steam-last-today', { defaultValue: 'last played today' })}`
                              : last.key === 'yesterday'
                                ? ` · ${t('steam-last-yesterday', { defaultValue: 'last played yesterday' })}`
                                : last.key === 'days'
                                  ? ` · ${t('steam-last-days', { defaultValue: 'last played {{n}} days ago', n: last.days })}`
                                  : ''}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="stm-web-card" aria-labelledby="stm-pf-ach">
            <h2 id="stm-pf-ach" className="stm-web-head">
              {t('steam-achievement-showcase', { defaultValue: 'Achievement Showcase' })}
              <span className="stm-count">
                {t('steam-ach-of', {
                  defaultValue: '{{done}} of {{total}}',
                  done: p.achievementsUnlocked,
                  total: p.achievementsTotal,
                })}
              </span>
            </h2>
            {p.showcaseEditor ? (
              <div className="stm-web-pad">
                <ShowcaseEditor key={p.showcaseEditor.selected.achievements.join() + p.showcaseEditor.selected.badges.join()} data={p.showcaseEditor} />
              </div>
            ) : null}
            {p.recentAchievements.length === 0 ? (
              <p className="stm-muted stm-web-pad">
                {t('steam-no-achievements', { defaultValue: 'No achievements unlocked yet.' })}
              </p>
            ) : (
              <ul className="stm-showcase">
                {p.recentAchievements.map((a) => (
                  <li key={a.id} title={`${a.name} — ${a.description}`}>
                    <AchievementIcon id={a.id} tier={a.tier} unlocked target={a.target} size={64} />
                    <span className="stm-showcase-name">{a.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside>
          <section className="stm-web-card" aria-labelledby="stm-pf-stats">
            <h2 id="stm-pf-stats" className="stm-web-head">
              {t('steam-profile-stats', { defaultValue: 'Stats' })}
            </h2>
            <dl className="stm-pf-stats">
              <div>
                <dt>{t('steam-stat-games', { defaultValue: 'Games' })}</dt>
                <dd>{p.games ? p.games.played : '–'}</dd>
              </div>
              <div>
                <dt>{t('steam-stat-hours', { defaultValue: 'Time played' })}</dt>
                <dd>{p.games ? formatPlaytime(p.games.totalSeconds) : '–'}</dd>
              </div>
              <div>
                <dt>{t('steam-stat-reviews', { defaultValue: 'Reviews' })}</dt>
                <dd>{p.reviewCount}</dd>
              </div>
              <div>
                <dt>{t('steam-stat-followers', { defaultValue: 'Followers' })}</dt>
                <dd>{p.followerCount}</dd>
              </div>
            </dl>
          </section>

          <section className="stm-web-card" aria-labelledby="stm-pf-badges">
            <h2 id="stm-pf-badges" className="stm-web-head">
              {t('steam-badges', { defaultValue: 'Badges' })}
              <span className="stm-count">{p.badges.length}</span>
            </h2>
            {p.badges.length === 0 ? (
              <p className="stm-muted stm-web-pad">
                {t('steam-no-badges', { defaultValue: 'No badges crafted yet.' })}
              </p>
            ) : (
              <ul className="stm-people">
                {p.badges.map((b) => (
                  <li key={`${b.id}-${b.foil}`}>
                    <Link to="/games/$gameId" params={{ gameId: b.id }} className="stm-person">
                      <span className="stm-badge-chip" data-foil={b.foil ? 'true' : undefined} aria-hidden>
                        {b.level}
                      </span>
                      <span className="stm-person-body">
                        <span className="stm-person-name">{b.title}</span>
                        <span className="stm-person-sub">
                          {b.foil
                            ? t('steam-badge-foil', { defaultValue: 'Foil badge' })
                            : t('steam-badge-level-n', { defaultValue: 'Level {{n}}', n: b.level })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="stm-web-card" aria-labelledby="stm-pf-groups">
            <h2 id="stm-pf-groups" className="stm-web-head">
              {t('steam-groups', { defaultValue: 'Groups' })}
              <span className="stm-count">{p.groups.length}</span>
            </h2>
            {p.groups.length === 0 ? (
              <p className="stm-muted stm-web-pad">
                {t('steam-no-groups', { defaultValue: 'Not in any public group.' })}
              </p>
            ) : (
              <ul className="stm-people">
                {p.groups.map((g) => (
                  <GroupRow key={g.slug} group={g} />
                ))}
              </ul>
            )}
          </section>

          <section className="stm-web-card" aria-labelledby="stm-pf-friends">
            <h2 id="stm-pf-friends" className="stm-web-head">
              {t('steam-friends', { defaultValue: 'Friends' })}
              <span className="stm-count">{p.followingCount}</span>
            </h2>
            {p.friends.length === 0 ? (
              <p className="stm-muted stm-web-pad">
                {t('steam-no-friends', { defaultValue: 'Not following anyone yet.' })}
              </p>
            ) : (
              <ul className="stm-people">
                {p.friends.map((f) => (
                  <li key={f.userId}>
                    <Link
                      to="/games/profile/$id"
                      params={{ id: f.handle ?? f.userId }}
                      className="stm-person"
                    >
                      <PersonAvatar src={f.image} name={f.name} />
                      <span className="stm-person-name">{f.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
