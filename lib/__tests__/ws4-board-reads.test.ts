/**
 * WS4 — leaderboard page reads are read-only and cached upstream, so they go to
 * `prismaRead`; the rank a player is shown right after submitting (`rankOf`)
 * must still observe their own write, so it stays on the primary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  readGameStat: vi.fn(),
  readLadder: vi.fn(),
  primaryCount: vi.fn(),
  primaryFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: { gameStat: { count: h.primaryCount, findMany: h.primaryFindMany } },
  prismaRead: {
    gameStat: { findMany: h.readGameStat },
    rankedSeasonRating: { findMany: h.readLadder },
  },
}));

import { genericAdapter, genericLeaderboardRows } from '@/lib/game/generic-adapter.server';
import { getLadder } from '@/lib/ranked/season.server';
import { GAME_SCORE_RULES } from '@/lib/game/registry';

const gameId = GAME_SCORE_RULES[0].id;

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  h.readGameStat.mockResolvedValue([]);
  h.readLadder.mockResolvedValue([]);
  h.primaryCount.mockResolvedValue(0);
});

describe('board reads', () => {
  it('the generic leaderboard page reads from prismaRead only', async () => {
    await genericLeaderboardRows(gameId, { take: 10 });
    expect(h.readGameStat).toHaveBeenCalledTimes(1);
    expect(h.primaryFindMany).not.toHaveBeenCalled();
  });

  it('rankOf (rank after your own submit) stays on the primary', async () => {
    const { rankOf } = genericAdapter(gameId);
    expect(rankOf).toBeDefined();
    await rankOf!(10);
    expect(h.primaryCount).toHaveBeenCalledTimes(1);
  });

  it('the seasonal ladder reads from prismaRead', async () => {
    await getLadder('chess', 10);
    expect(h.readLadder).toHaveBeenCalledTimes(1);
  });
});
