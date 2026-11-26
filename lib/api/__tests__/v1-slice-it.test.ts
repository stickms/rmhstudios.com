/**
 * The Slice It! developer API (s15-03): `GET /api/v1/slice-it/charts/{id}`, `/slice-it/players/{handle}` and
 * `/me/slice-it/runs`, driven through the real developer-API wrapper on a schema-checked stand-in Prisma. A private,
 * taken-down or missing song is a 404; a hidden, banned, handle-less or blocked player is a 404; the runs scope is
 * required (and explicit); runs page by keyset without a duplicate; ids are strings; no internal id of another member
 * and no chart notes are ever returned; the raw note-count query names the real table and columns.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

/** Loose on purpose: the stand-in rows and JSON bodies are read field by field. */
type Row = Record<string, ReturnType<typeof JSON.parse>>;
const h = vi.hoisted(() => ({
  scopes: [] as string[],
  keyN: 0,
  hidden: new Set<string>(),
  songs: [] as Row[],
  charts: [] as Row[],
  noteCounts: [] as { id: string; noteCount: number }[],
  reviews: [] as Row[],
  users: [] as Row[],
  blocks: [] as Row[],
  players: [] as Row[],
  bests: [] as Row[],
  runs: [] as Row[],
  boardRows: [] as Row[],
  rawSql: [] as string[],
  wheres: [] as Row[],
}));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'me',
    tier: 'enterprise',
    keyId: `key_${h.keyN}`,
    scopes: h.scopes,
    testMode: false,
    allowedCidrs: [],
    rateLimitPerMinute: null,
  }),
  touchApiKeyLastUsed: () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({ redisRateLimit: async () => null, redisIncrBy: async () => null }));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({ leaderboardHiddenUserIds: async () => h.hidden }));

const publicSong = (s: Row) => s.isPublic === true && s.takenDownAt === null;
const songOf = (id: string) => h.songs.find((s) => s.id === id);

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    song: {
      findFirst: vi.fn(async (a: { where: Row }) => {
        h.wheres.push(a.where);
        return h.songs.find((s) => s.id === a.where.id && publicSong(s) && a.where.isPublic === true) ?? null;
      }),
      findMany: vi.fn(async (a: { where: Row; take: number; skip: number }) => {
        h.wheres.push(a.where);
        return h.songs.filter((s) => publicSong(s)).slice(a.skip, a.skip + a.take);
      }),
      count: vi.fn(async (a: { where: Row }) =>
        a.where.uploadedBy === undefined
          ? h.songs.filter(publicSong).length
          : h.songs.filter((s) => s.uploadedBy === a.where.uploadedBy && publicSong(s)).length,
      ),
    },
    chart: {
      findMany: vi.fn(async (a: { where: Row }) => {
        h.wheres.push(a.where);
        return h.charts.filter((c) => c.songId === a.where.songId && a.where.status.in.includes(c.status));
      }),
    },
    chartReview: {
      aggregate: vi.fn(async (a: { where: Row }) => {
        h.wheres.push(a.where);
        const rows = h.reviews.filter((r) => r.songId === a.where.chart.songId);
        const avg = (k: string) => (rows.length ? rows.reduce((n, r) => n + r[k], 0) / rows.length : null);
        return { _count: { _all: rows.length }, _avg: { fit: avg('fit'), fun: avg('fun') } };
      }),
    },
    user: {
      findUnique: vi.fn(async (a: { where: { handle: string } }) => {
        const u = h.users.find((x) => x.handle === a.where.handle);
        return u ? { profile: null, inventory: [], isVerified: false, isAdmin: false, isBot: false, ...u } : null;
      }),
    },
    userBlock: {
      findFirst: vi.fn(
        async (a: { where: { OR: { blockerId: string; blockedId: string }[] } }) =>
          h.blocks.find((b) => a.where.OR.some((o) => o.blockerId === b.blockerId && o.blockedId === b.blockedId)) ??
          null,
      ),
    },
    player: {
      findUnique: vi.fn(async (a: { where: { userId: string } }) => {
        const p = h.players.find((x) => x.userId === a.where.userId);
        return p ? { totalScore: p.totalScore, gamesPlayed: p.gamesPlayed } : null;
      }),
    },
    songLeaderboard: {
      findMany: vi.fn(async (a: { where: Row; take: number }) => {
        h.wheres.push(a.where);
        if (a.where.songId) return h.boardRows;
        return h.bests
          .filter((b) => b.userId === a.where.userId && publicSong(songOf(b.song.id) as Row))
          .sort((x, y) => y.score - x.score)
          .slice(0, a.take);
      }),
    },
    sliceRun: {
      findMany: vi.fn(async (a: { where: Row; take: number }) => {
        h.wheres.push(a.where);
        let rows = h.runs.filter((r) => r.userId === a.where.userId);
        if (a.where.songId) rows = rows.filter((r) => r.songId === a.where.songId);
        const or = a.where.OR as [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: bigint } }] | undefined;
        if (or) {
          const [before, tie] = or;
          rows = rows.filter(
            (r) =>
              r.createdAt.getTime() < before.createdAt.lt.getTime() ||
              (r.createdAt.getTime() === tie.createdAt.getTime() && r.id < tie.id.lt),
          );
        }
        rows = rows.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (x.id < y.id ? 1 : -1));
        return rows.slice(0, a.take);
      }),
    },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      h.rawSql.push(strings.join('?'));
      return h.noteCounts;
    }),
  }),
}));

