/**
 * One reader for "this user, in this app" (C9). Server-only.
 *
 * `RMHboxProfile`, `RmhTypeProfile`, `RmhStudyProfile`, `RmhTubeUserStats`,
 * `EloRating` and `DoctrineReputation` all answer the same question in six
 * shapes and six tables. Any surface that wants a cross-app stat strip — the
 * public profile, a hover card, the developer API — has to know all six, and in
 * practice each one re-derived its own idea of what a viewer is allowed to see.
 *
 * This module merges the READER, exactly as `lib/game/adapters.server.ts` does
 * for scores. **It does not merge the tables**: they were added independently,
 * they have no shape in common (`bestWpm` vs `totalFocusTimeMs` vs `rating`),
 * and rewriting them would be a large migration for no user benefit. Instead
 * each declares how to read itself into one card.
 *
 * Two properties are the point:
 *
 *  1. **Adding an app to a profile page is one reader.** Not a query, a shape,
 *     a formatter and a privacy rule per surface.
 *  2. **The privacy check lives IN the reader.** `visible(viewerId, ownerId)`
 *     travels with the card, and {@link appProfiles} applies it before
 *     returning — so a new surface cannot forget the rule, and changing the
 *     rule changes it everywhere at once. Two of the six are owner-only today
 *     (see the notes on each) and nothing outside this file needs to know
 *     which.
 *
 * ## Strings
 *
 * Cards carry translation KEYS, never rendered English. A server module has no
 * `t()` and no request locale — resolving text here would ship one language to
 * all sixteen. Every label is `{ key, defaultValue, vars }`, which is exactly
 * what `t(key, { defaultValue, ...vars })` takes at the call site, in the
 * existing `c-profile-modules` namespace.
 */

import { prisma } from '@/lib/prisma.server';
import { getRank } from '@/lib/doctrine/reputation';

/* -------------------------------------------------------------------------- */
/* The card                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A string the CALLER translates.
 *
 * `vars` are interpolation values only — never a second translatable string, so
 * a locale is never assembled out of fragments in an order English happens to
 * like.
 */
export interface AppProfileText {
  /** Key inside the `c-profile-modules` namespace. */
  key: string;
  /** English source, passed straight to `t()`'s `defaultValue`. */
  defaultValue: string;
  vars?: Record<string, string | number>;
}

export interface AppProfileStat {
  /** Key inside the `c-profile-modules` namespace. */
  labelKey: string;
  /** English source for `labelKey`, so the caller can pass a `defaultValue`. */
  labelDefault: string;
  /**
   * Already reduced to a number or a short token. Formatting a number for a
   * locale is the renderer's job (`Intl.NumberFormat`), not this module's.
   */
  value: string | number;
}

export interface AppProfileCard {
  /** Catalog id (`lib/apps.ts` / `lib/games.ts`), for icons and grouping. */
  appId: string;
  /** The one number worth reading at a glance. */
  headline: AppProfileText;
  stats: AppProfileStat[];
  /** Where "see more" goes. */
  href: string;
  /**
   * Whether `viewerId` may see this card on `ownerId`'s profile.
   *
   * Declared per reader and applied by {@link appProfiles}. It is a pure
   * predicate on purpose: a rule that needs a query is a rule that gets skipped
   * on the surface that could not afford one.
   */
  visible: (viewerId: string | null, ownerId: string) => boolean;
}

/**
 * The default rule: this app's numbers already appear on a public leaderboard,
 * so hiding them on the owner's own profile would protect nothing.
 */
const PUBLIC = (): boolean => true;

/**
 * Owner-only. For apps whose counters describe BEHAVIOUR rather than
 * achievement — how much you watched, how many messages you sent, which side
 * you took — and which no public surface has ever shown.
 */
const OWNER_ONLY = (viewerId: string | null, ownerId: string): boolean =>
  viewerId !== null && viewerId === ownerId;

/* -------------------------------------------------------------------------- */
/* Readers                                                                    */
/* -------------------------------------------------------------------------- */

type Reader = (userId: string) => Promise<AppProfileCard | null>;

/**
 * Every reader returns `null` — never throws, never a zeroed card — when the
 * user has no row. "Has never opened RMHType" and "typed 0 WPM" are different
 * facts, and a strip of empty cards is worse than a short strip.
 */

