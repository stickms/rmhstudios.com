/**
 * `GET /api/v1/me/personal-bests`, driven through the real developer-API wrapper with
 * Prisma mocked: scope enforcement, the playtime privacy rule (hidden is a
 * 404), the key owner being the only member whose achievements are read, secret
 * achievements staying out, and the catalogue listing only public titles.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  handlersOf,
  type TestHandler,
} from '@/lib/__tests__/api-handlers-of';

const db =
  vi.hoisted(
    () => ({
      keyRow:
        {
          current:
            null as Record<
              string,
              unknown
            > | null,
        },
      user: vi.fn(),
      follow:
        vi.fn(),
      block:
        vi.fn(),
      playtime:
        vi.fn(),
      playtimeDays:
        vi.fn(),
      achievements:
        vi.fn(),
      bests:
        vi.fn(),
      rarity:
        vi.fn(),
    }),
  );

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        developerApiKey:
          {
            findUnique:
              vi.fn(
                async () =>
                  db
                    .keyRow
                    .current,
              ),
            update:
              vi.fn(
                async () => ({}),
              ),
          },
        apiKeyRefusalDaily:
          {
            upsert:
              vi.fn(
                async () => ({}),
              ),
          },
        apiIdempotencyKey:
          {
            findUnique:
              vi.fn(),
            create:
              vi.fn(),
            deleteMany:
              vi.fn(),
          },
        user: {
          findUnique:
            db.user,
        },
        follow:
          {
            findFirst:
              db.follow,
          },
        userBlock:
          {
            findFirst:
              db.block,
          },
        gamePlaytime:
          {
            findMany:
              db.playtime,
          },
        gamePlaytimeDay:
          {
            findMany:
              db.playtimeDays,
          },
        userAchievement:
          {
            findMany:
              db.achievements,
          },
        achievementRarity:
          {
            findMany:
              db.rarity,
          },
        gamePersonalBest:
          {
            findMany:
              db.bests,
          },
      },
  }),
);
vi.mock(
  '@/lib/entitlements',
  () => ({
    getUserTier:
      vi.fn(
        async () =>
          'starter',
      ),
    hasApiAccess:
      () =>
        true,
  }),
);
vi.mock(
  '@/lib/admin-audit.server',
  () => ({
    getActiveBan:
      vi.fn(
        async () =>
          null,
      ),
  }),
);
vi.mock(
  '@/lib/redis.server',
  () => ({
    redisRateLimit:
      vi.fn(
        async () =>
          null,
      ),
    redisIncrBy:
      vi.fn(
        async () =>
          null,
      ),
  }),
);
vi.mock(
  '@/lib/api/usage.server',
  () => ({
    recordUsage:
      vi.fn(),
  }),
);
vi.mock(
  '@tanstack/react-router',
  () => ({
    createFileRoute:

        () =>
        (
          config: unknown,
        ) => ({
          options:
            config,
        }),
  }),
);

const route =
  handlersOf<TestHandler>(
    (
      await import('../../../app/routes/api/v1/me/personal-bests')
    )
      .Route,
  );
const OWNER =
  'owner_1';

function keyRecord(
  over: Record<
    string,
    unknown
  > = {},
) {
  return {
    id: 'key_1',
    userId:
      OWNER,
    revokedAt:
      null,
    expiresAt:
      null,
    scopes:
      [
        'read:games',
      ],
    testMode: false,
    allowedCidrs:
      [] as string[],
    rateLimitPerMinute:
      null,
    ...over,
  };
}

function get(
  path: string,
) {
  return route.GET(
    {
      request:
        new Request(
          `https://rmhstudios.com${path}`,
          {
            headers:
              {
                authorization:
                  'Bearer rmh_live_testsecret',
                'cf-connecting-ip':
                  '203.0.113.9',
              },
          },
        ),
      params:
        {},
    },
  );
}

const row =
  (
    gameId: string,
    score: number,
    at: string,
  ) => ({
    gameId,
    score,
    previous:
      score -
      1,
    createdAt:
      new Date(
        at,
      ),
  });

beforeEach(
  () => {
    vi.clearAllMocks();
    db.keyRow.current =
      keyRecord();
    db.bests.mockResolvedValue(
      [],
    );
  },
);

describe('GET /api/v1/me/personal-bests', () => {
  it('403s without read:games and reads nothing', async () => {
    db.keyRow.current =
      keyRecord(
        {
          scopes:
            [
              'read:profile',
            ],
        },
      );
    const res =
      await get(
        '/api/v1/me/personal-bests',
      );
    expect(
      res.status,
    ).toBe(
      403,
    );
    expect(
      res.headers.get(
        'X-Accepted-Scope',
      ),
    ).toBe(
      'read:games',
    );
    expect(
      db.bests,
    ).not.toHaveBeenCalled();
  });

  it('reads only the key owner rows and returns the documented shape without rank', async () => {
    db.bests.mockResolvedValue(
      [
        row(
          'altair',
          10,
          '2026-11-18T10:00:00.000Z',
        ),
      ],
    );
    const res =
      await get(
        '/api/v1/me/personal-bests',
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      db
        .bests
        .mock
        .calls[0]![0]
        .where
        .userId,
    ).toBe(
      OWNER,
    );
    const body =
      (await res.json()) as {
        data: Record<
          string,
          unknown
        >[];
        nextCursor:
          | string
          | null;
      };
    expect(
      body
        .data[0],
    ).toEqual(
      {
        gameId:
          'altair',
        gameTitle:
          expect.any(
            String,
          ),
        score: 10,
        previousScore: 9,
        achievedAt:
          '2026-11-18T10:00:00.000Z',
      },
    );
    expect(
      JSON.stringify(
        body,
      ),
    ).not.toMatch(
      /rank/i,
    );
    expect(
      body.nextCursor,
    ).toBeNull();
  });

  it('filters by gameId and rejects an unknown or malformed one', async () => {
    await get(
      '/api/v1/me/personal-bests?gameId=altair',
    );
    expect(
      db
        .bests
        .mock
        .calls[0]![0]
        .where,
    ).toMatchObject(
      {
        userId:
          OWNER,
        gameId:
          'altair',
      },
    );
    expect(
      (
        await get(
          '/api/v1/me/personal-bests?gameId=nope-nope',
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      (
        await get(
          '/api/v1/me/personal-bests?gameId=BAD%20ID',
        )
      )
        .status,
    ).toBe(
      400,
    );
  });

  it('since keeps only bests set at or after it, and rejects a bad date', async () => {
    db.bests.mockResolvedValue(
      [
        row(
          'altair',
          10,
          '2026-11-01T00:00:00.000Z',
        ),
        row(
          'slice-it',
          7,
          '2026-11-19T00:00:00.000Z',
        ),
      ],
    );
    const res =
      await get(
        '/api/v1/me/personal-bests?since=2026-11-10T00:00:00.000Z',
      );
    const body =
      (await res.json()) as {
        data: {
          gameId: string;
        }[];
      };
    expect(
      body.data.map(
        (
          d,
        ) =>
          d.gameId,
      ),
    ).toEqual(
      [
        'slice-it',
      ],
    );
    expect(
      (
        await get(
          '/api/v1/me/personal-bests?since=yesterday',
        )
      )
        .status,
    ).toBe(
      400,
    );
  });

  it('pages by game id with an opaque cursor and caps the limit', async () => {
    db.bests.mockResolvedValue(
      [
        row(
          'altair',
          3,
          '2026-11-18T10:00:00.000Z',
        ),
        row(
          'rmhtype',
          4,
          '2026-11-18T10:00:00.000Z',
        ),
        row(
          'slice-it',
          5,
          '2026-11-18T10:00:00.000Z',
        ),
      ],
    );
    const first =
      (await (
        await get(
          '/api/v1/me/personal-bests?limit=2',
        )
      ).json()) as {
        data: {
          gameId: string;
        }[];
        nextCursor:
          | string
          | null;
      };
    expect(
      first.data.map(
        (
          d,
        ) =>
          d.gameId,
      ),
    ).toEqual(
      [
        'altair',
        'rmhtype',
      ],
    );
    expect(
      first.nextCursor,
    ).toBeTruthy();
    await get(
      `/api/v1/me/personal-bests?limit=2&cursor=${first.nextCursor}`,
    );
    expect(
      db.bests.mock.calls.at(
        -1,
      )![0]
        .where
        .gameId,
    ).toEqual(
      {
        gt: 'rmhtype',
      },
    );
    expect(
      (
        await get(
          '/api/v1/me/personal-bests?cursor=%21%21',
        )
      )
        .status,
    ).toBe(
      400,
    );
  });
});
