/**
 * Bum's Rush — client-side leaderboard fetch and types.
 *
 * Mirrors the shape `app/routes/api/bums-rush/leaderboard.ts` returns.
 * Per §11.5 the clean and assisted boards are fetched separately — `assisted`
 * is a required argument here for the same reason it is a required query
 * param there: it names which of the two boards is being asked for.
 */

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  handle: string | null;
  image: string | null;
  bestMs: number;
  objectives: number;
  clears: number;
  achievedAt: string;
  isSelf: boolean;
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  total: number;
  nextCursor: number | null;
  self: LeaderboardEntry | null;
}

export interface LeaderboardQuery {
  levelId: string;
  playerCount: number;
  assisted: boolean;
  cursor?: number;
  limit?: number;
}

export async function fetchLeaderboard(query: LeaderboardQuery): Promise<LeaderboardPage> {
  const params = new URLSearchParams({
    levelId: query.levelId,
    playerCount: String(query.playerCount),
    assisted: String(query.assisted),
  });
  if (query.cursor != null) params.set('cursor', String(query.cursor));
  if (query.limit != null) params.set('limit', String(query.limit));

  const res = await fetch(`/api/bums-rush/leaderboard?${params.toString()}`);
  if (!res.ok) throw new Error(`bums-rush leaderboard fetch failed: ${res.status}`);
  return res.json();
}

/**
 * §11.5's Solo Ladder: `playerCount = 1` rolled up across every solo-viable
 * level, ranked by summed best times, with unfinished levels excluded from
 * the sum (a gap, never a penalty).
 *
 * This helper only does the summing — it takes the caller's own per-level
 * bests (from `Profile.clears`, `playerCount === 1`) rather than fetching
 * every solo level's full board, which the ladder screen (a separate ticket)
 * does not need just to show one player's own standing.
 */
export function summarizeSoloLadder(
  soloBestMsByLevel: ReadonlyMap<string, number>,
  soloViableLevelIds: readonly string[],
): { totalMs: number; levelsCounted: number; levelsMissing: number } {
  let totalMs = 0;
  let levelsCounted = 0;
  for (const levelId of soloViableLevelIds) {
    const best = soloBestMsByLevel.get(levelId);
    if (best != null) {
      totalMs += best;
      levelsCounted++;
    }
  }
  return { totalMs, levelsCounted, levelsMissing: soloViableLevelIds.length - levelsCounted };
}
