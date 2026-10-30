'use client';

import { GameHub } from '@/components/games/GameHub';
import type { LibraryExtras } from '@/lib/games/detail-types';
import { heroSource } from '@/lib/games/library';
import type { GuideSummary, RatingAgg, ReviewView } from '@/lib/games/reviews';
import type { TrickView } from '@/lib/trick-week/trick-week';
import { AchievementsSection } from './AchievementsSection';
import { ActivityStrip } from './ActivityStrip';
import { CommunitySection } from './CommunitySection';
import { DetailHero } from './DetailHero';
import { FriendsWhoPlay } from './FriendsWhoPlay';

export type GameDetailData = {
  gameId: string;
  kind: 'game' | 'app';
  title: string;
  cta: string;
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
 * The right-hand pane for one title, laid out like Steam's game page: hero and
 * Play, your activity, achievements, friends who play, community — then, for
 * games, the hub's reviews, guides and leaderboard. Apps have no reviews or
 * guides, so their page ends with the community.
 */
export function GameDetail({ data }: { data: GameDetailData }) {
  const { extras } = data;
  const hero = heroSource({
    thumbnailUrl: data.image,
    bannerUrl: data.bannerUrl,
    hue: data.hue,
  });
  const isGame = data.kind === 'game';

  return (
    <div className="min-w-0 space-y-6">
      <DetailHero
        title={data.title}
        hero={hero}
        playHref={data.playHref}
        cta={data.cta}
        tags={data.tags}
      />
      <ActivityStrip
        kind={data.kind}
        activity={extras.activity}
        achievementsDone={extras.achievements.filter((a) => a.unlocked).length}
        achievementsTotal={data.signedIn ? extras.achievements.length : 0}
        agg={data.agg}
        signedIn={data.signedIn}
        showRating={isGame}
      />
      <AchievementsSection items={extras.achievements} signedIn={data.signedIn} />
      <FriendsWhoPlay friends={extras.friends} signedIn={data.signedIn} kind={data.kind} />
      <CommunitySection communities={extras.communities} topPlayers={extras.topPlayers} />
      {isGame ? <GameHub embedded data={data} /> : null}
    </div>
  );
}
