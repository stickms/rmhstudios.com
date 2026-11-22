/**
 * "Hide me from leaderboards" on every board (sprint 09 #07): each reader that can be driven in-process against an
 * in-memory Prisma leaves a hidden member out, closes the ranks up, and (where it shows one) keeps the member's own
 * place. The hidden set is read through the real `leaderboardHiddenUserIds`, so these also show that the readers
 * and the helper agree. The registry and the source scan are `board-privacy-paths.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  calls: [] as { model: string; op: string; args: unknown }[],
}));

const OPERATORS = ['notIn', 'in', 'not', 'gt', 'gte', 'lt', 'lte', 'equals'];

function test(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
    return cond instanceof Date ? (value as Date)?.getTime() === cond.getTime() : value === cond;
  }
  const c = cond as Record<string, unknown>;
  if (!OPERATORS.some((k) => k in c)) {
    // A relation filter: the fake keeps no relations, so it does not narrow.
    return true;
  }
  const num = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number));
  if ('notIn' in c && (c.notIn as unknown[]).includes(value)) return false;
  if ('in' in c && !(c.in as unknown[]).includes(value)) return false;
  if ('not' in c && (c.not === null ? value === null || value === undefined : value === c.not)) return false;
  if ('gt' in c && !(num(value) > num(c.gt))) return false;
  if ('gte' in c && !(num(value) >= num(c.gte))) return false;
  if ('lt' in c && !(num(value) < num(c.lt))) return false;
  if ('lte' in c && !(num(value) <= num(c.lte))) return false;
  return true;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w));
    // A compound unique key (`userId_date: { userId, date }`) names several columns at once.
    if (key.includes('_') && cond !== null && typeof cond === 'object' && !OPERATORS.some((k) => k in (cond as Row))) {
      return Object.entries(cond as Row).every(([field, value]) => row[field] === value);
    }
    return test(row[key], cond);
  });
}

function sorted(rows: Row[], orderBy: unknown): Row[] {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Record<string, unknown>[];
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const [field, dir] = Object.entries(k)[0] as [string, unknown];
      const way = (typeof dir === 'object' ? (dir as { sort: string }).sort : dir) === 'desc' ? -1 : 1;
      const av = a[field] as number;
      const bv = b[field] as number;
      if (av === bv) continue;
      return av < bv ? -way : way;
    }
    return 0;
  });
}

function model(name: string) {
  const rows = () => db.tables[name] ?? [];
  const find = (args: { where?: Row; orderBy?: unknown; take?: number; skip?: number } = {}) => {
    db.calls.push({ model: name, op: 'findMany', args });
    const out = sorted(
      rows().filter((r) => matches(r, args.where)),
      args.orderBy,
    ).slice(args.skip ?? 0);
    return out.slice(0, args.take ?? out.length);
  };
  return {
    findMany: async (args?: Parameters<typeof find>[0]) => find(args),
    findFirst: async (args?: Parameters<typeof find>[0]) => find({ ...args, take: 1 })[0] ?? null,
    findUnique: async (args: { where: Row }) => find({ where: args.where })[0] ?? null,
    count: async (args?: { where?: Row }) => rows().filter((r) => matches(r, args?.where)).length,
    groupBy: async (args: { where?: Row; by: string[]; _sum: Row; orderBy?: unknown; take?: number }) => {
      const key = args.by[0];
      const totals = new Map<unknown, number>();
      for (const r of rows().filter((x) => matches(x, args.where)))
        totals.set(r[key], (totals.get(r[key]) ?? 0) + (r.amount as number));
      const out = [...totals.entries()]
        .map(([k, total]) => ({ [key]: k, _sum: { amount: total } }))
        .sort((a, b) => b._sum.amount - a._sum.amount);
      return out.slice(0, args.take ?? out.length);
    },
  };
}

vi.mock('@/lib/prisma.server', () => {
  const prisma = new Proxy({}, { get: (_t, name: string) => model(name) });
  return { prisma, prismaRead: prisma };
});
// The boards read straight through (no cache hit hides a filter); the rest of the module is the real one.
vi.mock('@/lib/cached.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cached.server')>()),
  cached: async (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: async () => undefined,
  invalidateTag: async () => undefined,
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () =>
        db.tables.__viewer?.[0] ? { user: { id: db.tables.__viewer[0].id }, session: {} } : null,
    },
  },
}));
vi.mock('@/lib/ai/text.server', () => ({ aiChat: vi.fn(), isAITextConfigured: () => false }));
vi.mock('@/lib/game/results.server', () => ({ reportGameResult: vi.fn() }));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));

import { getLadder } from '@/lib/ranked/season.server';
import { seasonFor } from '@/lib/ranked/season';
import { getPickem } from '@/lib/competitive/pickem.server';
import { getSeasonBoard } from '@/lib/forecasting/forecasting.server';
import { getTopContributors } from '@/lib/communities/contributors.server';
import { huntLeaderboard } from '@/lib/delight/hunt.server';
import { board as arcadeBoard } from '@/lib/arcade/runs.server';
import { dailyBoard, getDailyState } from '@features/slice-it/engine/daily.server';
import { getDailyBoard } from '@/lib/rmhtype/daily.server';
import { getTrickOfTheWeek } from '@/lib/trick-week/trick-week.server';
import { previousWeekKey, weekKey } from '@/lib/trick-week/trick-week';
import { arcadeDayKey } from '@/lib/quests/arcade';
import { dayKey } from '@/lib/rmhtype/daily';

const person = (id: string) => ({ id, name: id, username: id, handle: id, image: null, profile: null, inventory: [] });

/** Three members, `b` in the middle, who turned the switch on. `c` is also banned in one test. */
function seed(extra: Record<string, Row[]> = {}) {
  db.calls = [];
  db.tables = {
    userProfile: [{ userId: 'b', hideFromLeaderboards: true }],
    user: ['a', 'b', 'c'].map((id) => ({ ...person(id), bannedUntil: null })),
    ...extra,
  };
}

