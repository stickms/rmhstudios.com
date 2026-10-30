'use client';

import { Link } from '@tanstack/react-router';
import { ArrowLeft, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GameTracker } from '@/components/arcade/GameTracker';
import { HowToPlay } from '@/components/games/HowToPlay';
import { NightrailTrickBoard } from '@/components/games/NightrailTrickBoard';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import type { LibraryExtras } from '@/lib/games/detail-types';
import { formatLastPlayed, formatPlaytime } from '@/lib/games/format-playtime';
import { heroSource, isOffSite } from '@/lib/games/library';
import type { GuideSummary, RatingAgg, ReviewView } from '@/lib/games/reviews';
import type { TrickView } from '@/lib/trick-week/trick-week';
import { SteamAchievements } from './SteamAchievements';
import { CollectionMenu } from './CollectionMenu';
import { SteamCards } from './SteamCards';
import { SteamGuides } from './SteamGuides';
import { SteamCommunity, SteamFriends } from './SteamPeople';
import { SteamReviews } from './SteamReviews';

export type GamePageData = {
  gameId: string;
  kind: 'game' | 'app';
  title: string;
  cta: string;
  description: string;
  tags: string[];
  playHref: string;
  image: string | null;
  bannerUrl: string | null;
  hue: number;
  agg: RatingAgg;
  reviews: ReviewView[];
  guides: GuideSummary[];
  signedIn: boolean;
  aiEnabled: boolean;
  trickOfTheWeek: TrickView | null;
  extras: LibraryExtras;
};

/**
 * One title's page, the way Steam's Library draws a game: the hero art with the title,
 * a bar with the green Play button and your numbers (play time, last played,
 * achievements), the hub's links, then two columns — achievements, reviews and guides
 * on the left; friends, community and the blurb on the right. Apps have no reviews or
 * guides. Off-site titles show only the hero and Play (they cannot accrue playtime).
 */
