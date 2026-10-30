/** Client-safe shapes for the per-game Community Hub. */

import type { GuideSummary, ReviewView } from '@/lib/games/reviews';
import type { DetailCommunity } from '@/lib/games/detail-types';
import type { PersonRef } from '@/lib/games/community-types';
import type { PlayerView } from '@/lib/playtime/types';

export type ThreadSummary = {
  id: string;
  title: string;
  snippet: string;
  author: PersonRef;
  createdAt: string;
  lastPostAt: string;
  replyCount: number;
  locked: boolean;
  pinned: boolean;
};

export type HubData = {
  gameId: string;
  title: string;
  hue: number;
  image: string | null;
  playHref: string;
  signedIn: boolean;
  isAdmin: boolean;
  threads: ThreadSummary[];
  hasMore: boolean;
  page: number;
  friends: PlayerView[];
  topPlayers: PlayerView[];
  communities: DetailCommunity[];
  guides: GuideSummary[];
  reviews: ReviewView[];
  /** Cards for this title listed on the market by other members. */
  cardsOnSale: number;
};

export type ThreadPostView = {
  id: string;
  body: string;
  createdAt: string;
  author: PersonRef;
  canDelete: boolean;
};

export type ThreadPage = {
  gameId: string;
  gameTitle: string;
  thread: {
    id: string;
    title: string;
    body: string;
    createdAt: string;
    locked: boolean;
    pinned: boolean;
    author: PersonRef;
    canDelete: boolean;
  };
  posts: ThreadPostView[];
  signedIn: boolean;
  isAdmin: boolean;
};
