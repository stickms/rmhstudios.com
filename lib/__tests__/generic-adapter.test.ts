import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The default `GameStat` adapter, and the unknown-game boundary around it.
 *
 * The generic adapter is what makes a new game one registry entry instead of a
 * migration — and it is also the moment `gameId` stops being a fixed set of
 * hand-written keys and becomes a value off a URL. Two properties keep that
 * from being a hole, and both are tested here:
 *
 *  1. An id with no entry in `lib/game/registry.ts` resolves to NOTHING. Not a
 *     permissive adapter, not an empty board — `undefined`, the same answer the
 *     three existing callers already treat as "unknown game". Without it,
 *     `GameStat` is a write endpoint for arbitrary keys.
 *  2. What does get written is bounded by the registry and by the `int4`
 *     column, so no caller can overflow the column or park a negative "best"
 *     that no later run can beat.
 */

/**
 * `vi.mock` factories are hoisted above every `const` in the file, so the two
 * synthetic games have to be declared inside `vi.hoisted` to exist by the time
 * the registry mock reads them.
 *
 * `GENERIC_GAME` is a registered game with no bespoke adapter — the case the
 * generic adapter exists for, and one the shipped registry has no example of
 * yet (every current entry predates it and has its own table). Injecting it
 * through the module rather than editing `registry.ts` proves the fallback
 * works for the NEXT game without shipping a fake one to production.
 * `TIMED_GAME` is the same, ranked ascending — a game where a lower score wins.
 */
const { gameStat, GENERIC_GAME, TIMED_GAME } = vi.hoisted(() => ({
  gameStat: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  GENERIC_GAME: {
    id: 'test-only-generic',
    label: 'Test Only Generic',
    maxScore: 1_000,
    direction: 'higher-is-better' as const,
    progressLabel: 'Floor',
    maxProgress: 50,
  },
  TIMED_GAME: {
    id: 'test-only-timed',
    label: 'Test Only Timed',
    maxScore: 600_000,
    direction: 'lower-is-better' as const,
  },
}));

vi.mock('@/lib/prisma.server', () => ({ prisma: { gameStat } }));

vi.mock('@/lib/game/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/game/registry')>();
  const extra = new Map<string, unknown>([
    [GENERIC_GAME.id, GENERIC_GAME],
    [TIMED_GAME.id, TIMED_GAME],
  ]);
  return {
    ...actual,
    getGameScoreRules: (id: string) => extra.get(id) ?? actual.getGameScoreRules(id),
    scoredGameIds: () => [...actual.scoredGameIds(), ...extra.keys()],
  };
});

import {
  genericAdapter,
  genericLeaderboardRows,
  normalizeRun,
} from '@/lib/game/generic-adapter.server';
import { getGameAdapter, hasBespokeAdapter } from '@/lib/game/adapters.server';

const USER = 'user_1';

beforeEach(() => {
  vi.clearAllMocks();
  gameStat.upsert.mockResolvedValue({ userId: USER });
  gameStat.updateMany.mockResolvedValue({ count: 1 });
  gameStat.findMany.mockResolvedValue([]);
});

describe('unknown-game rejection', () => {
  it('getGameAdapter returns undefined for an unregistered id', () => {
    // The three existing callers (`submitGameScore`, `/api/games/$id/leaderboard`,
    // `/api/v1/leaderboards/$game`) all detect an unknown game by this exact
    // `undefined`. Resolving every id to a generic adapter would silently turn
    // the score pipeline into an open write endpoint.
    expect(getGameAdapter('not-a-game')).toBeUndefined();
    expect(getGameAdapter('')).toBeUndefined();
  });

  it('getGameAdapter is not fooled by Object.prototype keys', () => {
    // `gameId` comes off a URL. A bare `ADAPTERS[gameId]` lookup answers
    // `Object.prototype.constructor` here — truthy, so it survives an
    // `if (!adapter)` guard and then throws on `.leaderboard`.
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(getGameAdapter(key), key).toBeUndefined();
    }
  });

  it('genericAdapter refuses to build for an unregistered id', () => {
    expect(() => genericAdapter('not-a-game')).toThrow(/not a registered scored game/);
  });

  it('the pure clamp refuses an unregistered id too', () => {
    // Not just the factory: any entry point that could write a row has to fail
    // on an id with no bounds, or the bounds are optional in practice.
    expect(() => normalizeRun('not-a-game', { score: 1 })).toThrow(/not a registered scored game/);
  });

  it('reads refuse an unregistered id without querying', async () => {
    await expect(genericLeaderboardRows('not-a-game', { take: 10 })).rejects.toThrow(
      /not a registered scored game/,
    );
    expect(gameStat.findMany).not.toHaveBeenCalled();
  });
});