const withUser = (rows: Row[]) => rows.map((r) => ({ ...r, user: person(r.userId as string) }));

beforeEach(() => seed());

describe('ranked ladder', () => {
  it('leaves the hidden member out and closes the ranks up', async () => {
    seed({
      rankedSeasonRating: ['a', 'b', 'c'].map((userId, i) => ({
        userId,
        game: 'chess',
        season: seasonFor(new Date(0)),
        placementsLeft: 0,
        rating: 1500 - i * 100,
        wins: 1,
        losses: 0,
        draws: 0,
        lastPlayedAt: new Date(),
      })),
    });
    const ladder = await getLadder('chess', 10, new Date(0));
    expect(ladder.entries.map((e) => e.userId)).toEqual(['a', 'c']);
  });
});

describe("pick'em standings", () => {
  it('drops the hidden member before the cut and keeps their own card', async () => {
    seed({
      tournament: [{ id: 't1', format: 'SINGLE_ELIM', status: 'COMPLETE' }],
      bracketPick: [
        { userId: 'a', role: 'CHAMPION', entrantId: 'e1', tournamentId: 't1', entrant: { placement: 1 } },
        { userId: 'b', role: 'CHAMPION', entrantId: 'e1', tournamentId: 't1', entrant: { placement: 1 } },
        { userId: 'c', role: 'SEMI', entrantId: 'e1', tournamentId: 't1', entrant: { placement: 1 } },
      ],
    });
    const data = await getPickem('t1', 'b');
    expect(data?.leaderboard.map((r) => r.user?.id)).toEqual(['a', 'c']);
    expect(data?.mine).toEqual([{ role: 'CHAMPION', entrantId: 'e1' }]);
  });
});

describe('forecasting season board', () => {
  it('drops the hidden member after the cache read and keeps the order', async () => {
    seed({
      predictionSeason: [
        { id: 's1', title: 'S', startsAt: new Date(0), endsAt: new Date(1), markets: [{ predictionId: 'p1' }] },
      ],
      prediction: [{ id: 'p1', status: 'RESOLVED_YES' }],
      predictionPosition: [
        { userId: 'a', predictionId: 'p1', lastP: 0.9, yesShares: 1, noShares: 0, spent: 1 },
        { userId: 'b', predictionId: 'p1', lastP: 0.8, yesShares: 1, noShares: 0, spent: 1 },
        { userId: 'c', predictionId: 'p1', lastP: 0.7, yesShares: 1, noShares: 0, spent: 1 },
      ],
    });
    const board = await getSeasonBoard('s1');
    expect(board?.leaderboard.map((r) => r.userId)).toEqual(['a', 'c']);
  });
});

describe('community contributors', () => {
  it('drops the hidden member and keeps the list full', async () => {
    seed({
      communityContributorScore: withUser(
        ['a', 'b', 'c'].map((userId, i) => ({
          communityId: 'c1',
          userId,
          score: 30 - i,
          starPosts: 1,
          challengeWins: 0,
        })),
      ),
      communityMember: [],
    });
    const top = await getTopContributors('c1');
    expect(top.map((t) => t.user.id)).toEqual(['a', 'c']);
    expect(top[0]).not.toHaveProperty('userId');
  });
});