const chartMod = await import('@/app/routes/api/v1/slice-it/charts/$id');
const playerMod = await import('@/app/routes/api/v1/slice-it/players/$handle');
const runsMod = await import('@/app/routes/api/v1/me/slice-it/runs');
const listMod = await import('@/app/routes/api/v1/slice-it/charts');
const boardMod = await import('@/app/routes/api/v1/slice-it/leaderboard');
const LIST = handlersOf<TestHandler>(listMod.Route).GET!;
const BOARD = handlersOf<TestHandler>(boardMod.Route).GET!;
const CHART = handlersOf<TestHandler>(chartMod.Route).GET!;
const PLAYER = handlersOf<TestHandler>(playerMod.Route).GET!;
const RUNS = handlersOf<TestHandler>(runsMod.Route).GET!;

const base = 'https://rmhstudios.com/api/v1';
const getChart = (id: string) => CHART({ request: new Request(`${base}/slice-it/charts/${id}`), params: { id } });
const getPlayer = (handle: string) =>
  PLAYER({ request: new Request(`${base}/slice-it/players/${handle}`), params: { handle } });
const getRuns = (query = '') => RUNS({ request: new Request(`${base}/me/slice-it/runs${query}`), params: {} });
const bodyOf = async (res: Response): Promise<Row> => {
  const body = (await res.json()) as Row;
  assertJsonSafe(body);
  return body;
};