describe('adapter resolution', () => {
  it('prefers the bespoke adapter when a game has its own table', () => {
    expect(hasBespokeAdapter('void-breaker')).toBe(true);
    expect(getGameAdapter('void-breaker')?.metric).toBe('highScore');
  });

  it('falls back to the generic adapter for a registered game with no table', () => {
    expect(hasBespokeAdapter(GENERIC_GAME.id)).toBe(false);
    const adapter = getGameAdapter(GENERIC_GAME.id);
    expect(adapter).toBeDefined();
    expect(typeof adapter?.submit).toBe('function');
  });

  it('returns the same generic adapter object for repeated lookups', () => {
    expect(getGameAdapter(GENERIC_GAME.id)).toBe(getGameAdapter(GENERIC_GAME.id));
  });

  it('hasBespokeAdapter is a storage question, not an existence one', () => {
    // An unknown id has no bespoke adapter AND no adapter at all; the two
    // answers must not be confused for each other.
    expect(hasBespokeAdapter('not-a-game')).toBe(false);
    expect(getGameAdapter('not-a-game')).toBeUndefined();
  });
});

describe('score and progress clamping', () => {
  it('passes an ordinary run through untouched', () => {
    expect(normalizeRun(GENERIC_GAME.id, { score: 500, progress: 12 })).toEqual({
      score: 500,
      progress: 12,
    });
  });

  it('clamps to the registry ceilings', () => {
    // The clamp is a floor under direct callers (backfills, workers), NOT the
    // validation path: `submitGameScore` rejects an over-ceiling score outright,
    // because a clamped forgery still sits at the top of the board wearing the
    // ceiling as its score.
    expect(normalizeRun(GENERIC_GAME.id, { score: 9_999_999, progress: 9_999 })).toEqual({
      score: GENERIC_GAME.maxScore,
      progress: GENERIC_GAME.maxProgress,
    });
  });

  it('clamps to the int4 ceiling when a game declares no progress cap', () => {
    // `TIMED_GAME` has no `maxProgress`. The column is still `Int`, and an
    // overflow there is a 500 rather than a bad score.
    expect(normalizeRun(TIMED_GAME.id, { score: 1, progress: 5e12 }).progress).toBe(2_147_483_647);
  });

  it('floors negatives at zero so a best stays beatable', () => {
    expect(normalizeRun(GENERIC_GAME.id, { score: -5, progress: -1 })).toEqual({
      score: 0,
      progress: 0,
    });
  });

  it('rounds fractional values', () => {
    expect(normalizeRun(GENERIC_GAME.id, { score: 10.6, progress: 3.2 })).toEqual({
      score: 11,
      progress: 3,
    });
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('turns a %s score into 0 rather than a database error', (_label, score) => {
    expect(normalizeRun(GENERIC_GAME.id, { score })).toEqual({ score: 0, progress: 0 });
  });

  it('defaults a missing progress to 0', () => {
    expect(normalizeRun(GENERIC_GAME.id, { score: 1 }).progress).toBe(0);
  });

  it('clamps on the write path, not only in the exported helper', async () => {
    await getGameAdapter(GENERIC_GAME.id)!.submit!({
      userId: USER,
      score: 9_999_999,
      progress: 9_999,
      username: 'Ada',
      durationMs: 60_000,
    });
    expect(gameStat.upsert.mock.calls[0]?.[0]).toMatchObject({
      create: { score: GENERIC_GAME.maxScore, progress: GENERIC_GAME.maxProgress },
    });
  });
});

describe('personal bests', () => {
  const submit = (score: number, progress = 0, meta?: Record<string, number>) =>
    getGameAdapter(GENERIC_GAME.id)!.submit!({
      userId: USER,
      score,
      progress,
      username: null,
      durationMs: 1_000,
      meta,
    });

  it('raises the score with a conditional write, never a read-then-max', async () => {
    // The lost-update trap `synapseStorm` documents: two overlapping
    // submissions both read the old best, the worse one lands last, and the
    // player is silently demoted. The condition lives in the WHERE clause so
    // the database resolves the race.
    await submit(400);
    const scoreUpdate = gameStat.updateMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
      .find((c) => 'score' in c.where);

    expect(scoreUpdate?.where).toMatchObject({ userId: USER, score: { lt: 400 } });
    expect(scoreUpdate?.data).toMatchObject({ score: 400 });
  });

  it('inverts the comparison for a lower-is-better game', async () => {
    await getGameAdapter(TIMED_GAME.id)!.submit!({
      userId: USER,
      score: 42_000,
      progress: 0,
      username: null,
      durationMs: 42_000,
    });
    const scoreUpdate = gameStat.updateMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown> })
      .find((c) => 'score' in c.where);

    // A faster time is a better time; `lt` here would refuse to ever record one.
    expect(scoreUpdate?.where).toMatchObject({ score: { gt: 42_000 } });
  });

  it('tracks progress as its own best, independent of the score', async () => {
    // The deepest run and the highest-scoring run are not always the same run,
    // which is how every bespoke adapter already treats this pair.
    await submit(10, 30);
    const progressUpdate = gameStat.updateMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
      .find((c) => 'progress' in c.where);

    expect(progressUpdate?.where).toMatchObject({ progress: { lt: 30 } });
    expect(progressUpdate?.data).toEqual({ progress: 30 });
  });

  it('stamps meta onto the record run only', async () => {
    await submit(400, 0, { level: 3 });
    const scoreUpdate = gameStat.updateMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
      .find((c) => 'score' in c.where);

    // Meta describes the score on the board. Writing it on every submission
    // would relabel a record with the circumstances of a later, worse run.
    expect(scoreUpdate?.data).toMatchObject({ meta: { level: 3 } });
    expect(gameStat.upsert.mock.calls[0]?.[0]).toMatchObject({
      update: { plays: { increment: 1 } },
    });
    expect((gameStat.upsert.mock.calls[0]?.[0] as { update: object }).update).not.toHaveProperty(
      'meta',
    );
  });

  it('never blanks a stored name when a run supplies none', async () => {
    await submit(10);
    const update = (gameStat.upsert.mock.calls[0]?.[0] as { update: object }).update;
    expect(update).not.toHaveProperty('username');
  });

  it('updates the stored name when a run supplies one', async () => {
    await getGameAdapter(GENERIC_GAME.id)!.submit!({
      userId: USER,
      score: 10,
      progress: 0,
      username: 'Ada',
      durationMs: 1_000,
    });
    expect(gameStat.upsert.mock.calls[0]?.[0]).toMatchObject({ update: { username: 'Ada' } });
  });
});

