/**
 * Reports of the games library's member text (sprint 14, feature 08), client-safe half.
 *
 * Five kinds of member text have a report path: a review (`game-review`, the `GameReview` id), a guide
 * (`game-guide`, a published `GameGuide`), a discussion (`game-thread`), a reply (`game-thread-post`) and an
 * achievement tip (`achievement-tip`). A review, a guide and a tip carry `moderatedAt`: a moderator's takedown stamps
 * it, every reader shows only rows where it is null to other members, and the author, who still sees the row, can
 * neither edit nor delete it. A thread or a reply has no stamp: the takedown deletes it, as the hub's own admin
 * delete does.
 */

export const GAME_REPORT_TYPES = [
  'game-review',
  'game-guide',
  'game-thread',
  'game-thread-post',
  'achievement-tip',
] as const;
export type GameReportType = (typeof GAME_REPORT_TYPES)[number];

/** The types a takedown stamps (`moderatedAt`) rather than deletes. */
export const GAME_STAMPED_TYPES = ['game-review', 'game-guide', 'achievement-tip'] as const;

export function isGameReportType(type: string): type is GameReportType {
  return (GAME_REPORT_TYPES as readonly string[]).includes(type);
}

/** The `GameMetaError` message for a write to an item a moderator removed (the route answers `GAME_CONTENT_REMOVED_BY_MODERATOR`). */
export const GAME_CONTENT_REMOVED = 'REMOVED_BY_MODERATOR';

/** Characters of an item's text a moderator reads in the queue. */
export const GAME_REPORT_PREVIEW_CHARS = 280;

/**
 * Every server file that reads `gameReview`, `gameGuide` or `achievementTip` to show a row to someone else. Each one
 * must filter `moderatedAt: null` (a member's own removed row is the one exception, written as an `OR` that still
 * names it). `lib/games/__tests__/game-content-read-paths.test.ts` scans the repository for every file that touches
 * one of the three and fails a file that is in neither this list nor `GAME_CONTENT_EXEMPT_PATHS`, and a listed file
 * that does not filter.
 */
export const GAME_CONTENT_READ_PATHS = [
  'lib/arcade/api/arcade.tips.server.ts',
  'lib/arcade/updates.server.ts',
  'lib/awards/awards.server.ts',
  'lib/games/activity.server.ts',
  'lib/games/meta.server.ts',
  'lib/games/moderation.server.ts',
  'lib/games/profile.server.ts',
  'lib/sitemap.server.ts',
] as const satisfies readonly string[];

/**
 * Files that touch the tables without showing a row to anyone but its author or an admin, each with its real reason.
 * An entry is a statement that the file cannot show a removed row to the public.
 */
export const GAME_CONTENT_EXEMPT_PATHS: Readonly<Record<string, string>> = {
  'lib/moderation/restriction-paths.ts':
    'A list of the names of the tables a timeout covers (s14-17), so a source scan can find their writers; it holds no query and reads no row.',
  'lib/games/guide-history.server.ts':
    'Reads a guide for its author or an admin only (a stranger gets "not found"), and every write it makes goes through updateGuide, which refuses a removed guide; the account export reads the member\'s own guides.',
};

/**
 * Read calls in a listed file that deliberately do not filter `moderatedAt`, with how many there are and why. The
 * scan holds the count exactly, so a second unfiltered read in the same file fails.
 */
export const GAME_CONTENT_UNFILTERED_READS: Readonly<Record<string, { calls: number; reason: string }>> = {
  'lib/arcade/api/arcade.tips.server.ts': {
    calls: 1,
    reason:
      "The three-tips cap counts the member's own tips, removed ones included, so a removal does not free a slot for more of the same text; it returns a number to the author only and shows no row.",
  },
  'lib/games/moderation.server.ts': {
    calls: 4,
    reason:
      "The moderator's queue previews read a reported review, guide or tip whatever its state (admin only, the removed ones are what a moderator reads), and one read takes a removed review's game id to drop its cached rating; nothing here is shown to a player.",
  },
};
