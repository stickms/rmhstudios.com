/**
 * Derived RMHBox player stats (pure, client-safe).
 *
 * `RMHboxProfile` stores totals and a `minigameStats` JSON blob, written by
 * `server/rmhbox/leaderboard.ts` after every match. This turns a profile into the
 * numbers the player page shows: win rate, favourite minigame, per-minigame rows,
 * plus the small formatting helpers (placings, durations) the page needs.
 */

/** One minigame's entry in `RMHboxProfile.minigameStats`, as the leaderboard writer stores it. */
export interface StoredMinigameStat {
  gamesPlayed?: number;
  wins?: number;
  bestScore?: number;
  totalScore?: number;
  totalRank?: number;
  averageRank?: number;
}

export interface ProfileRow {
  totalGamesPlayed: number;
  totalWins: number;
  totalScore: number;
  totalPlayTimeMs: number;
  currentWinStreak: number;
  bestWinStreak: number;
  minigameStats: unknown;
}

export interface MinigameStats {
  gamesPlayed: number;
  wins: number;
  bestScore: number;
  totalScore: number;
  /** Mean placing (1 is first), or null when no placing was recorded. */
  averageRank: number | null;
}

export interface GlobalStats {
  totalGamesPlayed: number;
  totalWins: number;
  totalScore: number;
  totalPlayTimeMs: number;
  currentWinStreak: number;
  bestWinStreak: number;
  /** Percent, two decimals (40 for 4 wins in 10). */
  winRate: number;
  favoriteMinigame: string | null;
}

export interface MatchPlayerRow {
  rank: number;
  score: number;
  wasWinner: boolean;
  match: {
    id: string;
    minigameId: string;
    startedAt: Date;
    durationMs: number | null;
    playerCount: number;
  };
}

export interface RecentMatch {
  matchId: string;
  minigameId: string;
  rank: number;
  score: number;
  wasWinner: boolean;
  playerCount: number;
  durationMs: number | null;
  playedAt: string;
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Percent of games won, to two decimals; 0 for no games. */
export function winRate(wins: number, played: number): number {
  return played > 0 ? Math.round((wins / played) * 10000) / 100 : 0;
}

/** Mean placing from the stored sum, falling back to the stored mean; null when neither exists. */
function meanRank(s: StoredMinigameStat, played: number): number | null {
  if (played > 0 && count(s.totalRank) > 0) return Math.round((count(s.totalRank) / played) * 100) / 100;
  const stored = count(s.averageRank);
  return stored > 0 ? stored : null;
}

/** The stored JSON as clean rows, dropping anything that is not an object with games played. */
export function normalizeMinigameStats(raw: unknown): Record<string, MinigameStats> {
  const out: Record<string, MinigameStats> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const s = value as StoredMinigameStat;
    const played = count(s.gamesPlayed);
    if (played === 0) continue;
    out[id] = {
      gamesPlayed: played,
      wins: count(s.wins),
      bestScore: count(s.bestScore),
      totalScore: count(s.totalScore),
      averageRank: meanRank(s, played),
    };
  }
  return out;
}

/**
 * The minigame played most. Ties go to the one with more wins, then to the
 * alphabetically first id, so the answer does not depend on object key order.
 */
export function favoriteMinigame(stats: Record<string, MinigameStats>): string | null {
  let best: string | null = null;
  for (const id of Object.keys(stats).sort()) {
    const cur = stats[id]!;
    const top = best === null ? null : stats[best]!;
    if (
      top === null ||
      cur.gamesPlayed > top.gamesPlayed ||
      (cur.gamesPlayed === top.gamesPlayed && cur.wins > top.wins)
    ) {
      best = id;
    }
  }
  return best;
}

export function deriveGlobal(profile: ProfileRow, minigames: Record<string, MinigameStats>): GlobalStats {
  return {
    totalGamesPlayed: profile.totalGamesPlayed,
    totalWins: profile.totalWins,
    totalScore: profile.totalScore,
    totalPlayTimeMs: profile.totalPlayTimeMs,
    currentWinStreak: profile.currentWinStreak,
    bestWinStreak: profile.bestWinStreak,
    winRate: winRate(profile.totalWins, profile.totalGamesPlayed),
    favoriteMinigame: favoriteMinigame(minigames),
  };
}

export function toRecentMatch(row: MatchPlayerRow): RecentMatch {
  return {
    matchId: row.match.id,
    minigameId: row.match.minigameId,
    rank: row.rank,
    score: row.score,
    wasWinner: row.wasWinner,
    playerCount: row.match.playerCount,
    durationMs: row.match.durationMs,
    playedAt: row.match.startedAt.toISOString(),
  };
}

/** Minigame rows for the table: most played first, then the id for a stable order. */
export function sortMinigameRows(stats: Record<string, MinigameStats>): Array<[string, MinigameStats]> {
  return Object.entries(stats).sort((a, b) => b[1].gamesPlayed - a[1].gamesPlayed || a[0].localeCompare(b[0]));
}

export type OrdinalCategory = 'one' | 'two' | 'few' | 'other';

/** The ordinal plural category for a placing, so each category can carry its own wording. */
export function ordinalCategory(rank: number, locale: string): OrdinalCategory {
  const c = new Intl.PluralRules(locale, { type: 'ordinal' }).select(rank);
  return c === 'one' || c === 'two' || c === 'few' ? c : 'other';
}

/** "3 h 5 min" / "12 min" in the viewer's locale; "0 min" for nothing. */
export function formatPlayTime(ms: number, locale: string): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const unit = (value: number, u: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'short' }).format(value);
  if (hours === 0) return unit(minutes, 'minute');
  return minutes === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(minutes, 'minute')}`;
}
