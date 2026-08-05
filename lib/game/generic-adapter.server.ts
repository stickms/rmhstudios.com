/**
 * The default storage adapter — the one every new scored game gets for free.
 *
 * `lib/game/adapters.server.ts` is right that rewriting the existing bespoke
 * `*Player` tables into one shape would be a large, risky migration for no user
 * benefit. What it does not solve is the cost of the NEXT game: before this
 * module, "add a scored game" meant a Prisma model, a migration, a deploy, and a
 * hand-written adapter — four steps of ceremony before anyone could play. Every
 * one of those adapters then re-derived the same three decisions (keep the
 * personal best, count the plays, fall back to a display name), and each got a
 * chance to get them subtly wrong.
 *
 * A game with an entry in `lib/game/registry.ts` and nothing else now stores
 * itself in the shared `GameStat` table with the same personal-best semantics
 * the bespoke adapters implement by hand. The bespoke adapters are untouched:
 * they keep their columns, and `getGameAdapter` prefers them.
 *
 * The registry is a HARD gate here, not a lookup convenience. `GameStat.gameId`
 * is a free-text column, so an adapter that accepted any string would turn the
 * submission pipeline into a write endpoint for arbitrary keys — an attacker
 * could mint unbounded rows under ids nothing will ever read or clean up.
 * Refusing to construct an adapter for an unregistered id is what keeps
 * "unknown game" meaning the same thing on this path as on the bespoke one.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { getGameScoreRules, type GameScoreRules } from '@/lib/game/registry';
// Type-only on purpose: `adapters.server.ts` imports this module for its value,
// so a value import back would be a runtime cycle. `import type` is erased at
// compile time, which leaves the dependency one-directional at runtime while
// still binding this adapter to the one interface definition.
import type { GameAdapter, LeaderboardRow, SubmitContext } from '@/lib/game/adapters.server';

/**
 * Fallback display name, mirroring `adapters.server.ts`. Duplicated rather than
 * imported for the cycle reason above — a six-character string is a cheaper
 * price than a circular value import.
 */
const ANON = 'Player';

/**
 * Postgres `int4` ceiling. `GameStat.score`/`progress` are `Int`, so a value
 * past this is not a bad score — it is a failed INSERT that surfaces as a 500.
 */
const INT4_MAX = 2_147_483_647;

/**
 * How many rows a scoped read may walk before ranking. Bounds the cost of a
 * deep `skip` on a table that will eventually hold every player of every game.
 */
const MAX_SCAN = 500;

/** The registry lookup that every entry point here goes through. */
function requireRules(gameId: string): GameScoreRules {
  const rules = getGameScoreRules(gameId);
  if (!rules) {
    throw new Error(
      `genericAdapter: "${gameId}" is not a registered scored game. ` +
        'Add it to GAME_SCORE_RULES in lib/game/registry.ts first — an unregistered id ' +
        'has no bounds to validate against and must never reach storage.',
    );
  }
  return rules;
}

/**
 * Clamp a run to what the registry allows and the column can hold.
 *
 * This is **not** a substitute for `validateScore`. The registry deliberately
 * REJECTS an impossible score rather than clamping it, because a clamped
 * forgery still sits at the top of the board wearing the ceiling as its score —
 * and `submitGameScore` runs that rejection before any adapter is called.
 *
 * The clamp exists for the callers that are not that pipeline: a backfill
 * script, a worker replaying old runs, a bespoke route that grew its own path.
 * For those, the worst outcome should be a truncated number, not a Prisma
 * exception from an `int4` overflow or a negative "best" that no later run can
 * beat. Exported because it is the whole of the adapter's arithmetic and is
 * worth testing without a database.
 */
export function normalizeRun(
  gameId: string,
  run: { score: number; progress?: number },
): { score: number; progress: number } {
  const rules = requireRules(gameId);
  return {
    score: clamp(run.score, rules.maxScore),
    progress: clamp(run.progress ?? 0, rules.maxProgress),
  };
}

/** Non-negative integer, at most `ceiling` and always within `int4`. */
function clamp(value: number, ceiling: number | undefined): number {
  // A non-finite value is a bug upstream, not a zero-score run — but writing 0
  // is the only option that keeps a personal best monotonic, so take it and let
  // validation upstream be the thing that complains.
  if (!Number.isFinite(value)) return 0;
  const max = Math.min(ceiling ?? INT4_MAX, INT4_MAX);
  return Math.min(Math.max(Math.round(value), 0), max);
}

/** `desc` for a high-score game, `asc` for a time/stroke-count game. */
function scoreOrder(rules: GameScoreRules): Prisma.SortOrder {
  return rules.direction === 'lower-is-better' ? 'asc' : 'desc';
}

