/**
 * Leaderboard privacy — the pure half (sprint 05 #01).
 *
 * Who is left off a public game board is decided in `leaderboard-privacy.server.ts` (a member who
 * turned the switch off, and a member who is banned right now). What is done with that set is
 * here, with no database in it: the over-read that makes room for the hidden rows, the re-rank over
 * what remains, and the where-fragments the boards that filter in the query use.
 *
 * Rows with `userId: null` are legacy anonymous scores: they belong to no member, so nobody has
 * hidden them, and they stay listed.
 */

/** Most ids the hidden set holds. A board filters on at most this many. */
export const HIDDEN_ID_CAP = 5_000;

/** Most extra rows a board reads to make room for hidden ones. */
export const OVERFETCH_CAP = 200;

/** A board row that belongs to a member, or to nobody (a legacy anonymous score). */
export interface OwnedRow {
  userId: string | null;
}

/**
 * How many rows to read so `limit` survive after the hidden ones are dropped:
 * `limit + hidden`, never more than `limit + OVERFETCH_CAP`.
 */
export function fetchSize(limit: number, hiddenCount: number): number {
  return limit + Math.min(Math.max(hiddenCount, 0), OVERFETCH_CAP);
}

/**
 * Drop the hidden members from an ordered board and rank what is left from 1, with no gaps. Keeps
 * at most `take` rows. Rows with a null `userId` stay.
 */
export function excludeHidden<T extends OwnedRow>(
  rows: readonly T[],
  hidden: ReadonlySet<string>,
  take: number,
): Array<T & { rank: number }> {
  const kept: Array<T & { rank: number }> = [];
  for (const row of rows) {
    if (kept.length >= take) break;
    if (row.userId !== null && hidden.has(row.userId)) continue;
    kept.push({ ...row, rank: kept.length + 1 });
  }
  return kept;
}

/** Where-fragment for a table whose `userId` may be null: everything except the hidden members. */
export function notHiddenWhere(hidden: ReadonlySet<string>): {
  OR?: Array<{ userId: null } | { userId: { notIn: string[] } }>;
} {
  if (hidden.size === 0) return {};
  return { OR: [{ userId: null }, { userId: { notIn: [...hidden] } }] };
}

/** Where-fragment for a table whose `userId` is required: everything except the hidden members. */
export function userNotHiddenWhere(hidden: ReadonlySet<string>): {
  userId?: { notIn: string[] };
} {
  if (hidden.size === 0) return {};
  return { userId: { notIn: [...hidden] } };
}

/**
 * Every source file that returns a ranked list of members to somebody other than the member. Each one must call
 * `leaderboardHiddenUserIds()` (`leaderboard-privacy.server.ts`, the 60 s cached set) and leave those members out
 * before the list is cut, so the next member moves up; a board that shows "your position" keeps the viewer's own.
 * A path in this list that stops calling the helper fails `lib/game/__tests__/board-privacy-paths.test.ts`, and so
 * does any other file that looks like a board and is in neither this list nor {@link BOARD_PRIVACY_EXEMPT}, so a new
 * board is added on purpose.
 */
