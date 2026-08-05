/**
 * Storage adapters — the one place that knows which Prisma model backs which
 * game.
 *
 * The per-game player tables were added independently over time and do not
 * share a shape (`VoidBreakerPlayer.bestWave` vs `SignalForgePlayer.floorReached`
 * vs `SynapseStormPlayer.maxCombo`, and Synapse Storm has no `username` at all).
 * Rewriting them into one table would be a large, risky migration for no user
 * benefit, so instead each declares how to read and write itself behind a common
 * interface. Everything above this file — validation, progression, leaderboards,
 * the API surface — is then genuinely shared.
 *
 * A game no longer HAS to be listed here. An id that is in
 * `lib/game/registry.ts` and absent below falls through to
 * `genericAdapter(id)`, which stores it in the shared `GameStat` table — so
 * adding a scored game is one registry entry, and a bespoke adapter is what you
 * write when a game needs columns of its own. The registry remains the gate:
 * an id in neither place is still unknown, and `getGameAdapter` still says so
 * by returning `undefined`.
 */

import { prisma } from '@/lib/prisma.server';
import { getGameScoreRules, scoredGameIds } from '@/lib/game/registry';
import { genericAdapter } from '@/lib/game/generic-adapter.server';

/** One row as the unified leaderboard renders it. */
export interface LeaderboardRow {
  rank: number;
  /** Display name; falls back to the linked account's name. */
  username: string;
  score: number;
  /** Secondary metric, matching the registry's `progressLabel`. */
  progress: number | null;
  userId: string | null;
}

export interface SubmitContext {
  userId: string;
  score: number;
  progress: number;
  /** Sanitised display name, when the game collects one. */
  username: string | null;
  durationMs: number;
  /**
   * Game-specific numeric extras that don't fit the shared score/progress pair
   * (Neon Driftway's difficulty level, for instance). Adapters read only the
   * keys they know about and ignore the rest, so one game adding a field can't
   * affect another.
   */
  meta?: Record<string, number>;
}

export interface GameAdapter {
  /**
   * Persist a run. Implementations keep a personal best rather than overwriting,
   * so a worse later run can never demote a player.
   *
   * Optional: some games are read-only here because they still submit through
   * their own bespoke route (or don't submit at all), but their leaderboard is
   * shared. A game WITH `submit` must also have scoring rules in the registry —
   * the consistency test enforces that pairing.
   */
  submit?(ctx: SubmitContext): Promise<void>;
  /** Top `limit` rows, best first. */
  leaderboard(limit: number): Promise<LeaderboardRow[]>;
  /** Name of the ranked metric, for API consumers ('highScore', 'totalScore'…). */
  metric: string;
}

/** Fallback display name when a game doesn't collect one. */
const ANON = 'Player';

const voidBreaker: GameAdapter = {
  metric: 'highScore',
  async submit({ userId, score, progress, username, durationMs }) {
    const existing = await prisma.voidBreakerPlayer.findUnique({ where: { userId } });
    if (existing) {
      await prisma.voidBreakerPlayer.update({
        where: { id: existing.id },
        data: {
          highScore: Math.max(existing.highScore, score),
          bestWave: Math.max(existing.bestWave, progress),
          bestTimeMs: Math.max(existing.bestTimeMs, durationMs),
          gamesPlayed: { increment: 1 },
          updatedAt: new Date(),
          ...(username ? { username } : {}),
        },
      });
      return;
    }
    await prisma.voidBreakerPlayer.create({
      data: {
        userId,
        username: username ?? `${ANON}-${userId.slice(0, 6)}`,
        highScore: score,
        bestWave: progress,
        bestTimeMs: durationMs,
        gamesPlayed: 1,
      },
    });
  },
  async leaderboard(limit) {
    const rows = await prisma.voidBreakerPlayer.findMany({
      take: limit,
      orderBy: { highScore: 'desc' },
      select: { username: true, highScore: true, bestWave: true, userId: true },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      score: r.highScore,
      progress: r.bestWave,
      userId: r.userId,
    }));
  },
};