describe('the hunt', () => {
  it('leaves the hidden finisher out before the cut', async () => {
    seed({
      hunt: [{ id: 'h1', active: true, title: 'Hunt', _count: { clues: 3 } }],
      huntProgress: withUser(['a', 'b', 'c'].map((userId, i) => ({ huntId: 'h1', userId, durationMs: 1000 + i }))),
    });
    const result = await huntLeaderboard();
    expect(result?.rows.map((r) => r.user.id)).toEqual(['a', 'c']);
  });
});

describe('arcade seeded boards', () => {
  it('leaves the hidden member out', async () => {
    seed({
      arcadeSeedRun: withUser(
        ['a', 'b', 'c'].map((userId, i) => ({
          kind: 'daily',
          gameId: 'g',
          seedKey: 'k',
          userId,
          score: 100 - i,
          finishedAt: new Date(i),
        })),
      ),
    });
    const rows = await arcadeBoard('daily', 'g', 'k', 10);
    expect(rows.map((r) => [r.userId, r.rank])).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
  });
});

describe('Slice It daily', () => {
  const day = arcadeDayKey();
  const entries = () =>
    withUser(
      ['a', 'b', 'c'].map((userId, i) => ({
        dayKey: day,
        userId,
        score: 900 - i * 100,
        accuracy: 0.9,
        maxCombo: 10,
        cleared: true,
        createdAt: new Date(i),
      })),
    );

  it('leaves the hidden member off the board', async () => {
    seed({ sliceDailyEntry: entries() });
    const rows = await dailyBoard(day);
    expect(rows.map((r) => [r.userId, r.rank])).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
  });

  it('shows the hidden member their own place, counted among listed members only', async () => {
    seed({ sliceDailyEntry: entries(), chart: [], song: [] });
    const state = await getDailyState('b');
    expect(state.board.map((r) => r.userId)).toEqual(['a', 'c']);
    expect(state.entry?.userId).toBe('b');
    // One listed member ranks ahead of b.
    expect(state.myRank).toBe(2);
  });
});

describe('RMHType daily', () => {
  const today = dayKey(new Date());
  const entry = (userId: string, wpm: number) => ({
    userId,
    day: today,
    wpm,
    accuracy: 95,
    timeMs: 1000,
    finishedAt: new Date(wpm),
    startedAt: new Date(0),
    passageId: 'p',
    user: person(userId),
  });

  it('leaves the hidden member out; they see their own row with a rank among listed members', async () => {
    seed({ rmhTypeDailyEntry: [entry('a', 90), entry('b', 80), entry('c', 70)] });
    const asOther = await getDailyBoard('c', today, 'global');
    expect(asOther.rows.map((r) => [r.userId, r.rank])).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
    const asHidden = await getDailyBoard('b', today, 'global');
    expect(asHidden.rows.map((r) => r.userId)).toEqual(['a', 'c']);
    expect(asHidden.me).toMatchObject({ userId: 'b', rank: 2 });
  });
});

describe("Nightrail's trick of the week", () => {
  it('does not feature a hidden author', async () => {
    seed({
      nightrailTrick: ['a', 'b', 'c'].map((authorId, i) => ({
        id: `t-${authorId}`,
        week: previousWeekKey(),
        authorId,
        level: 1,
        score: 10,
        multiplier: 1,
        chain: [],
        votes: 9 - i * 3,
        author: person(authorId),
      })),
    });
    // b has the most votes in this arrangement.
    (db.tables.nightrailTrick as Row[])[1].votes = 20;
    const winner = await getTrickOfTheWeek();
    expect(winner?.id).toBe('t-a');
  });
});

