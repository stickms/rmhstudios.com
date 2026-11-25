import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The co-op boards, the record and the export (sprint 14 04) against a schema-checked fake: hidden and banned members
 * are left out through `userNotHiddenWhere`, rows are ordered by the indexed column with the id as tie-break, the top
 * ten is cut, and nothing carries a user id.
 */
const h = vi.hoisted(() => ({
  hidden: new Set<string>(),
  coopFindMany: vi.fn(),
  coopFindUnique: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    altairCoopProfile: { findMany: h.coopFindMany, findUnique: h.coopFindUnique },
    altairMatchPlayer: { groupBy: h.groupBy },
  }),
}));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({
  leaderboardHiddenUserIds: vi.fn(async () => h.hidden),
}));

const { coopBoard, exportAltairCoop, getCoopRecord } = await import('../coop-record.server');
const { assertJsonSafe } = await import('@/lib/db/query-shape');

interface Profile {
  id: string;
  userId: string;
  totalCoopWins: number;
  totalRevivesGiven: number;
  totalCoopRuns: number;
  name: string | null;
  handle: string | null;
}

let rows: Profile[] = [];

function profile(id: string, wins: number, revives: number, extra: Partial<Profile> = {}): Profile {
  return {
    id,
    userId: `user-${id}`,
    totalCoopWins: wins,
    totalRevivesGiven: revives,
    totalCoopRuns: wins + 2,
    name: `Name ${id}`,
    handle: null,
    ...extra,
  };
}

beforeEach(() => {
  h.hidden = new Set();
  rows = [];
  h.coopFindMany.mockReset();
  h.coopFindMany.mockImplementation(
    async (args: {
      where: { userId?: { notIn: string[] } };
      orderBy: Array<Record<string, 'asc' | 'desc'>>;
      take: number;
    }) => {
      const out = rows
        .filter((r) => !args.where.userId || !args.where.userId.notIn.includes(r.userId))
        .sort((a, b) => {
          for (const o of args.orderBy) {
            const [key, dir] = Object.entries(o)[0] as [keyof Profile, 'asc' | 'desc'];
            const av = a[key] as number | string;
            const bv = b[key] as number | string;
            if (av === bv) continue;
            const cmp = av < bv ? -1 : 1;
            return dir === 'desc' ? -cmp : cmp;
          }
          return 0;
        })
        .slice(0, args.take);
      return out.map((r) => ({
        totalCoopWins: r.totalCoopWins,
        totalRevivesGiven: r.totalRevivesGiven,
        totalCoopRuns: r.totalCoopRuns,
        user: { name: r.name, handle: r.handle },
      }));
    },
  );
});

describe('coopBoard', () => {
  it('orders coop-wins by wins with the row id as tie-break, and coop-revives by revives given', async () => {
    rows = [profile('b', 5, 1), profile('a', 5, 9), profile('c', 7, 2)];
    const wins = await coopBoard('coop-wins');
    expect(wins.map((r) => r.username)).toEqual(['Name c', 'Name a', 'Name b']);
    const revives = await coopBoard('coop-revives');
    expect(revives.map((r) => r.username)).toEqual(['Name a', 'Name c', 'Name b']);
    const args = h.coopFindMany.mock.calls[0]![0] as { orderBy: unknown };
    expect(args.orderBy).toEqual([{ totalCoopWins: 'desc' }, { id: 'asc' }]);
  });

  it('leaves out hidden and banned members through userNotHiddenWhere, so the next member moves up', async () => {
    rows = [profile('a', 9, 0), profile('b', 8, 0), profile('c', 7, 0)];
    h.hidden = new Set(['user-a']);
    const board = await coopBoard('coop-wins');
    expect(board.map((r) => r.username)).toEqual(['Name b', 'Name c']);
    const args = h.coopFindMany.mock.calls[0]![0] as { where: unknown };
    expect(args.where).toEqual({ userId: { notIn: ['user-a'] }, totalCoopWins: { gt: 0 } });
  });

  it('asks for no filter when nobody is hidden, and cuts the top ten', async () => {
    rows = Array.from({ length: 14 }, (_, i) => profile(String(i).padStart(2, '0'), i, 0));
    const board = await coopBoard('coop-wins');
    expect(board).toHaveLength(10);
    expect(board[0]?.totalCoopWins).toBe(13);
    const args = h.coopFindMany.mock.calls[0]![0] as { where: unknown; take: number };
    expect(args.where).toEqual({ totalCoopWins: { gt: 0 } });
    expect(args.take).toBe(10);
  });

  it('names a member by their name, then handle, and carries no user id', async () => {
    rows = [profile('a', 3, 0, { name: null, handle: 'ace' }), profile('b', 2, 0, { name: null, handle: null })];
    const board = await coopBoard('coop-wins');
    expect(board.map((r) => r.username)).toEqual(['ace', 'Player']);
    for (const entry of board) {
      expect(Object.keys(entry).sort()).toEqual(['totalCoopRuns', 'totalCoopWins', 'totalRevivesGiven', 'username']);
    }
    assertJsonSafe(board);
  });
});

describe('getCoopRecord', () => {
  it('is null with no co-op profile', async () => {
    h.coopFindUnique.mockResolvedValue(null);
    expect(await getCoopRecord('u1')).toBeNull();
    expect(h.groupBy).not.toHaveBeenCalled();
  });

  it('computes the favourite class from the match rows, not the stored column', async () => {
    h.coopFindUnique.mockResolvedValue({
      totalCoopRuns: 8,
      totalCoopWins: 3,
      totalRevivesGiven: 4,
      totalRevivesReceived: 2,
      totalCoopKills: 120,
    });
    h.groupBy.mockResolvedValue([
      { classId: 'first', _count: { _all: 2 }, _max: { createdAt: new Date('2026-01-01') } },
      { classId: 'most', _count: { _all: 5 }, _max: { createdAt: new Date('2026-02-01') } },
    ]);
    const record = await getCoopRecord('u1');
    expect(record).toEqual({
      runs: 8,
      wins: 3,
      winRate: 38,
      revivesGiven: 4,
      revivesReceived: 2,
      kills: 120,
      favouriteClass: 'most',
    });
    expect(h.groupBy).toHaveBeenCalledWith({
      by: ['classId'],
      where: { userId: 'u1' },
      _count: { _all: true },
      _max: { createdAt: true },
    });
  });
});

describe('exportAltairCoop', () => {
  it('is zeros for a member who never played co-op', async () => {
    h.coopFindUnique.mockResolvedValue(null);
    const out = await exportAltairCoop('u1');
    expect(out).toMatchObject({ runs: 0, wins: 0, winRate: 0, favouriteClass: null, coins: 0 });
  });
});
