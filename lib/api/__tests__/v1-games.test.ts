/**
 * The v1 games endpoints, driven through the real developer-API wrapper with
 * Prisma mocked: scope enforcement, the playtime privacy rule (hidden is a
 * 404), the key owner being the only member whose achievements are read, secret
 * achievements staying out, and the catalogue listing only public titles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

const db = vi.hoisted(() => ({
  keyRow: {
    current: null as Record<string, unknown> | null,
  },
  user: vi.fn(),
  follow: vi.fn(),
  block: vi.fn(),
  playtime: vi.fn(),
  playtimeDays: vi.fn(),
  achievements: vi.fn(),
  rarity: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    developerApiKey: {
      findUnique: vi.fn(async () => db.keyRow.current),
      update: vi.fn(async () => ({})),
    },
    apiKeyRefusalDaily: {
      upsert: vi.fn(async () => ({})),
    },
    apiIdempotencyKey: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: db.user,
    },
    follow: {
      findFirst: db.follow,
    },
    userBlock: {
      findFirst: db.block,
    },
    gamePlaytime: {
      findMany: db.playtime,
    },
    gamePlaytimeDay: {
      findMany: db.playtimeDays,
    },
    userAchievement: {
      findMany: db.achievements,
    },
    achievementRarity: {
      findMany: db.rarity,
    },
  },
}));
vi.mock('@/lib/entitlements', () => ({
  getUserTier: vi.fn(async () => 'starter'),
  hasApiAccess: () => true,
}));
vi.mock('@/lib/admin-audit.server', () => ({
  getActiveBan: vi.fn(async () => null),
}));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: vi.fn(async () => null),
  redisIncrBy: vi.fn(async () => null),
}));
vi.mock('@/lib/api/usage.server', () => ({
  recordUsage: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
  }),
}));

const catalogRoute = handlersOf<TestHandler>((await import('../../../app/routes/api/v1/games')).Route);
const myGames = handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/games')).Route);
const myDays = handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/games/$gameId/days')).Route);
const myAchievements = handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/achievements')).Route);
const userGames = handlersOf<TestHandler>((await import('../../../app/routes/api/v1/users/$handle/games')).Route);

const OWNER = 'owner_1';
const OTHER = 'member_2';

function keyRecord(over: Record<string, unknown> = {}) {
  return {
    id: 'key_1',
    userId: OWNER,
    revokedAt: null,
    expiresAt: null,
    scopes: ['read:games'],
    testMode: false,
    allowedCidrs: [] as string[],
    rateLimitPerMinute: null,
    ...over,
  };
}

function get(handler: TestHandler, path: string, params: Record<string, string> = {}, secret = 'rmh_live_testsecret') {
  return handler({
    request: new Request(`https://rmhstudios.com${path}`, {
      headers: {
        authorization: `Bearer ${secret}`,
        'cf-connecting-ip': '203.0.113.9',
      },
    }),
    params,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.block.mockReset();
  db.keyRow.current = keyRecord();
});

describe('scope enforcement', () => {
  it.each([
    ['me/games', () => get(myGames.GET, '/api/v1/me/games')],
    [
      'me/games/{id}/days',
      () =>
        get(myDays.GET, '/api/v1/me/games/altair/days', {
          gameId: 'altair',
        }),
    ],
    ['me/achievements', () => get(myAchievements.GET, '/api/v1/me/achievements')],
    [
      'users/{handle}/games',
      () =>
        get(userGames.GET, '/api/v1/users/ada/games', {
          handle: 'ada',
        }),
    ],
  ])('refuses a key without read:games on %s with insufficient_scope', async (_name, call) => {
    db.keyRow.current = keyRecord({
      scopes: ['read:profile'],
    });
    const res = await call();
    expect(res.status).toBe(403);
    expect(res.headers.get('X-Accepted-Scope')).toBe('read:games');
    expect(
      (
        (await res.json()) as {
          error: {
            code: string;
          };
        }
      ).error.code,
    ).toBe('insufficient_scope');
    expect(db.playtime).not.toHaveBeenCalled();
    expect(db.achievements).not.toHaveBeenCalled();
    expect(db.user).not.toHaveBeenCalled();
  });

  it('accepts the read:* wildcard', async () => {
    db.keyRow.current = keyRecord({
      scopes: ['read:*'],
    });
    db.playtime.mockResolvedValue([]);
    db.playtimeDays.mockResolvedValue([]);
    expect((await get(myGames.GET, '/api/v1/me/games')).status).toBe(200);
  });
});

describe('GET /api/v1/games', () => {
  it('works with a key that holds no scope, is cacheable, and lists only public titles', async () => {
    db.keyRow.current = keyRecord({
      scopes: [],
    });
    const res = await get(catalogRoute.GET, '/api/v1/games');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    const body = (await res.json()) as {
      data: {
        id: string;
        href: string;
      }[];
    };
    expect(body.data.length).toBeGreaterThan(5);
    expect(body.data.every((g) => g.href.startsWith('https://rmhstudios.com/'))).toBe(true);
    const { games } = await import('@/lib/catalog');
    const unlisted = games.filter((g) => g.unlisted || !g.href.startsWith('/')).map((g) => g.id);
    for (const id of unlisted) expect(body.data.map((g) => g.id)).not.toContain(id);
  });

  it('still requires a valid key', async () => {
    db.keyRow.current = null;
    expect((await get(catalogRoute.GET, '/api/v1/games')).status).toBe(401);
  });
});

describe('GET /api/v1/me/games', () => {
  it("reads only the key owner's playtime", async () => {
    db.playtime.mockResolvedValue([
      {
        gameId: 'altair',
        totalSeconds: 7200,
        lastPlayedAt: new Date('2026-11-20T10:00:00Z'),
      },
    ]);
    db.playtimeDays.mockResolvedValue([]);
    const res = await get(myGames.GET, '/api/v1/me/games');
    expect(res.status).toBe(200);
    expect(db.playtime.mock.calls[0]?.[0]).toMatchObject({
      where: {
        userId: OWNER,
      },
    });
    expect(db.playtimeDays.mock.calls[0]?.[0]).toMatchObject({
      where: {
        userId: OWNER,
      },
    });
    const body = (await res.json()) as {
      data: {
        gameId: string;
        totalMinutes: number;
      }[];
    };
    expect(body.data).toEqual([
      expect.objectContaining({
        gameId: 'altair',
        totalMinutes: 120,
      }),
    ]);
  });
});

describe('GET /api/v1/me/games/{gameId}/days', () => {
  beforeEach(() => db.playtimeDays.mockResolvedValue([]));

  it('returns a zero-filled range for the owner', async () => {
    db.playtimeDays.mockResolvedValue([
      {
        day: new Date('2026-11-02T00:00:00Z'),
        seconds: 600,
      },
    ]);
    const res = await get(myDays.GET, '/api/v1/me/games/altair/days?from=2026-11-01&to=2026-11-03', {
      gameId: 'altair',
    });
    expect(res.status).toBe(200);
    expect(db.playtimeDays.mock.calls[0]?.[0]).toMatchObject({
      where: {
        userId: OWNER,
        gameId: 'altair',
      },
    });
    expect(await res.json()).toEqual({
      gameId: 'altair',
      from: '2026-11-01',
      to: '2026-11-03',
      data: [
        {
          date: '2026-11-01',
          minutes: 0,
        },
        {
          date: '2026-11-02',
          minutes: 10,
        },
        {
          date: '2026-11-03',
          minutes: 0,
        },
      ],
    });
  });

  it.each([
    ['a ninety-one day range', 'from=2026-01-01&to=2026-04-02'],
    ['a backwards range', 'from=2026-11-03&to=2026-11-01'],
    ['a non-date', 'from=yesterday'],
    ['an impossible date', 'to=2026-02-31'],
  ])('rejects %s with 400 and reads nothing', async (_n, qs) => {
    const res = await get(myDays.GET, `/api/v1/me/games/altair/days?${qs}`, {
      gameId: 'altair',
    });
    expect(res.status).toBe(400);
    expect(db.playtimeDays).not.toHaveBeenCalled();
  });

  it('accepts exactly ninety days', async () => {
    const res = await get(myDays.GET, '/api/v1/me/games/altair/days?from=2026-01-01&to=2026-03-31', {
      gameId: 'altair',
    });
    expect(res.status).toBe(200);
  });

  it('answers 404 for a title that is not in the catalogue', async () => {
    const res = await get(myDays.GET, '/api/v1/me/games/nope/days', {
      gameId: 'nope',
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/users/{handle}/games', () => {
  const mine = [
    {
      gameId: 'altair',
      totalSeconds: 600,
      lastPlayedAt: new Date('2026-11-20T10:00:00Z'),
    },
  ];
  beforeEach(() => {
    db.playtime.mockResolvedValue(mine);
    db.playtimeDays.mockResolvedValue([]);
  });

  async function view(privacy: string | null, follows: boolean) {
    db.user.mockResolvedValue(
      privacy === null
        ? null
        : {
            id: OTHER,
            playtimePrivacy: privacy,
          },
    );
    db.follow.mockResolvedValue(
      follows
        ? {
            id: 'f1',
          }
        : null,
    );
    return get(userGames.GET, '/api/v1/users/@Ada/games', {
      handle: '@Ada',
    });
  }

  it('answers 404 for a banned owner and for a block in either direction', async () => {
    db.block.mockResolvedValue(null);
    db.user.mockResolvedValue({
      id: OTHER,
      playtimePrivacy: 'public',
      bannedUntil: new Date(Date.now() + 86_400_000),
    });
    expect(
      (
        await get(userGames.GET, '/api/v1/users/ada/games', {
          handle: 'ada',
        })
      ).status,
    ).toBe(404);
    db.user.mockResolvedValue({
      id: OTHER,
      playtimePrivacy: 'public',
      bannedUntil: null,
    });
    db.block.mockResolvedValue({
      id: 'b1',
    });
    expect(
      (
        await get(userGames.GET, '/api/v1/users/ada/games', {
          handle: 'ada',
        })
      ).status,
    ).toBe(404);
  });

  it('resolves the handle case-insensitively, without the @', async () => {
    await view('public', false);
    expect(db.user.mock.calls[0]?.[0]).toMatchObject({
      where: {
        handle: 'ada',
      },
    });
  });

  it('shows public playtime and reads the owner of the handle, not the key owner', async () => {
    const res = await view('public', false);
    expect(res.status).toBe(200);
    expect(db.playtime.mock.calls[0]?.[0]).toMatchObject({
      where: {
        userId: OTHER,
      },
    });
  });

  it('answers a private playtime with 404 not_found, never 403', async () => {
    const res = await view('private', true);
    expect(res.status).toBe(404);
    expect(
      (
        (await res.json()) as {
          error: {
            code: string;
          };
        }
      ).error.code,
    ).toBe('not_found');
    expect(db.playtime).not.toHaveBeenCalled();
  });

  it('answers an unknown handle exactly like a hidden one', async () => {
    const hidden = await view('private', false);
    const unknown = await view(null, false);
    expect(unknown.status).toBe(hidden.status);
    const a = (await hidden.json()) as {
      error: {
        code: string;
        message: string;
      };
    };
    const b = (await unknown.json()) as {
      error: {
        code: string;
        message: string;
      };
    };
    expect([b.error.code, b.error.message]).toEqual([a.error.code, a.error.message]);
  });

  it("shows followers-only playtime to a follower's key and hides it from anyone else", async () => {
    expect((await view('followers', true)).status).toBe(200);
    expect((await view('followers', false)).status).toBe(404);
    expect(db.follow.mock.calls[0]?.[0]).toMatchObject({
      where: {
        followerId: OWNER,
        followingId: OTHER,
      },
    });
  });

  it('treats an unrecognised setting as private', async () => {
    expect((await view('everyone', true)).status).toBe(404);
  });

  it('lets the key owner read their own private playtime', async () => {
    db.user.mockResolvedValue({
      id: OWNER,
      playtimePrivacy: 'private',
    });
    const res = await get(userGames.GET, '/api/v1/users/me/games', {
      handle: 'me',
    });
    expect(res.status).toBe(200);
  });

  it('never includes the privacy setting or other private fields', async () => {
    const text = await (await view('public', false)).text();
    expect(text).not.toMatch(/playtimePrivacy|email|userId/);
  });
});

describe('GET /api/v1/me/achievements', () => {
  const unlocked = (id: string, achievementId: string, at: string) => ({
    id,
    achievementId,
    unlockedAt: new Date(at),
  });

  it("reads only the key owner's rows, excludes secret achievements in the query and adds rarity", async () => {
    db.achievements.mockResolvedValue([unlocked('ua2', 'game.altair.first_run', '2026-11-18T19:02:00Z')]);
    db.rarity.mockResolvedValue([
      {
        achievementId: 'game.altair.first_run',
        pct: 0.415,
      },
    ]);
    const res = await get(myAchievements.GET, '/api/v1/me/achievements');
    expect(res.status).toBe(200);
    const where = (
      db.achievements.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      }
    ).where;
    expect(where.userId).toBe(OWNER);
    const { ACHIEVEMENTS } = await import('@/lib/achievements/catalog');
    const secrets = ACHIEVEMENTS.filter((a) => a.secret).map((a) => a.id);
    expect(secrets.length).toBeGreaterThan(0);
    const allowed = (
      where.achievementId as {
        in: string[];
      }
    ).in;
    for (const id of secrets) expect(allowed).not.toContain(id);
    expect(await res.json()).toEqual({
      data: [
        {
          id: 'game.altair.first_run',
          gameId: 'altair',
          title: 'Into the Black',
          unlockedAt: '2026-11-18T19:02:00.000Z',
          rarityPercent: 41.5,
        },
      ],
      nextCursor: null,
    });
  });

  it('drops a secret achievement even if a loosened query returned it', async () => {
    const { ACHIEVEMENTS } = await import('@/lib/achievements/catalog');
    const secret = ACHIEVEMENTS.find((a) => a.secret)!;
    db.achievements.mockResolvedValue([unlocked('ua1', secret.id, '2026-11-19T00:00:00Z')]);
    db.rarity.mockResolvedValue([]);
    const body = (await (await get(myAchievements.GET, '/api/v1/me/achievements')).json()) as {
      data: unknown[];
    };
    expect(body.data).toEqual([]);
  });

  it('paginates with a cursor and a filter by game', async () => {
    db.rarity.mockResolvedValue([]);
    db.achievements.mockResolvedValue([
      unlocked('ua3', 'game.altair.first_run', '2026-11-19T00:00:00Z'),
      unlocked('ua2', 'game.altair.first_victory', '2026-11-18T00:00:00Z'),
    ]);
    const first = (await (await get(myAchievements.GET, '/api/v1/me/achievements?limit=1&gameId=altair')).json()) as {
      data: unknown[];
      nextCursor: string | null;
    };
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const filter = db.achievements.mock.calls[0]?.[0] as {
      where: {
        achievementId: {
          in: string[];
        };
      };
      take: number;
    };
    expect(filter.take).toBe(2);
    expect(filter.where.achievementId.in.every((id) => id.startsWith('game.altair.'))).toBe(true);

    db.achievements.mockResolvedValue([]);
    await get(myAchievements.GET, `/api/v1/me/achievements?cursor=${first.nextCursor}`);
    const next = db.achievements.mock.calls[1]?.[0] as {
      where: {
        OR: Record<string, unknown>[];
      };
    };
    expect(next.where.OR).toEqual([
      {
        unlockedAt: {
          lt: new Date('2026-11-19T00:00:00Z'),
        },
      },
      {
        unlockedAt: new Date('2026-11-19T00:00:00Z'),
        id: {
          lt: 'ua3',
        },
      },
    ]);
  });

  it('rejects a bad cursor, a bad gameId and an unknown game with 400', async () => {
    for (const qs of ['cursor=!!!', 'gameId=Not%20Valid', 'gameId=nope']) {
      const res = await get(myAchievements.GET, `/api/v1/me/achievements?${qs}`);
      expect(res.status).toBe(400);
    }
    expect(db.achievements).not.toHaveBeenCalled();
  });
});

describe('test-mode keys', () => {
  it('answer every games endpoint with its documented fixture and read nothing', async () => {
    db.keyRow.current = keyRecord({
      testMode: true,
    });
    const secret = 'rmh_test_abc';
    const cases: [TestHandler, string, Record<string, string>, string][] = [
      [catalogRoute.GET, '/api/v1/games', {}, 'data'],
      [myGames.GET, '/api/v1/me/games', {}, 'data'],
      [
        myDays.GET,
        '/api/v1/me/games/altair/days',
        {
          gameId: 'altair',
        },
        'data',
      ],
      [myAchievements.GET, '/api/v1/me/achievements', {}, 'data'],
      [
        userGames.GET,
        '/api/v1/users/ada/games',
        {
          handle: 'ada',
        },
        'data',
      ],
    ];
    for (const [handler, path, params, field] of cases) {
      const res = await get(handler, path, params, secret);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('X-RMH-Test-Mode')).toBe('true');
      const body = (await res.json()) as Record<string, unknown[]>;
      expect(body[field]?.length, path).toBeGreaterThan(0);
    }
    expect(db.playtime).not.toHaveBeenCalled();
    expect(db.achievements).not.toHaveBeenCalled();
  });
});
