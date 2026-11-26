/**
 * The co-op record (sprint 14 04), the pure half: the view shapes the runs and board endpoints answer with, the
 * win rate and the favourite class. Client-safe; the reads are in `coop-record.server.ts`.
 */

/** The member's co-op totals, as "Your runs" shows them. `favouriteClass` is a class id, or null with no co-op rows. */
export interface CoopRecord {
  runs: number;
  wins: number;
  /** Whole percentage, 0 to 100. */
  winRate: number;
  revivesGiven: number;
  revivesReceived: number;
  kills: number;
  favouriteClass: string | null;
}

/** One row of a co-op board. No user id: the board is public and ranks by the order of the rows. */
export interface CoopBoardEntry {
  username: string;
  totalCoopWins: number;
  totalRevivesGiven: number;
  totalCoopRuns: number;
}

/**
 * The signed-in member's own place on a co-op board when it is outside the rows the board lists (S14, s15-20).
 * `place` counts from 1 under the board's own order and privacy filter; `value` is the board's column (wins, or
 * revives given); `runs` is their co-op runs, as a listed row shows.
 */
export interface CoopOwnPlace {
  place: number;
  value: number;
  runs: number;
}

/** The two co-op boards `GET /api/altair/leaderboard?type=` adds. */
export const COOP_BOARD_KINDS = ['coop-wins', 'coop-revives'] as const;
export type CoopBoardKind = (typeof COOP_BOARD_KINDS)[number];

export function isCoopBoardKind(type: string): type is CoopBoardKind {
  return (COOP_BOARD_KINDS as readonly string[]).includes(type);
}

/** Wins over runs as a whole percentage (rounded half up), 0 when there are no runs, never above 100. */
export function winRatePercent(runs: number, wins: number): number {
  if (!Number.isFinite(runs) || !Number.isFinite(wins) || runs <= 0 || wins <= 0) return 0;
  return Math.min(100, Math.round((wins / runs) * 100));
}

/** How often a class was played in co-op, and when it was last played (ms since the epoch). */
export interface ClassCount {
  classId: string;
  count: number;
  lastPlayedAt: number;
}

/**
 * The class played most in co-op. Ties go to the class played most recently, then to the lower class id so the answer
 * never depends on the order the rows arrive in. Null when there are no rows.
 */
export function favouriteClassId(counts: readonly ClassCount[]): string | null {
  let best: ClassCount | null = null;
  for (const c of counts) {
    if (c.count <= 0) continue;
    if (
      best === null ||
      c.count > best.count ||
      (c.count === best.count &&
        (c.lastPlayedAt > best.lastPlayedAt || (c.lastPlayedAt === best.lastPlayedAt && c.classId < best.classId)))
    ) {
      best = c;
    }
  }
  return best ? best.classId : null;
}