const neonDriftway: GameAdapter = {
  metric: 'highScore',
  async submit({ userId, score, progress, username, durationMs, meta }) {
    // Difficulty level (1-3); tracked as a personal best alongside the score.
    const level = Math.min(Math.max(Math.round(meta?.level ?? 1), 1), 3);
    const existing = await prisma.neonDriftwayPlayer.findUnique({ where: { userId } });
    if (existing) {
      await prisma.neonDriftwayPlayer.update({
        where: { id: existing.id },
        data: {
          highScore: Math.max(existing.highScore, score),
          bestDistance: Math.max(existing.bestDistance, progress),
          bestTimeMs: Math.max(existing.bestTimeMs, durationMs),
          bestLevel: Math.max(existing.bestLevel, level),
          gamesPlayed: { increment: 1 },
          updatedAt: new Date(),
          ...(username ? { username } : {}),
        },
      });
      return;
    }
    await prisma.neonDriftwayPlayer.create({
      data: {
        userId,
        username: username ?? `${ANON}-${userId.slice(0, 6)}`,
        highScore: score,
        bestDistance: progress,
        bestTimeMs: durationMs,
        bestLevel: level,
        gamesPlayed: 1,
      },
    });
  },
  async leaderboard(limit) {
    const rows = await prisma.neonDriftwayPlayer.findMany({
      take: limit,
      orderBy: { highScore: 'desc' },
      select: { username: true, highScore: true, bestDistance: true, userId: true },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      score: r.highScore,
      progress: r.bestDistance,
      userId: r.userId,
    }));
  },
};

const nightrail: GameAdapter = {
  metric: 'highScore',
  async submit({ userId, score, progress, username, meta }) {
    // Level 1-5, and the peak combo multiplier the run reached. The multiplier
    // is stored alongside the score because it is the number that separates a
    // long careful run from a short brilliant one, and the score alone hides
    // that difference.
    const level = Math.min(Math.max(Math.round(meta?.level ?? 1), 1), 5);
    const multiplier = Math.max(1, Math.round(meta?.multiplier ?? 1));
    // Only a run that reached the finish line with cargo counts as finished;
    // the client sends 1/0 and anything else is treated as unfinished.
    const finished = meta?.finished === 1 ? 1 : 0;

    const existing = await prisma.nightrailPlayer.findUnique({ where: { userId } });
    if (existing) {
      await prisma.nightrailPlayer.update({
        where: { id: existing.id },
        data: {
          highScore: Math.max(existing.highScore, score),
          bestDistance: Math.max(existing.bestDistance, progress),
          bestMultiplier: Math.max(existing.bestMultiplier, multiplier),
          bestLevel: Math.max(existing.bestLevel, level),
          runsFinished: { increment: finished },
          gamesPlayed: { increment: 1 },
          updatedAt: new Date(),
          ...(username ? { username } : {}),
        },
      });
      return;
    }
    await prisma.nightrailPlayer.create({
      data: {
        userId,
        username: username ?? `${ANON}-${userId.slice(0, 6)}`,
        highScore: score,
        bestDistance: progress,
        bestMultiplier: multiplier,
        bestLevel: level,
        runsFinished: finished,
        gamesPlayed: 1,
      },
    });
  },
  async leaderboard(limit) {
    const rows = await prisma.nightrailPlayer.findMany({
      take: limit,
      orderBy: { highScore: 'desc' },
      select: { username: true, highScore: true, bestDistance: true, userId: true },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      score: r.highScore,
      progress: r.bestDistance,
      userId: r.userId,
    }));
  },
};

