/** Client-safe shapes for "playing now" and the friend activity feed. */

import type { PersonRef } from '@/lib/games/community-types';

export type NowPlaying = { gameId: string; title: string };

export type ActivityEvent = {
  id: string;
  kind: 'played' | 'achievement' | 'badge' | 'review' | 'thread';
  at: string;
  user: PersonRef;
  gameId: string;
  gameTitle: string;
  /** What exactly: an achievement name, a badge level, stars, a thread title, seconds played. */
  detail: string | number | null;
  /** Where the entry goes (a thread or the game). */
  threadId?: string;
};

export type FriendActivity = {
  inGame: { user: PersonRef; game: NowPlaying }[];
  events: ActivityEvent[];
};