const T0 = Date.UTC(2026, 10, 1);
const song = (id: string, over: Row = {}): Row => ({
  id,
  title: `Song ${id}`,
  artist: 'Ada',
  album: null,
  duration: 120,
  bpm: 140,
  genre: 'electronic',
  tags: ['chiptune'],
  chartRating: 7.5,
  plays: 10,
  createdAt: new Date(T0),
  _count: { likes: 2, scores: 3 },
  isPublic: true,
  takenDownAt: null,
  uploadedBy: 'ada-id',
  ...over,
});
const best = (userId: string, songId: string, score: number, over: Row = {}): Row => ({
  userId,
  score,
  accuracy: 0.95,
  difficulty: 'hard',
  modPool: 'none',
  cleared: true,
  isFullCombo: false,
  isPerfect: false,
  createdAt: new Date(T0 + score),
  song: { id: songId, title: `Song ${songId}`, artist: 'Ada' },
  ...over,
});
const run = (id: number, userId: string, minute: number, over: Row = {}): Row => ({
  id: BigInt(id),
  userId,
  songId: 's1',
  chartId: null,
  score: 1000 + id,
  accuracy: 0.9,
  maxCombo: 50,
  difficulty: 'normal',
  modPool: 'none',
  cleared: true,
  isFullCombo: false,
  isPerfect: false,
  createdAt: new Date(T0 + minute * 60_000),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.keyN++;
  h.scopes = ['read:slice-it'];
  h.hidden = new Set();
  h.rawSql = [];
  h.wheres = [];
  h.songs = [
    song('s1'),
    song('s-private', { isPublic: false }),
    song('s-down', { isPublic: false, takenDownAt: new Date(T0) }),
  ];
  h.charts = [
    { id: 'c-expert', songId: 's1', status: 'public', difficulty: 'expert', chartHash: 'h'.repeat(64) },
    { id: 'c-draft', songId: 's1', status: 'draft', difficulty: 'easy', chartHash: 'd'.repeat(64) },
    { id: 'c-normal', songId: 's1', status: 'ranked', difficulty: 'normal', chartHash: 'n'.repeat(64) },
  ];
  h.noteCounts = [
    { id: 'c-expert', noteCount: 1184 },
    { id: 'c-normal', noteCount: 400 },
  ];
  h.reviews = [
    { songId: 's1', fit: 5, fun: 4 },
    { songId: 's1', fit: 4, fun: 4 },
    { songId: 's1', fit: 4, fun: 3 },
  ];
  h.users = [
    { id: 'ada-id', handle: 'ada', name: 'Ada', username: 'ada', image: null, bannedUntil: null },
    {
      id: 'ban-id',
      handle: 'banned',
      name: 'Ban',
      username: 'ban',
      image: null,
      bannedUntil: new Date(Date.now() + 1e9),
    },
    {
      id: 'ex-id',
      handle: 'expired',
      name: 'Ex',
      username: 'ex',
      image: null,
      bannedUntil: new Date(Date.now() - 1e9),
    },
    { id: 'nohandle-id', handle: null, name: 'No', username: 'no', image: null, bannedUntil: null },
    { id: 'me', handle: 'me', name: 'Me', username: 'me', image: null, bannedUntil: null },
  ];
  h.blocks = [];
  h.players = [{ userId: 'ada-id', totalScore: 5000, gamesPlayed: 9 }];
  h.bests = [
    best('ada-id', 's1', 900),
    best('ada-id', 's-private', 9999),
    best('ada-id', 's-down', 9998),
    best('ada-id', 's1', 500, { isFullCombo: true }),
  ];
  h.runs = [];
  h.boardRows = [];
});

describe('the scopes', () => {
  it('read:slice-it opens the chart and player reads, and a key without it gets 403', async () => {
    h.scopes = ['read:slice-it'];
    expect((await getChart('s1')).status).toBe(200);
    expect((await getPlayer('ada')).status).toBe(200);
    h.scopes = ['read:leaderboards'];
    expect((await getChart('s1')).status).toBe(403);
    expect((await getPlayer('ada')).status).toBe(403);
  });

  it('read:slice-it does not open your runs, and `*` and `read:*` do not either: only the scope by name does', async () => {
    h.runs = [run(1, 'me', 1)];
    for (const scopes of [['read:slice-it'], ['*'], ['read:*']]) {
      h.scopes = scopes;
      h.keyN++;
      expect((await getRuns()).status, scopes.join()).toBe(403);
    }
    h.scopes = ['read:slice-it-runs'];
    h.keyN++;
    expect((await getRuns()).status).toBe(200);
  });
});

