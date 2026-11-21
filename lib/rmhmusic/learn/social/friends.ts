/**
 * Friends' progress (RMH Music Phase 6, plan 1.5) — pure, client-safe. `friends.server.ts` reads
 * the rows and applies the access rules; what a friend's progress IS lives here.
 *
 * - **Streak:** the Daily challenge streak (`dailyStreak` over scored dates), the only streak RMH
 *   Music owns (owner decision Q1). The flame on the home is the site-wide streak and is never
 *   shown to friends.
 * - **Finished units:** a unit is finished when every available lesson of it has at least one
 *   star, counted on the friend's own path (`pathFor` their instrument). A unit with no available
 *   lesson is not counted at all.
 * - **Song bests:** per song per mode, in the songbook's order, only songs the songbook has.
 * - **Order:** today's Daily done first, then the longer streak, then the name.
 */
import type { Unit } from '../content/path';
import { songById, SONGS } from '../songs/catalog';
import { isSongMode, type SongMode } from '../songs/scoring';
import { dailyStreak } from '../sprint/record';

/** The two list sizes: the home's end-of-page section, and the Friends page. */
export const FRIENDS_LIMITS = [3, 100] as const;
export type FriendsLimit = (typeof FRIENDS_LIMITS)[number];

/** How many scored dates a friend's streak reads back (as the learner's own does). */
export const STREAK_LOOKBACK_DAYS = 400;

export interface UnitsDone {
  finished: number;
  total: number;
  /** The title of the last finished unit in path order, or null. */
  last: string | null;
}

export function finishedUnits(path: readonly Unit[], starred: ReadonlySet<string>): UnitsDone {
  let finished = 0;
  let total = 0;
  let last: string | null = null;
  for (const unit of path) {
    const lessons = unit.lessons.filter((l) => l.available);
    if (lessons.length === 0) continue;
    total++;
    if (lessons.every((l) => starred.has(l.id))) {
      finished++;
      last = unit.title;
    }
  }
  return {
    finished,
    total,
    last,
  };
}

export interface FriendDaily {
  /** Days in a row with a scored Daily challenge (alive through today while yesterday was played). */
  streak: number;
  /** Today's Daily challenge is done. */
  today: boolean;
}

export function friendDaily(scoredDates: readonly string[], today: string): FriendDaily {
  return {
    streak: dailyStreak(scoredDates, today),
    today: scoredDates.includes(today),
  };
}

/** What the list is ordered by (the id only breaks ties; it never leaves the server). */
export interface FriendSortKey {
  name: string | null;
  streak: number;
  today: boolean;
  userId: string;
}

export function compareFriends(a: FriendSortKey, b: FriendSortKey): number {
  if (a.today !== b.today) return a.today ? -1 : 1;
  if (a.streak !== b.streak) return b.streak - a.streak;
  if (a.name !== b.name) {
    if (a.name === null) return 1;
    if (b.name === null) return -1;
    const byName = a.name.localeCompare(b.name, 'en');
    if (byName !== 0) return byName;
  }
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

export interface FriendSong {
  songId: string;
  /** The songbook's title and composer: proper names, shown as written. */
  title: string;
  composer: string;
  mode: SongMode;
  bestScore: number;
}

const SONG_ORDER = new Map(SONGS.map((s, i) => [s.id, i]));
const MODE_ORDER: Record<SongMode, number> = {
  wait: 0,
  play: 1,
};

/** A friend's song bests: songbook songs only, in its order, Wait before Play. */
export function friendSongs(
  rows: readonly {
    songId: string;
    mode: string;
    bestScore: number;
  }[],
): FriendSong[] {
  const out: FriendSong[] = [];
  for (const r of rows) {
    const song = songById(r.songId);
    if (!song || !isSongMode(r.mode)) continue;
    out.push({
      songId: song.id,
      title: song.title,
      composer: song.composer,
      mode: r.mode,
      bestScore: r.bestScore,
    });
  }
  return out.sort(
    (a, b) =>
      (SONG_ORDER.get(a.songId) ?? 0) - (SONG_ORDER.get(b.songId) ?? 0) || MODE_ORDER[a.mode] - MODE_ORDER[b.mode],
  );
}