export function GamePage({ data }: { data: GamePageData }) {
  const { t } = useTranslation('games-hub');
  const { extras } = data;
  const hero = heroSource({ thumbnailUrl: data.image, bannerUrl: data.bannerUrl, hue: data.hue });
  const isGame = data.kind === 'game';
  const offSite = isOffSite(data.playHref);
  const done = extras.achievements.filter((a) => a.unlocked).length;
  const total = extras.achievements.length;
  const last = formatLastPlayed(extras.activity?.lastPlayedAt ?? null);
  const lastLabel =
    last.key === 'never'
      ? t('steam-never', { defaultValue: 'Never' })
      : last.key === 'today'
        ? t('steam-today', { defaultValue: 'Today' })
        : last.key === 'yesterday'
          ? t('steam-yesterday', { defaultValue: 'Yesterday' })
          : t('steam-days-ago', { defaultValue: '{{n}} days ago', n: last.days });

  return (
    <article className="stm-hub">
      <Link to="/games" className="stm-back stm-back-phone">
        <ArrowLeft aria-hidden />
        {t('steam-back-library', { defaultValue: 'Library' })}
      </Link>

      <div className="stm-hero" data-hero={hero.kind}>
        {hero.kind === 'banner' && hero.src ? (
          <OptimizedImage
            src={hero.src}
            alt=""
            width={1280}
            height={427}
            priority
            className="stm-hero-img"
            // Stamped `data-loaded` by the site's media-reveal script as it loads.
            suppressHydrationWarning
          />
        ) : hero.kind === 'cropped-card' && hero.src ? (
          <>
            {/* No wide art: a blurred copy fills the banner and the sharp capsule sits
                beside the title, as Steam does for a game that only has a capsule. */}
            <OptimizedImage
              src={hero.src}
              alt=""
              width={320}
              height={480}
              className="stm-hero-backdrop"
              suppressHydrationWarning
            />
            <OptimizedImage
              src={hero.src}
              alt=""
              width={320}
              height={480}
              priority
              className="stm-hero-capsule"
              suppressHydrationWarning
            />
          </>
        ) : (
          <div className="stm-hero-tile" aria-hidden style={{ background: `hsl(${data.hue} 32% 22%)` }}>
            {data.title.charAt(0)}
          </div>
        )}
        <div className="stm-hero-fade" aria-hidden />
        <h1 className="stm-hero-title">{data.title}</h1>
      </div>

      <div className="stm-actionbar">
        <a
          className="stm-btn stm-btn-play"
          href={data.playHref}
          {...(offSite ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          <Play aria-hidden />
          {data.cta || t('play', { defaultValue: 'Play' })}
        </a>
        <CollectionMenu gameId={data.gameId} />
        {offSite ? null : (
          <dl className="stm-stats">
            {data.signedIn ? (
              <>
                <div>
                  <dt>{data.kind === 'app' ? t('steam-time-used', { defaultValue: 'Time used' }) : t('steam-play-time', { defaultValue: 'Play time' })}</dt>
                  <dd>{formatPlaytime(extras.activity?.totalSeconds ?? 0)}</dd>
                </div>
                <div>
                  <dt>{t('steam-last-played', { defaultValue: 'Last played' })}</dt>
                  <dd>{lastLabel}</dd>
                </div>
                {total > 0 ? (
                  <div>
                    <dt>{t('steam-achievements', { defaultValue: 'Achievements' })}</dt>
                    <dd>
                      {done} / {total}
                    </dd>
                  </div>
                ) : null}
              </>
            ) : (
              <div>
                <dt>{data.kind === 'app' ? t('steam-time-used', { defaultValue: 'Time used' }) : t('steam-play-time', { defaultValue: 'Play time' })}</dt>
                <dd className="stm-stat-note">
                  {t('steam-signin-track', { defaultValue: 'Sign in to track your time and progress.' })}
                </dd>
              </div>
            )}
            {isGame && data.agg.count > 0 ? (
              <div>
                <dt>{t('rating', { defaultValue: 'Rating' })}</dt>
                <dd>
                  {data.agg.average} <span className="stm-muted">({data.agg.count})</span>
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </div>

      <nav className="stm-hubnav" aria-label={t('steam-hub-nav', { defaultValue: 'On this page' })}>
        {total > 0 ? <a href="#achievements">{t('steam-achievements', { defaultValue: 'Achievements' })}</a> : null}
        {extras.cards ? <a href="#cards">{t('steam-trading-cards', { defaultValue: 'Trading Cards' })}</a> : null}
        {offSite ? null : <a href="#friends">{t('steam-friends-short', { defaultValue: 'Friends' })}</a>}
        {isGame ? <a href="#reviews">{t('reviews', { defaultValue: 'Reviews' })}</a> : null}
        {isGame ? <a href="#guides">{t('guides', { defaultValue: 'Player guides' })}</a> : null}
        <Link to="/games/hub/$gameId" params={{ gameId: data.gameId }}>
          {t('steam-hub-heading', { defaultValue: 'Community Hub' })}
        </Link>
        <a href="#community">{t('steam-community', { defaultValue: 'Community' })}</a>
      </nav>

      <div className="stm-hub-cols">
        <div className="stm-hub-main">
          {offSite ? null : <SteamAchievements items={extras.achievements} signedIn={data.signedIn} />}
          {extras.cards ? (
            <SteamCards gameId={data.gameId} title={data.title} hue={data.hue} cards={extras.cards} />
          ) : null}
          {data.gameId === 'nightrail' ? (
            <div className="stm-legacy">
              <NightrailTrickBoard winner={data.trickOfTheWeek ?? null} signedIn={data.signedIn} />
            </div>
          ) : null}
          {isGame ? (
            <>
              <div className="stm-legacy">
                <GameTracker gameId={data.gameId} signedIn={data.signedIn} />
              </div>
              <SteamReviews
                gameId={data.gameId}
                signedIn={data.signedIn}
                initialReviews={data.reviews}
                initialAgg={data.agg}
              />
              <SteamGuides gameId={data.gameId} guides={data.guides} signedIn={data.signedIn} />
              {data.aiEnabled ? (
                <div className="stm-legacy">
                  <HowToPlay gameId={data.gameId} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <aside className="stm-hub-side">
          <section className="stm-card" aria-labelledby="stm-about-h">
            <h2 id="stm-about-h" className="stm-card-head">
              {t('steam-about', { defaultValue: 'About' })}
            </h2>
            <p className="stm-about">{data.description}</p>
            <ul className="stm-tags" aria-label={t('steam-tags', { defaultValue: 'Tags' })}>
              {data.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          </section>
          {offSite ? null : <SteamFriends friends={extras.friends} signedIn={data.signedIn} kind={data.kind} />}
          <SteamCommunity communities={extras.communities} topPlayers={offSite ? [] : extras.topPlayers} />
        </aside>
      </div>
    </article>
  );
}