describe('the two routes that already shipped (additive only)', () => {
  it('GET /slice-it/charts keeps its body byte for byte, and is held privately for 30 seconds', async () => {
    const res = await LIST({ request: new Request(`${base}/slice-it/charts`), params: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30');
    // The literal body the route sent before the shared mapper, key order included.
    const s1 = h.songs[0]!;
    const before = {
      data: [
        {
          id: s1.id,
          title: s1.title,
          artist: s1.artist,
          album: s1.album,
          duration: s1.duration,
          bpm: s1.bpm,
          genre: s1.genre,
          tags: s1.tags,
          rating: s1.chartRating,
          plays: s1.plays,
          likes: s1._count.likes,
          scores: s1._count.scores,
          createdAt: s1.createdAt.toISOString(),
        },
      ],
      meta: { total: 1, limit: 25, offset: 0 },
    };
    expect(await res.text()).toBe(JSON.stringify(before));
  });

  it('GET /slice-it/leaderboard keeps its body, null player and accuracy included, and is held privately', async () => {
    h.boardRows = [
      {
        score: 900,
        maxCombo: 40,
        accuracy: null,
        cleared: true,
        createdAt: new Date(T0),
        user: { handle: null, username: null },
      },
    ];
    const res = await BOARD({ request: new Request(`${base}/slice-it/leaderboard?songId=s1`), params: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30');
    expect(await res.text()).toBe(
      JSON.stringify({
        song: { id: 's1', title: 'Song s1', artist: 'Ada' },
        difficulty: 'normal',
        modPool: 'none',
        data: [
          {
            rank: 1,
            player: null,
            score: 900,
            maxCombo: 40,
            accuracy: null,
            cleared: true,
            achievedAt: new Date(T0).toISOString(),
          },
        ],
      }),
    );
  });
});

describe('GET /slice-it/charts/{id}', () => {
  it('returns the song, its published charts with note counts and revisions, and the review averages', async () => {
    const res = await getChart('s1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30');
    const { data } = await bodyOf(res);
    expect(data).toMatchObject({
      id: 's1',
      title: 'Song s1',
      rating: 7.5,
      likes: 2,
      scores: 3,
      createdAt: new Date(T0).toISOString(),
      reviews: { count: 3, fit: 4.33, fun: 3.67 },
    });
    // Only the published charts (public and ranked), and never a draft; no notes anywhere.
    expect(data.charts).toEqual(
      expect.arrayContaining([
        { id: 'c-expert', difficulty: 'expert', noteCount: 1184, revision: 'h'.repeat(64) },
        { id: 'c-normal', difficulty: 'normal', noteCount: 400, revision: 'n'.repeat(64) },
      ]),
    );
    expect(data.charts).toHaveLength(2);
    expect(JSON.stringify(data)).not.toMatch(/notes"|analysisData|audioUrl|uploadedBy/);
  });

  it('has null review averages and a zero count when nobody reviewed it', async () => {
    h.reviews = [];
    const { data } = await bodyOf(await getChart('s1'));
    expect(data.reviews).toEqual({ count: 0, fit: null, fun: null });
  });

  it('a private, a taken-down and a missing song are the same 404', async () => {
    const bodies = [];
    for (const id of ['s-private', 's-down', 'nope']) {
      const res = await getChart(id);
      expect(res.status, id).toBe(404);
      bodies.push(JSON.stringify((await bodyOf(res)).error.message));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('counts notes in Postgres, on the real table and quoted columns', async () => {
    await getChart('s1');
    expect(h.rawSql).toHaveLength(1);
    const sql = h.rawSql[0]!;
    expect(sql).toContain('FROM "Chart"');
    expect(sql).toContain('jsonb_array_length("notes")');
    expect(sql).toContain('"songId" = ?');
    expect(sql).toContain("\"status\" IN ('public', 'ranked')");
    const schema = readFileSync(join(process.cwd(), 'prisma/schema/games/slice-it.prisma'), 'utf8');
    const chartModel = schema.slice(schema.indexOf('model Chart {'), schema.indexOf('model SliceNoteStat'));
    expect(chartModel).not.toMatch(/@@map/);
    for (const col of ['songId', 'status', 'notes']) expect(chartModel).toMatch(new RegExp(`\\n\\s+${col}\\s`));
  });
});

describe('GET /slice-it/players/{handle}', () => {
  it('returns the career, the best rows on public songs and the uploads count, with a handle and no id', async () => {
    const res = await getPlayer('ada');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30');
    const { data } = await bodyOf(res);
    expect(data.player).toEqual({ handle: 'ada', name: 'Ada' });
    expect(data.career).toEqual({ totalScore: 5000, gamesPlayed: 9 });
    expect(data.uploads).toBe(1);
    // The private and taken-down songs' rows are not listed, best first, with a lamp.
    expect(data.best.map((b: Row) => [b.songId, b.score, b.lamp])).toEqual([
      ['s1', 900, 'cleared'],
      ['s1', 500, 'fc'],
    ]);
    expect(Object.keys(data.best[0]).sort()).toEqual(
      ['accuracy', 'achievedAt', 'artist', 'difficulty', 'lamp', 'modPool', 'score', 'songId', 'title'].sort(),
    );
    expect(JSON.stringify(data)).not.toContain('ada-id');
  });

  it('has a null career for a member who never played', async () => {
    h.players = [];
    const { data } = await bodyOf(await getPlayer('ada'));
    expect(data.career).toBeNull();
  });

  it('a member hidden from boards, banned now, unknown or with no handle is 404; an expired ban is not', async () => {
    h.hidden = new Set(['ada-id']);
    expect((await getPlayer('ada')).status).toBe(404);
    h.hidden = new Set();
    expect((await getPlayer('banned')).status).toBe(404);
    expect((await getPlayer('expired')).status).toBe(200);
    expect((await getPlayer('nobody')).status).toBe(404);
    // A member id is not a handle: it never resolves.
    expect((await getPlayer('ada-id')).status).toBe(404);
  });

  it('a member who turned leaderboards off is 404 from their own row, even when the shared set missed them', async () => {
    h.users = h.users.map((u) =>
      u.id === 'ada-id'
        ? {
            ...u,
            profile: { displayName: null, customImage: null, hideCountsOnMine: false, hideFromLeaderboards: true },
          }
        : u,
    );
    expect(h.hidden.has('ada-id')).toBe(false);
    expect((await getPlayer('ada')).status).toBe(404);
  });

  it('answers 404 when the key owner and the player block each other, in either direction', async () => {
    h.blocks = [{ blockerId: 'me', blockedId: 'ada-id' }];
    expect((await getPlayer('ada')).status).toBe(404);
    h.blocks = [{ blockerId: 'ada-id', blockedId: 'me' }];
    expect((await getPlayer('ada')).status).toBe(404);
    h.blocks = [{ blockerId: 'someone', blockedId: 'ada-id' }];
    expect((await getPlayer('ada')).status).toBe(200);
  });
});

describe('GET /me/slice-it/runs', () => {
  beforeEach(() => {
    h.scopes = ['read:slice-it-runs'];
    h.runs = [
      run(1, 'me', 1),
      run(2, 'me', 2),
      // Two runs in the same minute: the id breaks the tie.
      run(3, 'me', 3, { songId: 's2', isFullCombo: true }),
      run(4, 'me', 3, { chartId: 'c-expert', isPerfect: true }),
      run(5, 'other', 4),
    ];
  });

  it('lists only the owner’s runs, newest first, with string ids and lamps, never cached', async () => {
    const res = await getRuns();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await bodyOf(res);
    expect(body.data.map((r: Row) => r.id)).toEqual(['4', '3', '2', '1']);
    expect(body.nextCursor).toBeNull();
    expect(body.data[0]).toEqual({
      id: '4',
      songId: 's1',
      chartId: 'c-expert',
      score: 1004,
      accuracy: 0.9,
      maxCombo: 50,
      difficulty: 'normal',
      modPool: 'none',
      lamp: 'perfect',
      cleared: true,
      fullCombo: false,
      perfect: true,
      playedAt: new Date(T0 + 3 * 60_000).toISOString(),
    });
    expect(body.data[1].lamp).toBe('fc');
    expect(typeof body.data[0].id).toBe('string');
  });

  it('pages by keyset with no duplicate and no gap, ties on the same instant included', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) {
      const res = await getRuns(`?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      const body = await bodyOf(res);
      seen.push(...body.data.map((r: Row) => r.id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(['4', '3', '2', '1']);
  });

  it('filters by songId', async () => {
    const body = await bodyOf(await getRuns('?songId=s2'));
    expect(body.data.map((r: Row) => r.id)).toEqual(['3']);
  });

  it('refuses a bad limit, a bad cursor and a cursor that was not issued here, as 400 and never cached', async () => {
    for (const q of ['?limit=0', '?limit=51', '?limit=x', '?cursor=%%%', `?cursor=${btoa('abc|def')}`, '?songId=']) {
      const res = await getRuns(q);
      expect(res.status, q).toBe(400);
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    }
  });
});

describe('the stand-in is schema-checked', () => {
  it('rejects a query the schema would', async () => {
    const { prisma } = await import('@/lib/prisma.server');
    expect(() =>
      prisma.sliceRun.findMany({ where: { accuracy: { not: null } }, select: { id: true } } as never),
    ).toThrow(/Query shape rejected/);
  });
});
