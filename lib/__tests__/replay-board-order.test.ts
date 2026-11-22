import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A replay board's direction and its optional puzzle seed. Lights Out stores its move count as the score, so its
 * board lists the fewest first; every other game keeps the highest first. A seed is a filter on the replay's JSON
 * and only Lights Out takes one. Board privacy (the hidden-member and block filters) stays in the `where`.
 */

const db = vi.hoisted(() => ({ args: undefined as unknown }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    gameReplay: {
      findMany: async (args: unknown) => {
        db.args = args;
        return [];
      },
    },
  },
}));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({
  leaderboardHiddenUserIds: async () => new Set(['hidden-1', 'viewer']),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => ['blocked-1'] }));
vi.mock('@/lib/game/adapters.server', () => ({ getGameAdapter: () => undefined }));
vi.mock('@/lib/daily-puzzles/replay.server', () => ({ verifyDailyPuzzle: async () => null }));

import { listReplaysForGame } from '@/lib/replays.server';
import { replayBoardQuery } from '@/lib/game/replay-library-schema';
import { replayableGames } from '@/lib/game/replay';

type Args = { where: Record<string, unknown>; orderBy: unknown; take: number };
const lastArgs = () => db.args as Args;

beforeEach(() => {
  db.args = undefined;
});

describe('replay board order', () => {
  it('lists Lights Out fewest moves first', async () => {
    await listReplaysForGame('lights-out', 10, null);
    expect(lastArgs().orderBy).toEqual([{ score: 'asc' }, { createdAt: 'desc' }]);
  });

  it('keeps score desc for every other replayable game', async () => {
    const others = Object.values(replayableGames).filter((g) => g.game !== 'lights-out');
    expect(others.length).toBeGreaterThan(0);
    for (const g of others) {
      await listReplaysForGame(g.game, 10, null);
      expect(lastArgs().orderBy, g.game).toEqual([{ score: 'desc' }, { createdAt: 'desc' }]);
    }
  });

  it('marks only Lights Out as lower-is-better', () => {
    const lower = Object.values(replayableGames)
      .filter((g) => g.lowerIsBetter)
      .map((g) => g.game);
    expect(lower).toEqual(['lights-out']);
  });
});

describe('the seed filter', () => {
  it('adds the JSON path filter for Lights Out', async () => {
    await listReplaysForGame('lights-out', 3, null, 20261122);
    expect(lastArgs().where.data).toEqual({ path: ['seed'], equals: 20261122 });
    expect(lastArgs().take).toBe(3);
  });

  it('adds no data filter without a seed', async () => {
    await listReplaysForGame('lights-out', 10, null);
    expect(lastArgs().where).not.toHaveProperty('data');
  });

  it('answers nothing, without reading, for a seed on another game', async () => {
    expect(await listReplaysForGame('slice-it', 3, null, 5)).toEqual([]);
    expect(db.args).toBeUndefined();
  });

  it('is accepted by the board query for Lights Out only, as an integer in the schema range', () => {
    expect(replayBoardQuery.safeParse({ game: 'lights-out', seed: '20261122' })).toMatchObject({
      success: true,
      data: { game: 'lights-out', seed: 20261122 },
    });
    expect(replayBoardQuery.safeParse({ game: 'lights-out' }).success).toBe(true);
    expect(replayBoardQuery.safeParse({ game: 'slice-it', seed: '5' }).success).toBe(false);
    expect(replayBoardQuery.safeParse({ game: 'lights-out', seed: '1.5' }).success).toBe(false);
    expect(replayBoardQuery.safeParse({ game: 'lights-out', seed: '-1' }).success).toBe(false);
    expect(replayBoardQuery.safeParse({ game: 'lights-out', seed: '100000000' }).success).toBe(false);
  });
});

describe('board privacy stays in the where', () => {
  it('leaves hidden members (but not the viewer) and blocked authors off, with or without a seed', async () => {
    for (const seed of [undefined, 20261122]) {
      await listReplaysForGame('lights-out', 3, 'viewer', seed);
      const where = lastArgs().where;
      expect(where.userId).toEqual({ notIn: ['blocked-1', 'hidden-1'] });
      expect(where).toMatchObject({ visibility: 'public', score: { not: null } });
      expect(where.user).toEqual({ OR: [{ bannedUntil: null }, { bannedUntil: { lte: expect.any(Date) } }] });
    }
  });
});