describe('leaderboard reads', () => {
  it('orders by the game’s direction and breaks ties deterministically', async () => {
    await genericLeaderboardRows(GENERIC_GAME.id, { take: 5 });
    expect(gameStat.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { gameId: GENERIC_GAME.id },
      orderBy: [{ score: 'desc' }, { updatedAt: 'asc' }],
      take: 5,
    });

    await genericLeaderboardRows(TIMED_GAME.id, { take: 5 });
    expect(gameStat.findMany.mock.calls[1]?.[0]).toMatchObject({
      orderBy: [{ score: 'asc' }, { updatedAt: 'asc' }],
    });
  });

  it('scopes a read with the caller’s where-fragment, keeping the gameId', async () => {
    await genericLeaderboardRows(GENERIC_GAME.id, {
      where: { userId: { in: ['a', 'b'] } },
      take: 5,
    });
    expect(gameStat.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { gameId: GENERIC_GAME.id, userId: { in: ['a', 'b'] } },
    });
  });

  it('ranks from the offset so a second page continues the first', async () => {
    gameStat.findMany.mockResolvedValue([
      { userId: 'u1', username: 'One', score: 9, progress: 1, user: null },
      { userId: 'u2', username: null, score: 8, progress: 2, user: { name: 'Two', handle: null } },
    ]);
    const rows = await genericLeaderboardRows(GENERIC_GAME.id, { skip: 10, take: 2 });
    expect(rows.map((r) => r.rank)).toEqual([11, 12]);
  });

  it('falls back through the account name to a placeholder', async () => {
    gameStat.findMany.mockResolvedValue([
      {
        userId: 'u1',
        username: 'Typed',
        score: 3,
        progress: 0,
        user: { name: 'Acct', handle: 'h' },
      },
      {
        userId: 'u2',
        username: null,
        score: 2,
        progress: 0,
        user: { name: null, handle: 'handle' },
      },
      { userId: 'u3', username: null, score: 1, progress: 0, user: null },
    ]);
    const rows = await genericLeaderboardRows(GENERIC_GAME.id, { take: 3 });
    expect(rows.map((r) => r.username)).toEqual(['Typed', 'handle', 'Player']);
  });

  it('bounds how deep a single read can scan', async () => {
    await genericLeaderboardRows(GENERIC_GAME.id, { take: 100_000 });
    const args = gameStat.findMany.mock.calls[0]?.[0] as { take: number };
    expect(args.take).toBeLessThanOrEqual(500);
  });

  it('short-circuits a zero-row read', async () => {
    expect(await genericLeaderboardRows(GENERIC_GAME.id, { take: 0 })).toEqual([]);
    expect(gameStat.findMany).not.toHaveBeenCalled();
  });
});