const signalForge: GameAdapter = {
  metric: 'highScore',
  async submit({ userId, score, progress, username }) {
    const existing = await prisma.signalForgePlayer.findUnique({ where: { userId } });
    if (existing) {
      await prisma.signalForgePlayer.update({
        where: { id: existing.id },
        data: {
          highScore: Math.max(existing.highScore, score),
          floorReached: Math.max(existing.floorReached, progress),
          gamesPlayed: { increment: 1 },
          ...(username ? { username } : {}),
        },
      });
      return;
    }
    await prisma.signalForgePlayer.create({
      data: {
        userId,
        username: username ?? `${ANON}-${userId.slice(0, 6)}`,
        highScore: score,
        floorReached: Math.max(progress, 1),
        gamesPlayed: 1,
      },
    });
  },
  async leaderboard(limit) {
    const rows = await prisma.signalForgePlayer.findMany({
      take: limit,
      orderBy: { highScore: 'desc' },
      select: { username: true, highScore: true, floorReached: true, userId: true },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      score: r.highScore,
      progress: r.floorReached,
      userId: r.userId,
    }));
  },
};

const synapseStorm: GameAdapter = {
  metric: 'highScore',
  // No `username` column — this table joins to the account for its display name.
  async submit({ userId, score, progress, durationMs, meta }) {
    const puzzlesSolved = Math.max(0, Math.round(meta?.puzzlesSolved ?? 0));
    const peakDifficulty = Math.max(1, Math.round(meta?.peakDifficulty ?? 1));
    const seconds = durationMs / 1000;

    // Ensure the row exists and accumulate the running totals, then raise each
    // BEST with a conditional update. The previous version read the current
    // bests and wrote `Math.max(read, new)`, which loses an update whenever two
    // submissions overlap: both read the old best and the worse one lands last,
    // silently demoting the player.
    await prisma.synapseStormPlayer.upsert({
      where: { userId },
      create: {
        userId,
        highScore: score,
        maxCombo: progress,
        puzzlesSolved,
        peakDifficulty,
        totalTime: seconds,
      },
      update: {
        puzzlesSolved: { increment: puzzlesSolved },
        totalTime: { increment: seconds },
      },
      select: { userId: true },
    });
    await prisma.synapseStormPlayer.updateMany({
      where: { userId, highScore: { lt: score } },
      data: { highScore: score },
    });
    await prisma.synapseStormPlayer.updateMany({
      where: { userId, maxCombo: { lt: progress } },
      data: { maxCombo: progress },
    });
    await prisma.synapseStormPlayer.updateMany({
      where: { userId, peakDifficulty: { lt: peakDifficulty } },
      data: { peakDifficulty },
    });
  },
  async leaderboard(limit) {
    const rows = await prisma.synapseStormPlayer.findMany({
      take: limit,
      orderBy: { highScore: 'desc' },
      select: {
        userId: true,
        highScore: true,
        maxCombo: true,
        user: { select: { name: true, handle: true } },
      },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.user?.name ?? r.user?.handle ?? ANON,
      score: r.highScore,
      progress: r.maxCombo,
      userId: r.userId,
    }));
  },
};

/**
 * Leaderboard-only adapters. These games still submit through their own routes,
 * but their rankings were previously re-queried by hand inside
 * `/api/v1/leaderboards/$game` — a fourth copy of the same list. Declaring them
 * here means the developer API, the unified endpoint and any future surface all
 * read one definition.
 */
const vega: GameAdapter = {
  metric: 'highestLevel',
  async leaderboard(limit) {
    const rows = await prisma.vegaPlayer.findMany({
      take: limit,
      orderBy: { highestLevel: 'desc' },
      select: { username: true, highestLevel: true, highestLoop: true, userId: true },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      score: r.highestLevel,
      progress: r.highestLoop,
      userId: r.userId,
    }));
  },
};

const laundrySort: GameAdapter = {
  metric: 'highScore',
  async leaderboard(limit) {
    const rows = await prisma.laundryPlayer.findMany({
      take: limit,
      orderBy: { highScore: 'desc' },
      select: { username: true, highScore: true, gamesPlayed: true, userId: true },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      score: r.highScore,
      progress: r.gamesPlayed,
      userId: r.userId,
    }));
  },
};