describe('routes', () => {
  it('daily puzzle board', async () => {
    seed({
      dailyPuzzleScore: ['a', 'b', 'c'].map((userId, i) => ({
        userId,
        gameMode: 'alibi',
        dateKey: '2026-11-22',
        score: 100 - i,
        moves: null,
        hintUsed: false,
        dnf: false,
        timeSeconds: null,
        createdAt: new Date(i),
        user: person(userId),
      })),
    });
    const { route } = await import('@/lib/daily-puzzles/api/daily-puzzles.leaderboard.server');
    const res = await handlersOf<TestHandler>(route).GET({
      request: new Request('http://x/api/daily-puzzles/leaderboard?gameMode=alibi&date=2026-11-22'),
      params: {},
    });
    const body = (await res.json()) as { leaderboard: { rank: number; displayName: string }[] };
    expect(body.leaderboard.map((r) => [r.rank, r.displayName])).toEqual([
      [1, 'a'],
      [2, 'c'],
    ]);
  });

  it('tip recipients', async () => {
    seed({
      coinTransaction: [
        { type: 'TIP', amount: 30, recipientId: 'a', createdAt: new Date() },
        { type: 'TIP', amount: 20, recipientId: 'b', createdAt: new Date() },
        { type: 'TIP', amount: 10, recipientId: 'c', createdAt: new Date() },
      ],
    });
    const { route } = await import('@/lib/discovery/api/tips.leaderboard.server');
    const res = await handlersOf<TestHandler>(route).GET({
      request: new Request('http://x/api/tips/leaderboard?range=all'),
      params: {},
    });
    const body = (await res.json()) as { leaders: { user: { id: string }; total: number }[] };
    expect(body.leaders.map((l) => [l.user.id, l.total])).toEqual([
      ['a', 30],
      ['c', 10],
    ]);
  });

  it('nightrail tricks: others do not see a hidden author, the author keeps their own', async () => {
    const tricks = ['a', 'b', 'c'].map((authorId, i) => ({
      id: `t-${authorId}`,
      week: weekKey(),
      authorId,
      level: 1,
      score: 10,
      multiplier: 1,
      chain: [],
      votes: 9 - i,
      author: person(authorId),
    }));
    const { route } = await import('@/lib/trick-week/api/nightrail.tricks.server');
    const get = (viewer: string | null) => {
      seed({ nightrailTrick: tricks, nightrailTrickVote: [], __viewer: viewer ? [{ id: viewer }] : [] });
      return handlersOf<TestHandler>(route).GET({
        request: new Request('http://x/api/nightrail/tricks', { headers: { cookie: 'x.session_token=1' } }),
        params: {},
      });
    };
    const ids = async (viewer: string | null) =>
      ((await (await get(viewer)).json()) as { tricks: { id: string }[] }).tricks.map((t) => t.id);
    expect(await ids('c')).toEqual(['t-a', 't-c']);
    expect(await ids('b')).toEqual(['t-a', 't-b', 't-c']);
  });

  it('doctrine puzzle and reputation boards', async () => {
    seed({
      doctrinePuzzleSubmission: withUser(
        ['a', 'b', 'c'].map((userId, i) => ({ userId, correct: true, score: 100 - i, timeMs: 1, attempts: 1 })),
      ),
      doctrineReputation: withUser(
        ['a', 'b', 'c'].map((userId, i) => ({ userId, totalXp: 300 - i * 10, currentStreak: 1 })),
      ),
    });
    const puzzles = await import('@features/doctrine/api/doctrine.puzzles.leaderboard.server');
    const res = await handlersOf<TestHandler>(puzzles.route).GET({
      request: new Request('http://x/api/doctrine/puzzles/leaderboard'),
      params: {},
    });
    const body = (await res.json()) as { rank: number; userId: string }[];
    expect(body.map((r) => [r.rank, r.userId])).toEqual([
      [1, 'a'],
      [2, 'c'],
    ]);
    const reputation = await import('@features/doctrine/api/doctrine.reputation.leaderboard.server');
    const rep = await handlersOf<TestHandler>(reputation.route).GET({
      request: new Request('http://x/api/doctrine/reputation/leaderboard'),
      params: {},
    });
    const repBody = (await rep.json()) as { rank: number; userId: string }[];
    expect(repBody.map((r) => [r.rank, r.userId])).toEqual([
      [1, 'a'],
      [2, 'c'],
    ]);
  });
});

describe('readers that filter in the query', () => {
  /** The `where` the reader sent to `model.findMany` names the hidden member in a `notIn`. */
  const excludesHidden = (model: string) => {
    const call = db.calls.find((c) => c.model === model && c.op === 'findMany');
    expect(call, `${model}.findMany was not called`).toBeDefined();
    expect(JSON.stringify((call?.args as { where?: unknown }).where)).toContain('"notIn":["b"]');
  };

  it('speedrun boards', async () => {
    seed({
      speedrunCategory: [{ id: 'cat', game: 'g', slug: 's', version: '1', metric: 'time' }],
      speedrunEntry: [],
    });
    const { getBoard } = await import('@/lib/speedrun/speedrun.server');
    await getBoard({ game: 'g', slug: 's' }).catch(() => undefined);
    excludesHidden('speedrunEntry');
  });

  it('replay boards keep the viewer own replays and drop the hidden author for everyone else', async () => {
    seed({ gameReplay: [] });
    const { listReplaysForGame } = await import('@/lib/replays.server');
    const { REPLAYABLE_GAME_IDS } = await import('@/lib/game/replay');
    const game = REPLAYABLE_GAME_IDS[0];
    expect(game).toBeDefined();
    await listReplaysForGame(game, 10, 'c');
    excludesHidden('gameReplay');
    db.calls = [];
    await listReplaysForGame(game, 10, 'b');
    const call = db.calls.find((c) => c.model === 'gameReplay');
    expect(JSON.stringify((call?.args as { where?: unknown }).where)).not.toContain('"b"');
  });
});
