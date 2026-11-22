/** Client-safe shapes of everything the library's detail pane shows beyond the hub. */

import type { AchievementTier } from '@/lib/achievements/catalog';
import type { PlayerView, PlaytimeActivity } from '@/lib/playtime/types';
import type { TitleCards } from '@/lib/cards/types';

export type DetailAchievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  target: number;
  progress: number;
  unlocked: boolean;
};

export type DetailCommunity = {
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  memberCount: number;
};

export type LibraryExtras = {
  /** The viewer's own time on this title; null when signed out. */
  activity: PlaytimeActivity | null;
  achievements: DetailAchievement[];
  friends: PlayerView[];
  topPlayers: PlayerView[];
  communities: DetailCommunity[];
  /** The viewer's trading cards for this title; null when signed out or untracked. */
  cards: TitleCards | null;
};
