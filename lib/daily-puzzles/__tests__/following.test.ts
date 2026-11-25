/**
 * The friends board of the daily puzzles: the audience is `scopeFilter('friends')` and nothing wider, a hidden,
 * blocked, banned or deleted member is never listed, the viewer always is, and each mode ranks on its own axis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  userId: string;
  gameMode: string;
  dateKey: string;
  score: number;
  moves: number | null;
  hintUsed: boolean | null;
  dnf: boolean | null;
  timeSeconds: number | null;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  bannedUntil: {} as Record<string, Date | null>,
  audience: [] as string[],
  hidden: new Set<string>(),
  blocked: [] as string[],
  scopeFilter: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/game/leaderboard-scope.server', () => ({
  scopeFilter: (...a: unknown[]) => h.scopeFilter(...a),
}));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({
  leaderboardHiddenUserIds: async () => h.hidden,
}));
vi.mock('@/lib/moderation.server', () => ({
  getBlockedAuthorIds: async () => h.blocked,
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { dailyPuzzleScore: { findMany: (...a: unknown[]) => h.findMany(...a) } },
}));

import { followingBoard, followingSummary } from '@/lib/daily-puzzles/following.server';
import { compareForMode, followingBoardQuery, followingSummaryQuery } from '@/lib/daily-puzzles/following-schema';

type Where = {
  gameMode: string | { in: string[] };
  dateKey: string;
  userId: { in: string[] };
  OR: Array<{ userId: string } | { user: { OR: Array<{ bannedUntil: null } | { bannedUntil: { lt: Date } }> } }>;
};
type OrderBy = Array<Record<string, 'asc' | 'desc'>>;

/** A tiny stand-in for the table: applies the `where` and `orderBy` the server sends, so both are under test. */
function fakeFindMany(args: { where: Where; orderBy?: OrderBy; take?: number }) {
  const eligible = (r: Row) =>
    args.where.OR.some((clause) => {
      if ('userId' in clause) return r.userId === clause.userId;
      const until = h.bannedUntil[r.userId] ?? null;
      return until === null || until < new Date();
    });
  const modes = typeof args.where.gameMode === 'string' ? [args.where.gameMode] : args.where.gameMode.in;
  let out = (h.rows as Row[]).filter(
    (r) =>
      modes.includes(r.gameMode) &&
      r.dateKey === args.where.dateKey &&
      args.where.userId.in.includes(r.userId) &&
      eligible(r),
  );
  const order = args.orderBy ?? [];
  out = [...out].sort((a, b) => {
    for (const key of order) {
      const [col, dir] = Object.entries(key)[0] as [keyof Row, 'asc' | 'desc'];
      const av = a[col] as number | boolean | Date | null;
      const bv = b[col] as number | boolean | Date | null;
      if (av === bv) continue;
      // The database sorts NULL last on ascending, first on descending.
      if (av === null) return dir === 'asc' ? 1 : -1;
      if (bv === null) return dir === 'asc' ? -1 : 1;
      const cmp = Number(av) - Number(bv);
      if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
  if (args.take !== undefined) out = out.slice(0, args.take);
  return out.map((r) => ({ ...r, user: { id: r.userId, name: `name-${r.userId}`, username: null, image: null } }));
}

const DAY = '2026-11-23';
let clock = 0;
function row(userId: string, gameMode: string, over: Partial<Row> = {}): Row {
  return {
    userId,
    gameMode,
    dateKey: DAY,
    score: 0,
    moves: null,
    hintUsed: false,
    dnf: false,
    timeSeconds: null,
    createdAt: new Date(2026, 10, 23, 12, 0, ++clock),
    ...over,
  };
}

beforeEach(() => {
  clock = 0;
  h.rows = [];
  h.bannedUntil = {};
  h.hidden = new Set();
  h.blocked = [];
  h.audience = ['me', 'ann', 'bob'];
  h.scopeFilter.mockReset();
  h.scopeFilter.mockImplementation(async () => ({ supported: true, where: {}, audience: h.audience }));
  h.findMany.mockReset();
  h.findMany.mockImplementation(async (args: Parameters<typeof fakeFindMany>[0]) => fakeFindMany(args));
});

const names = async (mode: string) => (await followingBoard('me', mode, DAY)).map((e) => e.displayName);

describe('followingBoard audience', () => {
  it('asks scopeFilter for the friends scope and lists only that audience', async () => {
    h.rows = [
      row('me', 'alibi', { score: 10 }),
      row('ann', 'alibi', { score: 20 }),
      // Follows the viewer, or is followed by the viewer, but is not a mutual: not in the audience.
      row('oneway', 'alibi', { score: 99 }),
      row('stranger', 'alibi', { score: 98 }),
    ];
    expect(await names('alibi')).toEqual(['name-ann', 'name-me']);
    expect(h.scopeFilter).toHaveBeenCalledWith('friends', 'me');
    const where = h.findMany.mock.calls[0]![0].where as Where;
    expect(where.userId.in).toEqual(['me', 'ann', 'bob']);
  });

  it('is only the viewer when the scope has nobody else', async () => {
    h.audience = ['me'];
    h.rows = [row('me', 'alibi', { score: 5 }), row('ann', 'alibi', { score: 9 })];
    expect(await names('alibi')).toEqual(['name-me']);
  });

  it('falls back to the viewer alone when the scope is unsupported', async () => {
    h.scopeFilter.mockResolvedValue({ supported: false, status: 400, reason: 'no' });
    h.rows = [row('me', 'alibi', { score: 5 }), row('ann', 'alibi', { score: 9 })];
    expect(await names('alibi')).toEqual(['name-me']);
  });

  it('leaves out a friend hidden from boards, and keeps the viewer when they are hidden themselves', async () => {
    h.hidden = new Set(['ann', 'me']);
    h.rows = [row('me', 'alibi', { score: 5 }), row('ann', 'alibi', { score: 9 }), row('bob', 'alibi', { score: 7 })];
    const board = await followingBoard('me', 'alibi', DAY);
    expect(board.map((e) => e.displayName)).toEqual(['name-bob', 'name-me']);
    expect(board.find((e) => e.displayName === 'name-me')?.isYou).toBe(true);
  });

  it('leaves out a member blocked in either direction', async () => {
    h.blocked = ['ann'];
    h.rows = [row('me', 'alibi', { score: 5 }), row('ann', 'alibi', { score: 9 }), row('bob', 'alibi', { score: 7 })];
    expect(await names('alibi')).toEqual(['name-bob', 'name-me']);
  });

  it('leaves out a member banned now or deleted (banned until the lock date), but not a lapsed ban', async () => {
    h.bannedUntil = {
      ann: new Date(Date.now() + 86_400_000),
      bob: new Date(Date.now() - 86_400_000),
    };
    h.rows = [row('me', 'alibi', { score: 5 }), row('ann', 'alibi', { score: 9 }), row('bob', 'alibi', { score: 7 })];
    expect(await names('alibi')).toEqual(['name-bob', 'name-me']);
  });

  it('exposes no ids: an entry carries a name, an avatar and the result', async () => {
    h.rows = [row('ann', 'alibi', { score: 9 })];
    const [entry] = await followingBoard('me', 'alibi', DAY);
    expect(Object.keys(entry!).sort()).toEqual(
      ['avatar', 'displayName', 'dnf', 'hintUsed', 'isYou', 'moves', 'rank', 'score', 'solvedAt', 'timeSeconds'].sort(),
    );
  });

  it('reads only the requested mode and day, at most 100 rows', async () => {
    h.rows = [
      row('ann', 'alibi', { score: 9 }),
      row('ann', 'spectrum', { score: 9 }),
      row('ann', 'alibi', { dateKey: '2026-11-22' }),
    ];
    expect(await followingBoard('me', 'alibi', DAY)).toHaveLength(1);
    expect(h.findMany.mock.calls[0]![0].take).toBe(100);
  });
});

describe('followingBoard ranking', () => {
  it('ranks Lights Out by moves ascending with a did-not-finish run last', async () => {
    h.rows = [
      row('me', 'lights-out', { moves: 14 }),
      row('ann', 'lights-out', { moves: 3, dnf: true }),
      row('bob', 'lights-out', { moves: 9 }),
    ];
    const board = await followingBoard('me', 'lights-out', DAY);
    expect(board.map((e) => [e.rank, e.displayName, e.moves, e.dnf])).toEqual([
      [1, 'name-bob', 9, false],
      [2, 'name-me', 14, false],
      [3, 'name-ann', 3, true],
    ]);
  });

  it('ranks GlobeSet by time ascending with a did-not-finish run last and no time after a time', async () => {
    h.rows = [
      row('me', 'globeset', { timeSeconds: 80 }),
      row('ann', 'globeset', { timeSeconds: 20, dnf: true }),
      row('bob', 'globeset', { timeSeconds: 45 }),
    ];
    expect((await followingBoard('me', 'globeset', DAY)).map((e) => e.displayName)).toEqual([
      'name-bob',
      'name-me',
      'name-ann',
    ]);
  });

  it.each(['alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'])(
    'ranks %s by score, highest first',
    async (mode) => {
      h.rows = [row('me', mode, { score: 30 }), row('ann', mode, { score: 80 }), row('bob', mode, { score: 55 })];
      expect((await followingBoard('me', mode, DAY)).map((e) => [e.rank, e.score])).toEqual([
        [1, 80],
        [2, 55],
        [3, 30],
      ]);
    },
  );

  it('breaks a tie by the earlier run', async () => {
    h.rows = [row('me', 'alibi', { score: 50 }), row('ann', 'alibi', { score: 50 })];
    expect(await names('alibi')).toEqual(['name-me', 'name-ann']);
  });
});

describe('compareForMode agrees with the database order', () => {
  const at = (s: number) => new Date(2026, 10, 23, 12, 0, s);
  const mk = (over: Partial<Row>) => ({
    score: 0,
    moves: null,
    dnf: false,
    timeSeconds: null,
    createdAt: at(1),
    ...over,
  });

  it('lights-out: fewer moves first, dnf last', () => {
    const rows = [mk({ moves: 12 }), mk({ moves: 2, dnf: true }), mk({ moves: 5 })];
    expect(rows.sort((a, b) => compareForMode('lights-out', a, b)).map((r) => r.moves)).toEqual([5, 12, 2]);
  });
  it('globeset: less time first, dnf last, no time after a time', () => {
    const rows = [mk({ timeSeconds: null }), mk({ timeSeconds: 9, dnf: true }), mk({ timeSeconds: 30 })];
    expect(rows.sort((a, b) => compareForMode('globeset', a, b)).map((r) => r.timeSeconds)).toEqual([30, null, 9]);
  });
  it('others: more points first', () => {
    const rows = [mk({ score: 1 }), mk({ score: 9 })];
    expect(rows.sort((a, b) => compareForMode('alibi', a, b)).map((r) => r.score)).toEqual([9, 1]);
  });
});

describe('followingSummary', () => {
  it('counts friends per mode, names the best, and reports the viewer separately', async () => {
    h.rows = [
      row('me', 'lights-out', { moves: 20 }),
      row('ann', 'lights-out', { moves: 8 }),
      row('bob', 'lights-out', { moves: 12 }),
      row('ann', 'alibi', { score: 40 }),
      row('bob', 'globeset', { timeSeconds: 70 }),
      row('ann', 'globeset', { timeSeconds: 50 }),
    ];
    const summary = await followingSummary('me', DAY);
    expect(summary.map((m) => m.gameMode)).toEqual([
      'lights-out',
      'alibi',
      'spectrum',
      'outcast',
      'chainlink',
      'impostor',
      'globeset',
    ]);
    const by = Object.fromEntries(summary.map((m) => [m.gameMode, m]));
    expect(by['lights-out']).toMatchObject({
      finished: 2,
      best: { displayName: 'name-ann', moves: 8 },
      you: { moves: 20, dnf: false },
    });
    expect(by['alibi']).toMatchObject({ finished: 1, best: { score: 40 }, you: null });
    expect(by['spectrum']).toMatchObject({ finished: 0, best: null, you: null });
    expect(by['globeset']).toMatchObject({ finished: 2, best: { displayName: 'name-ann', timeSeconds: 50 } });
  });

  it('is one query for all seven modes', async () => {
    await followingSummary('me', DAY);
    expect(h.findMany).toHaveBeenCalledTimes(1);
    const where = h.findMany.mock.calls[0]![0].where as Where;
    expect(typeof where.gameMode === 'object' && where.gameMode.in).toHaveLength(7);
  });

  it('does not count a did-not-finish run as a finish, and never counts the viewer', async () => {
    h.rows = [row('me', 'lights-out', { moves: 4 }), row('ann', 'lights-out', { moves: 1, dnf: true })];
    const [lo] = await followingSummary('me', DAY);
    expect(lo).toMatchObject({ finished: 0, best: null, you: { moves: 4 } });
  });

  it('leaves out hidden, blocked and banned friends, and keeps the viewer when hidden', async () => {
    h.hidden = new Set(['ann', 'me']);
    h.blocked = ['bob'];
    h.audience = ['me', 'ann', 'bob', 'cy'];
    h.bannedUntil = { cy: new Date(Date.now() + 86_400_000) };
    h.rows = ['me', 'ann', 'bob', 'cy'].map((u) => row(u, 'alibi', { score: 10 }));
    const alibi = (await followingSummary('me', DAY)).find((m) => m.gameMode === 'alibi');
    expect(alibi).toMatchObject({ finished: 0, best: null, you: { score: 10 } });
  });
});

describe('query schemas', () => {
  it('accepts a known mode and a real day', () => {
    expect(followingBoardQuery.safeParse({ gameMode: 'lights-out', date: DAY }).success).toBe(true);
    expect(followingSummaryQuery.safeParse({ date: DAY }).success).toBe(true);
  });
  it('refuses an unknown mode, a malformed day and a day that does not exist', () => {
    expect(followingBoardQuery.safeParse({ gameMode: 'chess', date: DAY }).success).toBe(false);
    expect(followingBoardQuery.safeParse({ gameMode: 'alibi', date: '23-11-2026' }).success).toBe(false);
    expect(followingSummaryQuery.safeParse({ date: '2026-02-31' }).success).toBe(false);
  });
});
