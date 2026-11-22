/**
 * "Turn off reposts from X" (sprint 05 #07): the constants and pure helpers the server, the post menu and the settings
 * list share. Client-safe: no Prisma, no zod.
 */
import type { FeedItem } from '@/lib/feed-types';

/** At most this many people can have their reposts turned off by one member. */
export const REPOST_MUTE_LIMIT = 1000;

/** Rows per page of the "Reposts turned off" list. */
export const REPOST_MUTE_PAGE_SIZE = 50;

/** Settings shows a search box once the list is longer than this. */
export const REPOST_MUTE_SEARCH_THRESHOLD = 20;

/** Longest search text the list endpoint accepts. */
export const REPOST_MUTE_SEARCH_MAX = 80;

/** One person in the "Reposts turned off" list. An `unavailable` person (one who blocked the viewer) carries no profile. */
export interface RepostMuteRow {
  /** The person whose reposts are off. */
  userId: string;
  name: string | null;
  image: string | null;
  handle: string | null;
  unavailable: boolean;
  /** When the member turned their reposts off (ISO). */
  since: string;
}

export interface RepostMutePage {
  rows: RepostMuteRow[];
  nextCursor: string | null;
  /** How many people the member has turned off, search aside. */
  total: number;
  /** For a request that named a `target`: whether that person's reposts are off. Otherwise null. */
  targetOff: boolean | null;
}

/**
 * Whose reposts the overflow menu acts on for this card: the reposter on a repost, the author on any other post.
 * Null for the viewer's own card and when the card has no one to name.
 */
export function repostMuteTarget(
  item: Pick<FeedItem, 'user' | 'repostedBy'>,
  viewerId: string | null | undefined,
): {
  id: string;
  name: string;
} | null {
  const who = item.repostedBy ?? item.user;
  if (!who?.id || who.id === viewerId) return null;
  return {
    id: who.id,
    name: who.name || who.handle || who.username || '',
  };
}

/** The list with every repost by `userId` taken out; their own posts, quotes and other people's reposts stay. */
export function withoutRepostsBy<T extends Pick<FeedItem, 'repostedBy'>>(items: readonly T[], userId: string): T[] {
  return items.filter((item) => item.repostedBy?.id !== userId);
}
