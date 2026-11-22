import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion and the per-game progress tables (sprint 08 20): solo and board rows go, the two profiles whose
 * children are other players' match rows are reset (never deleted), the three match-player name copies read
 * "Deleted user", only private setlists go, kept models are untouched, and the cached daily stats are dropped.
 */

interface Op {
  model: string;
  method: string;
  args: {
    where?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
}

const h = vi.hoisted(() => {
  const raw = vi.fn(async (_s: TemplateStringsArray, ..._v: unknown[]) => 1);
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => ({
          model: name,
          method,
          args,
        }),
      },
    );
  return {
    raw,
    invalidate: vi.fn(async () => undefined),
    prisma: new Proxy(
      {
        $executeRaw: raw,
        $transaction: vi.fn(async (ops: unknown[]) => ops),
      } as Record<string, unknown>,
      {
        get: (t, key: string) => (key in t ? t[key] : model(key)),
      },
    ),
  };
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: h.prisma,
}));
vi.mock('@/lib/cached.server', () => ({
  invalidateCached: h.invalidate,
  invalidateCachedPrefix: vi.fn(async () => undefined),
  cached: vi.fn(),
}));

import { dropGameBoardCaches, gameProgressErasureOps, scrubMatchSnapshots } from '@/lib/account/erasure-games.server';
import { dailyStatsKey } from '@/lib/daily-puzzles/stats.server';
import { anonymizeAccount } from '@/lib/account/deletion.server';

const ops = () => gameProgressErasureOps('user-1') as unknown as Op[];
const on = (list: Op[], model: string) => list.filter((o) => o.model === model);

const ERASED: Array<[string, string]> = [
  ['altairCoopProfile', 'userId'],
  ['altairMetaProgress', 'userId'],
  ['altairSoloRun', 'userId'],
  ['arcadeSeedRun', 'userId'],
  ['canvasCooldown', 'userId'],
  ['connectionsPlay', 'userId'],
  ['dailyPuzzleScore', 'userId'],
  ['gabrielsHornTableRead', 'userId'],
  ['gamePlayStatus', 'userId'],
  ['huntProgress', 'userId'],
  ['ndwLivery', 'userId'],
  ['sliceDailyEntry', 'userId'],
  ['sliceRun', 'userId'],
  ['sliceSetlist', 'ownerId'],
  ['songPlay', 'userId'],
  ['templeOfJoySave', 'userId'],
  ['tf2HudUserBlob', 'userId'],
  ['versecraftProgress', 'userId'],
  ['versecraftSave', 'userId'],
  ['rmhTypeDailyEntry', 'userId'],
  ['rmhTypeKeyStat', 'userId'],
  ['rmhTypeLessonProgress', 'userId'],
];

describe('gameProgressErasureOps', () => {
  it.each(ERASED)('%s: one deleteMany on the member column', (model, column) => {
    const rows = on(ops(), model);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.method).toBe('deleteMany');
    expect(rows[0]!.args.where).toMatchObject({
      [column]: 'user-1',
    });
  });

  it('deletes only private Slice It setlists', () => {
    expect(on(ops(), 'sliceSetlist')[0]!.args.where).toEqual({
      ownerId: 'user-1',
      isPublic: false,
    });
  });

  it('never deletes a profile that has match-player children, only resets it', () => {
    for (const model of ['rMHboxProfile', 'rmhTypeProfile']) {
      const rows = on(ops(), model);
      expect(rows.map((r) => r.method)).toEqual(['updateMany']);
      expect(rows[0]!.args.where).toEqual({
        userId: 'user-1',
      });
    }
    const box = on(ops(), 'rMHboxProfile')[0]!.args.data!;
    expect(box).toMatchObject({
      totalGamesPlayed: 0,
      totalWins: 0,
      totalScore: 0,
      minigameStats: {},
    });
    const type = on(ops(), 'rmhTypeProfile')[0]!.args.data!;
    expect(type).toMatchObject({
      bestWpm: 0,
      totalGamesPlayed: 0,
      bestStreak: 0,
    });
  });

  it('renames the member inside the RMHBox match results snapshot, only in their own matches', async () => {
    h.raw.mockClear();
    await scrubMatchSnapshots('user-1');
    const call = h.raw.mock.calls[0]!;
    const args = {
      sql: call[0].join('?'),
      values: call.slice(1),
    };
    expect(args.sql).toContain('"rmhbox_match"');
    expect(args.sql).toContain('"rmhbox_match_player"');
    // The snapshot is the rankings in order: the rebuilt array keeps each entry's position.
    expect(args.sql).toContain('WITH ORDINALITY');
    expect(args.sql).toContain('ORDER BY e.ord');
    // The member's id, the name twice (with and without an avatar to clear), then the id again for the match filter.
    expect(args.values).toEqual(['user-1', 'Deleted user', 'Deleted user', 'user-1']);
    expect(args.sql).toContain('{avatarUrl}');
  });

  it('renames the three match-player name copies by userId and deletes none', () => {
    for (const model of ['altairMatchPlayer', 'rMHboxMatchPlayer', 'rmhTypeMatchPlayer']) {
      const rows = on(ops(), model);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.method).toBe('updateMany');
      expect(rows[0]!.args.where).toEqual({
        userId: 'user-1',
      });
      expect(rows[0]!.args.data).toEqual({
        userName: 'Deleted user',
      });
    }
  });

  it('does not touch kept models or the shared match rows', () => {
    const touched = new Set(ops().map((o) => o.model));
    for (const kept of ['connectionsGrid', 'song', 'altairMatch', 'rMHboxMatch', 'rmhTypeMatch', 'tf2HudBlob']) {
      expect(touched.has(kept), kept).toBe(false);
    }
  });

  it('is wired into anonymizeAccount, and the cache drop runs after it with the member key', async () => {
    h.invalidate.mockClear();
    await anonymizeAccount('user-1');
    const tx = (h.prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    expect(on(tx, 'versecraftSave')).toHaveLength(1);
    expect(on(tx, 'rMHboxProfile')[0]!.method).toBe('updateMany');
    expect(h.invalidate).toHaveBeenCalledWith(dailyStatsKey('user-1'));
  });

  it('dropGameBoardCaches drops the keyed stats entry only', async () => {
    h.invalidate.mockClear();
    await dropGameBoardCaches('user-9');
    expect(h.invalidate).toHaveBeenCalledTimes(1);
    expect(h.invalidate).toHaveBeenCalledWith('daily-puzzles:stats:user-9');
  });
});
