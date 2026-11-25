/**
 * Query schemas and the ranking rules of the friends board. Server-side only (zod): the client sees the contract
 * types in `following.contract.ts`.
 */
import { z } from 'zod';

/** The seven daily modes, in the order the hub lists them. */
export const DAILY_MODES = ['lights-out', 'alibi', 'spectrum', 'outcast', 'chainlink', 'impostor', 'globeset'] as const;
export type DailyMode = (typeof DAILY_MODES)[number];

/** Most rows the friends board returns. */
export const FOLLOWING_BOARD_MAX = 100;

/** A calendar day, `YYYY-MM-DD`, that exists (so `2026-02-31` is refused rather than matching nothing). */
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });

export const followingBoardQuery = z.object({
  gameMode: z.enum(DAILY_MODES),
  date: dateKey,
});

export const followingSummaryQuery = z.object({
  date: dateKey,
});

/** The columns a mode ranks on. */
export interface RankableRow {
  score: number | null;
  moves: number | null;
  dnf: boolean | null;
  timeSeconds: number | null;
  createdAt: Date;
}

/** Lower sorts first; `null` sorts last. */
function ascNullLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * The mode's own ranking axis, as a comparator: moves ascending for Lights Out, time ascending for GlobeSet (a
 * did-not-finish run is last in both, whatever its moves or time), points descending for the rest; the earlier run
 * wins a tie. The board's `orderBy` in `following.server.ts` says the same thing to the database.
 */
export function compareForMode(gameMode: string, a: RankableRow, b: RankableRow): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (gameMode === 'lights-out' || gameMode === 'globeset') {
    const dnf = Number(!!a.dnf) - Number(!!b.dnf);
    if (dnf !== 0) return dnf;
    const axis = gameMode === 'lights-out' ? ascNullLast(a.moves, b.moves) : ascNullLast(a.timeSeconds, b.timeSeconds);
    return axis !== 0 ? axis : byTime;
  }
  const score = (b.score ?? 0) - (a.score ?? 0);
  return score !== 0 ? score : byTime;
}