const readRmhBox: Reader = async (userId) => {
  const row = await prisma.rMHboxProfile.findUnique({
    where: { userId },
    select: {
      totalGamesPlayed: true,
      totalWins: true,
      totalScore: true,
      bestWinStreak: true,
    },
  });
  if (!row) return null;
  return {
    appId: 'rmhbox',
    headline: {
      key: 'app-profile.rmhbox.headline',
      defaultValue: '{{wins}} wins',
      vars: { wins: row.totalWins },
    },
    stats: [
      {
        labelKey: 'app-profile.games-played',
        labelDefault: 'Games played',
        value: row.totalGamesPlayed,
      },
      { labelKey: 'app-profile.total-score', labelDefault: 'Total score', value: row.totalScore },
      { labelKey: 'app-profile.best-streak', labelDefault: 'Best streak', value: row.bestWinStreak },
    ],
    href: '/rmhbox',
    visible: PUBLIC,
  };
};

const readRmhType: Reader = async (userId) => {
  // One row PER DIFFICULTY (`@@unique([userId, difficulty])`). A profile card
  // shows the player's best, so the rows are folded rather than picking one
  // difficulty and calling it the answer.
  const rows = await prisma.rmhTypeProfile.findMany({
    where: { userId },
    select: {
      bestWpm: true,
      bestAccuracy: true,
      totalGamesPlayed: true,
      totalWins: true,
    },
  });
  if (rows.length === 0) return null;

  const bestWpm = Math.max(...rows.map((r) => r.bestWpm));
  const bestAccuracy = Math.max(...rows.map((r) => r.bestAccuracy));
  const played = rows.reduce((sum, r) => sum + r.totalGamesPlayed, 0);
  const wins = rows.reduce((sum, r) => sum + r.totalWins, 0);

  return {
    appId: 'rmhtype',
    headline: {
      key: 'app-profile.rmhtype.headline',
      defaultValue: '{{wpm}} WPM',
      vars: { wpm: Math.round(bestWpm) },
    },
    stats: [
      {
        labelKey: 'app-profile.best-accuracy',
        labelDefault: 'Best accuracy',
        // Whole percent: the stored float carries more precision than a
        // profile card can honestly claim.
        value: `${Math.round(bestAccuracy)}%`,
      },
      { labelKey: 'app-profile.races', labelDefault: 'Races', value: played },
      { labelKey: 'app-profile.wins', labelDefault: 'Wins', value: wins },
    ],
    href: '/rmhtype',
    visible: PUBLIC,
  };
};

const readRmhStudy: Reader = async (userId) => {
  const row = await prisma.rmhStudyProfile.findUnique({
    where: { userId },
    select: {
      totalFocusTimeMs: true,
      sessionsCompleted: true,
      currentStreak: true,
      longestStreak: true,
    },
  });
  if (!row) return null;
  // `totalFocusTimeMs` is a BigInt column. `Number` is exact well past any
  // plausible lifetime of focus time (2^53 ms is ~285,000 years), and a BigInt
  // would not survive `JSON.stringify` on the way to a client.
  const hours = Math.floor(Number(row.totalFocusTimeMs) / 3_600_000);
  return {
    appId: 'rmhstudy',
    headline: {
      key: 'app-profile.rmhstudy.headline',
      defaultValue: '{{hours}}h focused',
      vars: { hours },
    },
    stats: [
      { labelKey: 'app-profile.sessions', labelDefault: 'Sessions', value: row.sessionsCompleted },
      {
        labelKey: 'app-profile.current-streak',
        labelDefault: 'Current streak',
        value: row.currentStreak,
      },
      {
        labelKey: 'app-profile.longest-streak',
        labelDefault: 'Longest streak',
        value: row.longestStreak,
      },
    ],
    href: '/rmhstudy',
    visible: PUBLIC,
  };
};

const readRmhTube: Reader = async (userId) => {
  const row = await prisma.rmhTubeUserStats.findUnique({
    where: { userId },
    select: {
      totalWatchTimeMinutes: true,
      videosWatched: true,
      roomsCreated: true,
      roomsJoined: true,
    },
  });
  if (!row) return null;
  return {
    appId: 'rmhtube',
    headline: {
      key: 'app-profile.rmhtube.headline',
      defaultValue: '{{hours}}h watched',
      vars: { hours: Math.floor(row.totalWatchTimeMinutes / 60) },
    },
    stats: [
      {
        labelKey: 'app-profile.videos-watched',
        labelDefault: 'Videos watched',
        value: row.videosWatched,
      },
      { labelKey: 'app-profile.rooms-hosted', labelDefault: 'Rooms hosted', value: row.roomsCreated },
      { labelKey: 'app-profile.rooms-joined', labelDefault: 'Rooms joined', value: row.roomsJoined },
    ],
    href: '/rmhtube',
    // Watch history is the single most identifying thing a media app holds, and
    // no surface has ever published these counters. Owner-only until there is a
    // setting that says otherwise.
    visible: OWNER_ONLY,
  };
};