const sliceIt: GameAdapter = {
  metric: 'totalScore',
  async leaderboard(limit) {
    const rows = await prisma.player.findMany({
      take: limit,
      orderBy: { totalScore: 'desc' },
      select: { username: true, totalScore: true, gamesPlayed: true, userId: true },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      score: r.totalScore,
      progress: r.gamesPlayed,
      userId: r.userId,
    }));
  },
};

const ADAPTERS: Record<string, GameAdapter> = {
  'void-breaker': voidBreaker,
  'neon-driftway': neonDriftway,
  nightrail,
  'signal-forge': signalForge,
  'synapse-storm': synapseStorm,
  vega,
  'laundry-sort': laundrySort,
  'slice-it': sliceIt,
};

/**
 * True when `gameId` has a hand-written adapter above (its own Prisma model),
 * as opposed to falling through to the shared `GameStat` table.
 *
 * Callers need this to know which storage they are talking to: a `GameStat`
 * read can be filtered by any where-fragment, while a bespoke model is reachable
 * only through the `leaderboard(limit)` on this interface, so a caller narrowing
 * a board to an audience has to do it in memory for those games. It is NOT a
 * "does this game exist" test — use `getGameAdapter` for that.
 */
export function hasBespokeAdapter(gameId: string): boolean {
  return Object.hasOwn(ADAPTERS, gameId);
}

/**
 * Generic adapters are memoised per id. Not for speed — building one is a
 * registry lookup and a closure — but so repeated calls return the same object,
 * which is what callers comparing adapters by identity would expect from a
 * lookup that used to be a plain property read.
 */
const GENERIC_CACHE = new Map<string, GameAdapter>();

/**
 * The adapter for a game id, or `undefined` when the id is not a game.
 *
 * `undefined` is load-bearing and deliberately still reachable: three callers
 * (`submitGameScore`, `/api/games/$id/leaderboard`, `/api/v1/leaderboards/$game`)
 * use it as their unknown-game detector. If every id resolved to an adapter,
 * the score pipeline would accept submissions for arbitrary strings and the
 * shared `GameStat` table would become a write endpoint for keys nothing reads.
 * So the fallback is gated on the registry: known id → adapter, anything else →
 * `undefined`, exactly as before.
 *
 * `Object.hasOwn` rather than a bare index, because `ADAPTERS` is an object
 * literal and `gameId` comes off a URL: `getGameAdapter('constructor')` used to
 * return `Object.prototype.constructor`, which is truthy, passes an
 * `if (!adapter)` guard, and then throws when the caller reaches for
 * `.leaderboard`.
 */
export function getGameAdapter(gameId: string): GameAdapter | undefined {
  if (Object.hasOwn(ADAPTERS, gameId)) return ADAPTERS[gameId];
  if (!getGameScoreRules(gameId)) return undefined;

  const cached = GENERIC_CACHE.get(gameId);
  if (cached) return cached;
  const built = genericAdapter(gameId);
  GENERIC_CACHE.set(gameId, built);
  return built;
}

/**
 * Every id that resolves to an adapter — bespoke or generic.
 *
 * The union matters to the developer API, which prints this list as "supported
 * games" when it rejects an unknown one. A registry-only game is served there
 * like any other, so leaving it out of the list would make the error message
 * lie about what it just refused.
 */
export function adapterGameIds(): string[] {
  return [...new Set([...Object.keys(ADAPTERS), ...scoredGameIds()])];
}

/** Ids whose adapter accepts score submissions — must match the registry. */
export function submittableGameIds(): string[] {
  const bespoke = Object.entries(ADAPTERS)
    .filter(([, a]) => typeof a.submit === 'function')
    .map(([id]) => id);
  // Every registry id submits: it either has a bespoke adapter with a `submit`
  // or gets the generic one, which always has it.
  return [...new Set([...bespoke, ...scoredGameIds()])];
}
