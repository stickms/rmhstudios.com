/**
 * Slice It — the skill rating's input after a chart run stopped writing the song's board.
 *
 * `collectContributions` reads the player's RUNS: the best cleared `none`-pool run per ranked, rated chart. The
 * query is what excludes unranked charts, other pools and uncleared runs, so the first test pins its `where`; the
 * rest pin what is done with the rows it returns. In-memory stand-in, no database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as { chartId: string | null; accuracy: number; chart: { rating: number | null } | null }[],
  findMany: vi.fn(),
  songLeaderboardFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    sliceRun: { findMany: h.findMany },
    songLeaderboard: { findMany: h.songLeaderboardFindMany },
  },
}));

import { collectContributions } from '@features/slice-it/engine/rating.server';
import { SKILL_CONTRIBUTION_CAP, contributionOf } from '@features/slice-it/engine/rating';

beforeEach(() => {
  h.rows = [];
  h.findMany.mockReset();
  h.findMany.mockImplementation(async () => h.rows);
  h.songLeaderboardFindMany.mockReset();
});

describe('collectContributions', () => {
  it('reads the player’s runs, not the song board', async () => {
    await collectContributions('user-1');
    expect(h.songLeaderboardFindMany).not.toHaveBeenCalled();
    expect(h.findMany).toHaveBeenCalledTimes(1);
  });

  it('asks only for cleared, none-pool runs on ranked, rated charts', async () => {
    await collectContributions('user-1');
    const [args] = h.findMany.mock.calls[0]! as [{ where: unknown; take: number; orderBy: unknown }];
    expect(args.where).toEqual({
      userId: 'user-1',
      modPool: 'none',
      cleared: true,
      // No accuracy filter or null ordering: `SliceRun.accuracy` is a required column, and Prisma rejects both
      // (`not: null`, `nulls: 'last'`) on one at run time.
      chartId: { not: null },
      chart: { rankStatus: 'ranked', rating: { not: null } },
    });
    // Bounded, and ordered by the chart's rating so the bound drops the least valuable rows.
    expect(args.take).toBe(SKILL_CONTRIBUTION_CAP * 4);
    expect(args.orderBy).toEqual([{ chart: { rating: 'desc' } }, { accuracy: 'desc' }]);
    // One row per chart, so many runs on one chart cannot crowd the others out of the take.
    expect((args as { distinct?: unknown }).distinct).toEqual(['chartId']);
  });

  it('keeps the best run per chart, by contribution', async () => {
    h.rows = [
      { chartId: 'a', accuracy: 0.9, chart: { rating: 10 } },
      { chartId: 'a', accuracy: 0.97, chart: { rating: 10 } },
      { chartId: 'a', accuracy: 0.8, chart: { rating: 10 } },
      { chartId: 'b', accuracy: 0.95, chart: { rating: 6 } },
    ];
    const contributions = await collectContributions('user-1');
    expect(contributions).toHaveLength(2);
    expect(contributions).toContainEqual({ chartRating: 10, accuracy: 0.97 });
    expect(contributions).toContainEqual({ chartRating: 6, accuracy: 0.95 });
    const best = contributions.find((c) => c.chartRating === 10)!;
    expect(contributionOf(best)).toBeGreaterThan(contributionOf({ chartRating: 10, accuracy: 0.9 }));
  });

  it('skips a row with no chart, no chart rating or no accuracy', async () => {
    h.rows = [
      { chartId: null, accuracy: 0.9, chart: { rating: 10 } },
      { chartId: 'a', accuracy: 0.9, chart: { rating: null } },
      { chartId: 'b', accuracy: 0.9, chart: null },
      { chartId: 'c', accuracy: undefined as unknown as number, chart: { rating: 8 } },
      { chartId: 'd', accuracy: 0.9, chart: { rating: 8 } },
    ];
    expect(await collectContributions('user-1')).toEqual([{ chartRating: 8, accuracy: 0.9 }]);
  });

  it('is empty for a player with no ranked chart runs', async () => {
    expect(await collectContributions('user-1')).toEqual([]);
  });
});