export const BOARD_PRIVACY_READ_PATHS = [
  // The unified boards, their scopes and the per-game routes (sprint 05 #01).
  'lib/game/adapters.server.ts',
  'lib/game/generic-adapter.server.ts',
  'lib/game/leaderboard-scope.server.ts',
  'lib/game/api/void-breaker.leaderboard.server.ts',
  'lib/game/api/vega.leaderboard.server.ts',
  'lib/neon-driftway/api/neon-driftway.leaderboard.server.ts',
  'features/signal-forge/api/signal-forge.leaderboard.server.ts',
  'features/laundry-sort/api/laundry-sort.leaderboard.server.ts',
  'features/gabriels-horn/api/gabriels-horn.leaderboard.server.ts',
  'features/synapse-storm/api/games.synapse-storm.leaderboard.server.ts',
  'features/cursed-logic/api/score-adapter.server.ts',
  'features/altair/api/altair.leaderboard.server.ts',
  'features/dream-rift/api/dream-rift.leaderboard.server.ts',
  'features/slice-it/api/slice-it.leaderboard.server.ts',
  'features/slice-it/engine/hub.server.ts',
  'app/routes/api/v1/slice-it/leaderboard.ts',
  'lib/leaderboard.server.ts',
  // Every other board (sprint 09 #07).
  'lib/daily-puzzles/api/daily-puzzles.leaderboard.server.ts',
  'lib/rmhtype/daily.server.ts',
  'lib/ranked/season.server.ts',
  'lib/ranked/api/ranked.$game.leaderboard.server.ts',
  'lib/speedrun/speedrun.server.ts',
  'features/doctrine/api/doctrine.puzzles.leaderboard.server.ts',
  'features/doctrine/api/doctrine.reputation.leaderboard.server.ts',
  'lib/competitive/pickem.server.ts',
  'lib/forecasting/forecasting.server.ts',
  'lib/discovery/api/tips.leaderboard.server.ts',
  'lib/communities/contributors.server.ts',
  'lib/trick-week/api/nightrail.tricks.server.ts',
  'lib/trick-week/trick-week.server.ts',
  'lib/delight/hunt.server.ts',
  'lib/replays.server.ts',
  'lib/arcade/runs.server.ts',
  'features/slice-it/engine/daily.server.ts',
  'lib/rmhmusic/learn/social/board.server.ts',
  'app/routes/api/rmhbox/leaderboard.ts',
  // The RMHbox hub is its own process with its own Prisma client; it keeps a twin of the helper.
  'server/rmhbox/leaderboard.ts',
  // Sprint 11
  // s11-05 lights-out-maker
  'lib/lights-out/boards.server.ts',
  // s11-06 daily-following
  'lib/daily-puzzles/following.server.ts',
] as const;

/**
 * A file that looks like a board and is not one that needs the filter. `reason` says why in a sentence; `via` names
 * the listed file that does the read when this one only hands the request to it (the test checks that this file
 * imports it and that it is in {@link BOARD_PRIVACY_READ_PATHS}). A reason is never a substitute for a filter on a
 * file that does show members: `board-privacy-paths.test.ts` fails an entry whose source reads a ranked list of
 * members itself.
 */
export interface BoardPrivacyExemption {
  reason: string;
  via?: (typeof BOARD_PRIVACY_READ_PATHS)[number];
}