const readElo: Reader = async (userId) => {
  // One row per ranked game. The card shows the strongest rating, because that
  // is the number a player would quote about themselves.
  const rows = await prisma.eloRating.findMany({
    where: { userId },
    orderBy: { rating: 'desc' },
    take: 1,
    select: { game: true, rating: true, wins: true, losses: true, draws: true },
  });
  const top = rows[0];
  if (!top) return null;
  return {
    appId: 'ranked',
    headline: {
      key: 'app-profile.ranked.headline',
      defaultValue: 'Elo {{rating}}',
      vars: { rating: top.rating },
    },
    stats: [
      // The game id is a catalog key, not prose — it is interpolated, not
      // translated, so a renamed game never needs sixteen locale edits.
      { labelKey: 'app-profile.best-game', labelDefault: 'Best game', value: top.game },
      { labelKey: 'app-profile.wins', labelDefault: 'Wins', value: top.wins },
      { labelKey: 'app-profile.losses', labelDefault: 'Losses', value: top.losses },
      { labelKey: 'app-profile.draws', labelDefault: 'Draws', value: top.draws },
    ],
    href: '/ranked',
    visible: PUBLIC,
  };
};

const readDoctrine: Reader = async (userId) => {
  const row = await prisma.doctrineReputation.findUnique({
    where: { userId },
    select: { totalXp: true, currentStreak: true, longestStreak: true, sahurCount: true },
  });
  if (!row) return null;
  // Rank comes from `lib/doctrine/reputation.ts` rather than a second XP ladder
  // here — two ladders drift, and the badge on the profile would then disagree
  // with the badge inside the app.
  const rank = getRank(row.totalXp);
  return {
    appId: 'rmh-strategies',
    headline: {
      key: 'app-profile.doctrine.headline',
      defaultValue: '{{rank}}',
      vars: { rank: rank.name },
    },
    stats: [
      { labelKey: 'app-profile.xp', labelDefault: 'XP', value: row.totalXp },
      {
        labelKey: 'app-profile.current-streak',
        labelDefault: 'Current streak',
        value: row.currentStreak,
      },
      {
        labelKey: 'app-profile.longest-streak',
        labelDefault: 'Longest streak',
        value: row.longestStreak,
      },
    ],
    href: '/strategies/profile/reputation',
    // Doctrine standing is in-fiction and faction-shaped: it says which side a
    // member took and how hard. Publishing it on an open profile changes what
    // the app is. Owner-only until the app itself has a public standing page.
    visible: OWNER_ONLY,
  };
};

/**
 * The registry. Adding an app to every profile surface is one entry here.
 *
 * Keyed by catalog id so a caller can ask for one app without knowing which
 * table backs it.
 */
const READERS: Record<string, Reader> = {
  rmhbox: readRmhBox,
  rmhtype: readRmhType,
  rmhstudy: readRmhStudy,
  rmhtube: readRmhTube,
  ranked: readElo,
  'rmh-strategies': readDoctrine,
};

/** Every app id this module can read. Exported for the coverage test. */
export function appProfileIds(): string[] {
  return Object.keys(READERS);
}

/* -------------------------------------------------------------------------- */
/* The accessor                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every app card `viewerId` may see on `ownerId`'s profile.
 *
 * `allSettled`, not `all`: one app's table being unavailable must cost that one
 * card, not the whole strip. A profile that renders five of six is a profile; a
 * profile that 500s because RMHTube's stats table is locked is an outage.
 *
 * Cards come back in `READERS` declaration order so the strip does not reshuffle
 * between requests as query latencies vary.
 */
export async function appProfiles(
  ownerId: string,
  viewerId: string | null = null,
): Promise<AppProfileCard[]> {
  const entries = Object.entries(READERS);
  const settled = await Promise.allSettled(entries.map(([, read]) => read(ownerId)));

  const cards: AppProfileCard[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`[app-profiles] ${entries[i][0]} reader failed:`, result.reason);
      return;
    }
    const card = result.value;
    if (card && card.visible(viewerId, ownerId)) cards.push(card);
  });
  return cards;
}

/**
 * One app's card, or `null`.
 *
 * Same privacy rule as {@link appProfiles} — an unknown id and a card the
 * viewer may not see are both `null`, so a caller cannot probe for which apps a
 * member uses by watching the two answers differ.
 */
export async function appProfile(
  appId: string,
  ownerId: string,
  viewerId: string | null = null,
): Promise<AppProfileCard | null> {
  // `Object.hasOwn` rather than a bare index: `appId` comes off a URL, and
  // `READERS['constructor']` is a truthy function that throws when called.
  if (!Object.hasOwn(READERS, appId)) return null;
  const card = await READERS[appId](ownerId);
  if (!card || !card.visible(viewerId, ownerId)) return null;
  return card;
}
