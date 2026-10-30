/** Client-safe shapes for the Steam-style community pages (home, profile, group). */

import type { AchievementTier } from '@/lib/achievements/catalog';

/** A title as the community pages show it: enough for card art and a link. */
export type TitleRef = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  hue: number;
};

export type PersonRef = {
  userId: string;
  handle: string | null;
  name: string;
  image: string | null;
};

export type GroupRef = {
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  memberCount: number;
};

export type ProfileGame = TitleRef & {
  totalSeconds: number;
  last2WeeksSeconds: number;
  lastPlayedAt: string;
};

export type ProfileAchievement = {
  id: string;
  name: string;
  description: string;
  tier: AchievementTier;
  target: number;
  unlockedAt: string;
};

export type SteamProfile = {
  id: string;
  handle: string | null;
  name: string;
  image: string | null;
  bio: string | null;
  location: string | null;
  pronouns: string | null;
  joinedAt: string;
  isOnline: boolean;
  isVerified: boolean;
  isOwnProfile: boolean;
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
  level: number;
  /** 0..1 toward the next level. */
  levelProgress: number;
  achievementsUnlocked: number;
  achievementsTotal: number;
  recentAchievements: ProfileAchievement[];
  /**
   * Games the viewer may see. `null` when the owner's playtime setting hides
   * it from this viewer (the page says so rather than showing zero).
   */
  games: {
    played: number;
    totalSeconds: number;
    last2WeeksSeconds: number;
    recent: ProfileGame[];
  } | null;
  friends: PersonRef[];
  groups: GroupRef[];
  reviewCount: number;
};

export type TrendingTitle = TitleRef & { players: number; seconds: number };

export type RecentReview = {
  id: string;
  gameId: string;
  gameTitle: string;
  stars: number;
  body: string | null;
  createdAt: string;
  author: PersonRef;
};

export type CommunityHomeData = {
  signedIn: boolean;
  groups: GroupRef[];
  trending: TrendingTitle[];
  reviews: RecentReview[];
  /** The viewer's own groups, newest first. */
  myGroups: GroupRef[];
};

export type GroupMember = PersonRef & { role: string };

export type SteamGroup = GroupRef & {
  description: string | null;
  createdAt: string;
  joined: boolean;
  role: string | null;
  signedIn: boolean;
  game: TitleRef | null;
  members: GroupMember[];
};
