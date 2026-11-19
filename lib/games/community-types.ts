/** Client-safe shapes for the Steam-style profile and the people and groups it lists. */

import type { AchievementTier } from '@/lib/achievements/catalog';
import type { NowPlaying } from '@/lib/games/activity-types';

/** A title as the community pages show it: enough for card art and a link. */
export type TitleRef =
  {
    id: string;
    title: string;
    thumbnailUrl:
      | string
      | null;
    hue: number;
  };

export type PersonRef =
  {
    userId: string;
    handle:
      | string
      | null;
    name: string;
    image:
      | string
      | null;
  };

export type GroupRef =
  {
    slug: string;
    name: string;
    icon:
      | string
      | null;
    color:
      | string
      | null;
    memberCount: number;
  };

export type ProfileGame =
  TitleRef & {
    totalSeconds: number;
    last2WeeksSeconds: number;
    lastPlayedAt: string;
  };

export type ProfileAchievement =
  {
    id: string;
    name: string;
    description: string;
    tier: AchievementTier;
    target: number;
    unlockedAt: string;
  };

export type ProfileBadge =
  TitleRef & {
    level: number;
    foil: boolean;
  };

/** What the owner of a profile can pick from when choosing their showcase. */
export type ShowcaseEditorData =
  {
    selected: {
      achievements: string[];
      badges: string[];
    };
    achievements: ProfileAchievement[];
    badges: (ProfileBadge & {
      key: string;
    })[];
  };

export type ProfileLook =
  {
    background: {
      gameId: string;
      title: string;
      hue: number;
      foil: boolean;
    } | null;
    frame: {
      gameId: string;
      title: string;
      hue: number;
      level:
        | 3
        | 5;
    } | null;
  };

/** Only on your own profile: what your badges unlock, and what you have chosen. */
export type LookEditorData =
  {
    selected: {
      background:
        | string
        | null;
      frame:
        | string
        | null;
    };
    backgrounds: {
      key: string;
      title: string;
      hue: number;
      foil: boolean;
    }[];
    frames: {
      key: string;
      title: string;
      hue: number;
      level:
        | 3
        | 5;
    }[];
  };

export type SteamProfile =
  {
    id: string;
    handle:
      | string
      | null;
    name: string;
    image:
      | string
      | null;
    bio:
      | string
      | null;
    location:
      | string
      | null;
    pronouns:
      | string
      | null;
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
    badges: ProfileBadge[];
    reviewCount: number;
    /** The title they have open this minute, if their setting lets this viewer see it. */
    nowPlaying: NowPlaying | null;
    /** Only on your own profile: everything you could feature, and what you have chosen. */
    showcaseEditor: ShowcaseEditorData | null;
    look: ProfileLook;
    lookEditor: LookEditorData | null;
  };