/** Row shape every read path here maps from. */
type StatRow = {
  userId: string;
  username: string | null;
  score: number;
  progress: number;
  user: { name: string | null; handle: string | null } | null;
};

const STAT_SELECT = {
  userId: true,
  username: true,
  score: true,
  progress: true,
  user: { select: { name: true, handle: true } },
} as const;

/**
 * Display name preference: the name the player typed into the game, then the
 * account's name, then its handle. Games that never ask for a name (the shared
 * table makes `username` optional) still show a person rather than a hash.
 */
function displayName(row: StatRow): string {
  return row.username ?? row.user?.name ?? row.user?.handle ?? ANON;
}

function toRows(rows: StatRow[], startRank: number): LeaderboardRow[] {
  return rows.map((r, i) => ({
    rank: startRank + i + 1,
    username: displayName(r),
    score: r.score,
    progress: r.progress,
    userId: r.userId,
  }));
}

/**
 * A filtered / paged read of one game's board.
 *
 * Lives here rather than in the route because this module is the only place
 * that is allowed to know `GameStat` exists — the same rule that keeps every
 * bespoke Prisma model inside `adapters.server.ts`. The route passes a
 * where-fragment from `leaderboard-scope.server.ts` and gets rows back.
 */
export async function genericLeaderboardRows(
  gameId: string,
  opts: { where?: Prisma.GameStatWhereInput; skip?: number; take: number },
): Promise<LeaderboardRow[]> {
  const rules = requireRules(gameId);
  const skip = Math.max(0, Math.trunc(opts.skip ?? 0));
  const take = Math.min(Math.max(Math.trunc(opts.take), 0), MAX_SCAN);
  if (take === 0) return [];

  const rows = await prisma.gameStat.findMany({
    where: { gameId, ...(opts.where ?? {}) },
    // `updatedAt asc` breaks ties: whoever reached the score first outranks
    // whoever matched it later. Without a second key the order is whatever the
    // planner returns, which makes paging silently drop and repeat rows.
    orderBy: [{ score: scoreOrder(rules) }, { updatedAt: 'asc' }],
    skip,
    take,
    select: STAT_SELECT,
  });
  return toRows(rows as StatRow[], skip);
}

/**
 * Build the adapter for a registered game backed by `GameStat`.
 *
 * Throws for an unregistered id — see the module docblock. Callers that want a
 * soft answer use `getGameAdapter`, which returns `undefined` instead.
 */
export function genericAdapter(gameId: string): GameAdapter {
  const rules = requireRules(gameId);
  const lowerIsBetter = rules.direction === 'lower-is-better';

  return {
    // The stored number is a personal best, whichever direction "best" runs in.
    metric: lowerIsBetter ? 'bestScore' : 'highScore',

    async submit(ctx: SubmitContext): Promise<void> {
      const { score, progress } = normalizeRun(gameId, ctx);
      // `meta` is stamped with the record run, not the latest one: it exists to
      // describe the score on the board, and a later worse run would otherwise
      // relabel a record with the circumstances of a different game.
      const meta = (ctx.meta ?? {}) as Prisma.InputJsonValue;

      // Ensure the row exists and accumulate what is safe to accumulate, then
      // raise each best with a CONDITIONAL update. Read-then-`Math.max` is the
      // trap `synapseStorm` documents: two overlapping submissions both read the
      // old best, the worse one lands last, and the player is silently demoted.
      await prisma.gameStat.upsert({
        where: { gameId_userId: { gameId, userId: ctx.userId } },
        create: {
          gameId,
          userId: ctx.userId,
          username: ctx.username,
          score,
          progress,
          plays: 1,
          meta,
        },
        update: {
          plays: { increment: 1 },
          // A name is only overwritten when the player supplied one, so a game
          // that stops collecting names can't blank an existing board entry.
          ...(ctx.username ? { username: ctx.username } : {}),
        },
        select: { userId: true },
      });

      await prisma.gameStat.updateMany({
        where: {
          gameId,
          userId: ctx.userId,
          score: lowerIsBetter ? { gt: score } : { lt: score },
        },
        data: { score, meta },
      });

      // Progress is its own personal best (deepest wave / furthest floor), which
      // is how every bespoke adapter treats it — the deepest run and the
      // highest-scoring run are not always the same run.
      await prisma.gameStat.updateMany({
        where: { gameId, userId: ctx.userId, progress: { lt: progress } },
        data: { progress },
      });
    },

    leaderboard(limit: number): Promise<LeaderboardRow[]> {
      return genericLeaderboardRows(gameId, { take: limit });
    },
  };
}
