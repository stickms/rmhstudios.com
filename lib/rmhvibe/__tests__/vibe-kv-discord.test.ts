/**
 * The Activity's iframe has no site session: it authenticates the KV store with its Discord
 * access token as a bearer. Prisma and the verifier are mocked; the handlers run for real.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const db =
  vi.hoisted(
    () => ({
      vibeKv:
        {
          findUnique:
            vi.fn(),
          findMany:
            vi.fn(),
        },
      vibePage:
        {
          findUnique:
            vi.fn(),
        },
    }),
  );
const getSession =
  vi.hoisted(
    () =>
      vi.fn(),
  );
const verify =
  vi.hoisted(
    () =>
      vi.fn(),
  );
const findLinked =
  vi.hoisted(
    () =>
      vi.fn(),
  );
const rateLimited =
  vi.hoisted(
    () =>
      vi.fn(
        async (
          ..._a: unknown[]
        ) =>
          null,
      ),
  );

vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession,
      },
    },
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      db,
  }),
);
vi.mock(
  '@/lib/rate-limit.server',
  async (
    orig,
  ) => ({
    ...(await orig<
      typeof import('@/lib/rate-limit.server')
    >()),
    withRateLimitAsync:
      rateLimited,
  }),
);
vi.mock(
  '@/lib/discord-link.server',
  () => ({
    findLinkedUserId:
      findLinked,
  }),
);
vi.mock(
  '@/lib/discord/verify-activity-token.server',
  async (
    orig,
  ) => ({
    ...(await orig<
      typeof import('@/lib/discord/verify-activity-token.server')
    >()),
    verifyDiscordActivityToken:
      verify,
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

import { route } from '@/lib/rmhvibe/api/vibe.kv.$slug.server';

type H =
  (a: {
    request: Request;
    params: Record<
      string,
      string
    >;
  }) => Promise<Response>;
const handlers =
  handlersOf<H>(
    route,
  );
const get =
  (
    qs: string,
    headers: Record<
      string,
      string
    >,
  ) =>
    handlers.GET!(
      {
        params:
          {
            slug: 'neon',
          },
        request:
          new Request(
            `https://x.test/api/vibe/kv/neon?${qs}`,
            {
              headers,
            },
          ),
      },
    );
const bearer =
  {
    authorization:
      'Bearer tok',
    'cf-connecting-ip':
      '9.9.9.9',
  };

beforeEach(
  () => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(
      null,
    );
    db.vibePage.findUnique.mockResolvedValue(
      {
        id: 'p1',
        status:
          'ready',
      },
    );
    db.vibeKv.findUnique.mockResolvedValue(
      {
        value: 7,
      },
    );
  },
);

describe('vibe kv with a Discord Activity bearer token', () => {
  it('gives a linked user their user scope and keys the rate limit on the Discord id', async () => {
    verify.mockResolvedValue(
      {
        discordId:
          '555',
        expiresAt:
          Date.now() +
          60_000,
      },
    );
    findLinked.mockResolvedValue(
      'u1',
    );
    const res =
      await get(
        'key=a&scope=user',
        bearer,
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      await res.json(),
    ).toEqual(
      {
        value: 7,
      },
    );
    expect(
      db
        .vibeKv
        .findUnique,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          where:
            expect.objectContaining(
              {
                pageId_scope_ownerKey_key:
                  expect.objectContaining(
                    {
                      ownerKey:
                        'u1',
                    },
                  ),
              },
            ),
        },
      ),
    );
    expect(
      rateLimited,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'read',
      expect.objectContaining(
        {
          scope:
            'discord:555',
          prefix:
            'vibe-kv-read',
          limit: 120,
        },
      ),
    );
  });

  it('leaves an unlinked guest with page scope only', async () => {
    verify.mockResolvedValue(
      {
        discordId:
          '555',
        expiresAt:
          Date.now() +
          60_000,
      },
    );
    findLinked.mockResolvedValue(
      null,
    );
    expect(
      (
        await get(
          'key=a&scope=user',
          bearer,
        )
      )
        .status,
    ).toBe(
      401,
    );
    expect(
      (
        await get(
          'key=a&scope=page',
          bearer,
        )
      )
        .status,
    ).toBe(
      200,
    );
  });

  it('treats an invalid or foreign-app token as anonymous, not a 500', async () => {
    verify.mockResolvedValue(
      null,
    );
    expect(
      (
        await get(
          'key=a&scope=user',
          bearer,
        )
      )
        .status,
    ).toBe(
      401,
    );
    expect(
      (
        await get(
          'key=a&scope=page',
          bearer,
        )
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      findLinked,
    ).not.toHaveBeenCalled();
    const opts =
      rateLimited.mock.calls.at(
        -1,
      )![2] as Record<
        string,
        unknown
      >;
    expect(
      opts.prefix,
    ).toBe(
      'vibe-kv-read',
    );
    expect(
      opts,
    ).not.toHaveProperty(
      'scope',
    );
    verify.mockRejectedValue(
      new Error(
        'boom',
      ),
    );
    expect(
      (
        await get(
          'key=a&scope=page',
          bearer,
        )
      )
        .status,
    ).toBe(
      200,
    );
  });

  it('lets a site session win over the bearer token', async () => {
    getSession.mockResolvedValue(
      {
        user: {
          id: 'sess-user',
          name: 'Ada',
        },
      },
    );
    verify.mockResolvedValue(
      {
        discordId:
          '555',
        expiresAt:
          Date.now() +
          60_000,
      },
    );
    findLinked.mockResolvedValue(
      'other',
    );
    await get(
      'key=a&scope=user',
      {
        ...bearer,
        cookie:
          'better-auth.session_token=abc',
      },
    );
    expect(
      verify,
    ).not.toHaveBeenCalled();
    expect(
      db
        .vibeKv
        .findUnique,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          where:
            expect.objectContaining(
              {
                pageId_scope_ownerKey_key:
                  expect.objectContaining(
                    {
                      ownerKey:
                        'sess-user',
                    },
                  ),
              },
            ),
        },
      ),
    );
  });
});