export const BOARD_PRIVACY_EXEMPT: Readonly<Record<string, BoardPrivacyExemption>> = {
  // Handlers that return what a listed file reads.
  'features/cursed-logic/api/cursed-logic.leaderboard.server.ts': {
    reason: 'The HTTP shape of the Cursed Logic board, read by its adapter module.',
    via: 'features/cursed-logic/api/score-adapter.server.ts',
  },
  'lib/game/api/games.$id.leaderboard.server.ts': {
    reason: 'The HTTP shape only: every row comes from the game adapters.',
    via: 'lib/game/adapters.server.ts',
  },
  'lib/game/api/leaderboards.$gameId.server.ts': {
    reason: 'The HTTP shape only: rows come from the adapters and the generic adapter, scopes from leaderboard-scope.',
    via: 'lib/game/adapters.server.ts',
  },
  'app/routes/api/v1/leaderboards/$game.ts': {
    reason: 'The developer API board reads the shared game adapters.',
    via: 'lib/game/adapters.server.ts',
  },
  'lib/api/routes/leaderboards.players.server.ts': {
    reason: 'The HTTP shape of the XP board, which is read by lib/leaderboard.server.ts.',
    via: 'lib/leaderboard.server.ts',
  },
  'lib/game/api/replays.board.server.ts': {
    reason: 'The HTTP shape of the replay board, read by listReplaysForGame.',
    via: 'lib/replays.server.ts',
  },
  'lib/rmhtype/api/rmhtype.daily.leaderboard.server.ts': {
    reason: 'The HTTP shape of the typing daily board, read by getDailyBoard.',
    via: 'lib/rmhtype/daily.server.ts',
  },
  'lib/speedrun/api/speedrun.leaderboard.server.ts': {
    reason: 'The HTTP shape of the speedrun board, read by getBoard.',
    via: 'lib/speedrun/speedrun.server.ts',
  },
  'lib/competitive/api/tournaments.$id.pickem.server.ts': {
    reason: "The HTTP shape of the pick'em standings, read by getPickem.",
    via: 'lib/competitive/pickem.server.ts',
  },
  'lib/forecasting/api/forecasting.seasons.server.ts': {
    reason: 'The HTTP shape of the season board, read by getSeasonBoard.',
    via: 'lib/forecasting/forecasting.server.ts',
  },
  'lib/communities/api/communities.$slug.contributors.server.ts': {
    reason: 'The HTTP shape of the contributors list, read by getTopContributors.',
    via: 'lib/communities/contributors.server.ts',
  },
  'lib/rmhmusic/api/rmhmusic.sprint.board.server.ts': {
    reason: 'The HTTP shape of the sight reading daily board, read by loadBoard.',
    via: 'lib/rmhmusic/learn/social/board.server.ts',
  },
  'lib/rmhmusic/learn/social/board-cache.server.ts': {
    reason: 'Cache plumbing for the date list: it reads no table, and loadBoard drops hidden members after the read.',
  },
  // The switch itself.
  'lib/game/leaderboard-privacy.server.ts': {
    reason: 'The helper that answers who is hidden; it returns no board.',
  },
  'lib/game/leaderboard-privacy-settings.server.ts': {
    reason: "Reads and writes the caller's own switch; no member list.",
  },
  'lib/game/api/settings.leaderboard-privacy.server.ts': {
    reason: "The caller's own switch; no endpoint lists the hidden members.",
  },
  // Not a ranked list of members.
  'lib/communities/starboard.server.ts': {
    reason: 'Ranks posts by stars, not members; an author appears as the byline of a post they published.',
  },
  'lib/communities/api/communities.$slug.starboard.server.ts': {
    reason: 'Ranks posts by stars, not members; an author appears as the byline of a post they published.',
  },
  'lib/requests/board.server.ts': {
    reason: 'The public request board ranks requests by votes; an author is the byline of a request they filed.',
  },
  'lib/trick-week/api/nightrail.tricks.vote.server.ts': {
    reason: "A write that answers with the caller's own vote; no list.",
  },
  // One member's own data.
  'lib/profile/app-profiles.server.ts': {
    reason: "One member's stat card for one app, not a list of members.",
  },
  'lib/ranked.server.ts': {
    reason: "The viewer's own ratings and challenges.",
  },
  'features/slice-it/engine/player.server.ts': {
    reason: "One player's own page data.",
  },
  'features/slice-it/engine/rating.server.ts': {
    reason: "Computes one member's own skill rating from their own runs.",
  },
  'lib/account/api/account.export.server.ts': {
    reason: "The member's own data export.",
  },
  'lib/rmhladder/resume/service.server.ts': {
    reason: "The member's own resumes; nobody else can read them.",
  },
  'lib/rmhladder/alerts/dispatch.server.ts': {
    reason: 'Private job alerts delivered to the member who saved the search.',
  },
  'lib/onboarding.server.ts': {
    reason: "The caller's own first-run checklist.",
  },
  'lib/api/routes/onboarding.server.ts': {
    reason: "The caller's own first-run checklist.",
  },
  'lib/api/routes/onboarding.first-week.server.ts': {
    reason: "The caller's own first-week progress.",
  },
  'lib/communities/onboarding.server.ts': {
    reason: "A community's onboarding questions and the caller's own answers.",
  },
  'lib/communities/api/communities.$slug.onboarding.server.ts': {
    reason: "A community's onboarding questions and the caller's own answers.",
  },
  'features/medschools/api/medschools.me.stats.onboarding.server.ts': {
    reason: "Records that the caller skipped the RMH Med Schools stats step (the name contains 'onboarding').",
  },
  'lib/preferences/keyboard.server.ts': {
    reason: "The caller's own key bindings (the name contains 'board').",
  },
  'lib/preferences/api/preferences.keyboard.server.ts': {
    reason: "The caller's own key bindings (the name contains 'board').",
  },
  'lib/account/erasure-boards.server.ts': {
    reason: "Account erasure: deletes the member's own board rows; it returns no list of members.",
  },
  // s11-12 type-challenges
  'lib/rmhtype/challenges.server.ts': {
    reason:
      "The caller's own ghosts ranked by speed (which run to send as a challenge) and the caller's own challenges; no list of other members is ranked.",
  },
};
