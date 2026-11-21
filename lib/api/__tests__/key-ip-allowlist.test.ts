/**
 * API key restrictions (sprint 03, feature 06): a key's allowed addresses are
 * enforced by `withDeveloperApi` right after authentication, a refused request
 * spends no quota and is counted with a masked address, a key's own limit
 * replaces the tier's when lower, and only the owner can change either setting.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h =
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
      findUnique:
        vi.fn(),
      update:
        vi.fn(),
      count:
        vi.fn(),
      create:
        vi.fn(),
      upsert:
        vi.fn(),
      getSession:
        vi.fn(),
    }),
  );

vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          h.getSession,
      },
    },
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
              h.findUnique,
            update:
              h.update,
            count:
              h.count,
            create:
              h.create,
          },
        apiKeyRefusalDaily:
          {
            upsert:
              h.upsert,
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

import { withDeveloperApi } from '@/lib/api/with-developer-api.server';
import { RATE_LIMIT_MULTIPLIER } from '@/lib/rate-limit';
import {
  patchKeyBody,
  createKeyBody,
} from '@/lib/developer/keys-schema';

const SECRET =
  'rmh_live_testsecret';

function keyRecord(
  over: Record<
    string,
    unknown
  > = {},
) {
  return {
    id: 'key_1',
    userId:
      'owner',
    revokedAt:
      null,
    expiresAt:
      null,
    scopes:
      [
        'read:profile',
      ],
    testMode: false,
    allowedCidrs:
      [] as string[],
    rateLimitPerMinute:
      null as
        | number
        | null,
    ...over,
  };
}

function call(
  ip: string,
  opts: {
    key?: string;
  } = {},
) {
  const headers =
    new Headers(
      {
        authorization: `Bearer ${opts.key ?? SECRET}`,
        'cf-connecting-ip':
          ip,
      },
    );
  const handler =
    vi.fn(
      async (ctx: {
        json: (
          d: unknown,
        ) => Response;
      }) =>
        ctx.json(
          {
            ok: true,
          },
        ),
    );
  return {
    handler,
    run: () =>
      withDeveloperApi(
        new Request(
          'https://rmhstudios.com/api/v1/me',
          {
            headers,
          },
        ),
        handler,
      ),
  };
}

beforeEach(
  () => {
    vi.clearAllMocks();
    h.keyRow.current =
      keyRecord();
    h.findUnique.mockImplementation(
      async () =>
        h
          .keyRow
          .current,
    );
    h.update.mockResolvedValue(
      {},
    );
    h.upsert.mockResolvedValue(
      {},
    );
  },
);

describe('allowlist enforcement in withDeveloperApi', () => {
  it('lets a restricted key through from inside its range and refuses it elsewhere', async () => {
    h.keyRow.current =
      keyRecord(
        {
          allowedCidrs:
            [
              '203.0.113.7',
              '198.51.100.0/24',
            ],
        },
      );

    const inside =
      call(
        '198.51.100.9',
      );
    expect(
      (
        await inside.run()
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      inside.handler,
    ).toHaveBeenCalledTimes(
      1,
    );

    const outside =
      call(
        '192.0.2.50',
      );
    const res =
      await outside.run();
    expect(
      res.status,
    ).toBe(
      403,
    );
    const body =
      await res.json();
    expect(
      body
        .error
        .code,
    ).toBe(
      'ip_not_allowed',
    );
    expect(
      body
        .error
        .type,
    ).toBe(
      'authorization_error',
    );
    expect(
      outside.handler,
    ).not.toHaveBeenCalled();
  });

  it('matches IPv6 ranges and IPv4-mapped IPv6 client addresses', async () => {
    h.keyRow.current =
      keyRecord(
        {
          allowedCidrs:
            [
              '2001:db8:abcd::/48',
              '203.0.113.7',
            ],
        },
      );

    expect(
      (
        await call(
          '2001:db8:abcd:1::5',
        ).run()
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      (
        await call(
          '2001:db8:abce::5',
        ).run()
      )
        .status,
    ).toBe(
      403,
    );
    // A dual-stack listener reports the IPv4 client as ::ffff:a.b.c.d.
    expect(
      (
        await call(
          '::ffff:203.0.113.7',
        ).run()
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      (
        await call(
          '::ffff:203.0.113.8',
        ).run()
      )
        .status,
    ).toBe(
      403,
    );
  });

  it('refuses a client address that is not an address at all', async () => {
    h.keyRow.current =
      keyRecord(
        {
          allowedCidrs:
            [
              '203.0.113.0/24',
            ],
        },
      );
    expect(
      (
        await call(
          'unknown',
        ).run()
      )
        .status,
    ).toBe(
      403,
    );
  });

  it('applies to test-mode keys', async () => {
    h.keyRow.current =
      keyRecord(
        {
          testMode: true,
          allowedCidrs:
            [
              '203.0.113.7',
            ],
        },
      );
    const inside =
      await call(
        '203.0.113.7',
        {
          key: 'rmh_test_abc',
        },
      ).run();
    expect(
      inside.status,
    ).toBe(
      200,
    );
    expect(
      inside.headers.get(
        'X-RMH-Test-Mode',
      ),
    ).toBe(
      'true',
    );
    expect(
      (
        await call(
          '192.0.2.1',
          {
            key: 'rmh_test_abc',
          },
        ).run()
      )
        .status,
    ).toBe(
      403,
    );
  });

  it('leaves a key with no list exactly as before', async () => {
    const open =
      call(
        '192.0.2.200',
      );
    expect(
      (
        await open.run()
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      h.upsert,
    ).not.toHaveBeenCalled();
  });

  it('counts a refusal per key per day with a masked address, never the full one', async () => {
    h.keyRow.current =
      keyRecord(
        {
          allowedCidrs:
            [
              '203.0.113.7',
            ],
        },
      );
    await call(
      '192.0.2.77',
    ).run();

    expect(
      h.upsert,
    ).toHaveBeenCalledTimes(
      1,
    );
    const arg =
      h
        .upsert
        .mock
        .calls[0]![0];
    const day =
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        );
    expect(
      arg.where,
    ).toEqual(
      {
        keyId_day:
          {
            keyId:
              'key_1',
            day,
          },
      },
    );
    expect(
      arg.create,
    ).toMatchObject(
      {
        keyId:
          'key_1',
        day,
        count: 1,
        lastPrefix:
          '192.0.2.x',
      },
    );
    expect(
      arg.update,
    ).toMatchObject(
      {
        count:
          {
            increment: 1,
          },
        lastPrefix:
          '192.0.2.x',
      },
    );
    expect(
      JSON.stringify(
        arg,
      ),
    ).not.toContain(
      '192.0.2.77',
    );
  });

  it('masks an IPv6 refusal to its first 48 bits', async () => {
    h.keyRow.current =
      keyRecord(
        {
          allowedCidrs:
            [
              '203.0.113.7',
            ],
        },
      );
    await call(
      '2001:db8:1:2:3:4:5:6',
    ).run();
    expect(
      h
        .upsert
        .mock
        .calls[0]![0]
        .create
        .lastPrefix,
    ).toBe(
      '2001:db8:1::x',
    );
  });

  it('still answers 403 when counting the refusal fails', async () => {
    h.keyRow.current =
      keyRecord(
        {
          allowedCidrs:
            [
              '203.0.113.7',
            ],
        },
      );
    h.upsert.mockRejectedValue(
      new Error(
        'db down',
      ),
    );
    const spy =
      vi
        .spyOn(
          console,
          'error',
        )
        .mockImplementation(
          () => {},
        );
    expect(
      (
        await call(
          '192.0.2.1',
        ).run()
      )
        .status,
    ).toBe(
      403,
    );
    await new Promise(
      (
        r,
      ) =>
        setTimeout(
          r,
          0,
        ),
    );
    expect(
      spy,
    ).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('stamps lastUsedAt only for requests the allowlist lets through', async () => {
    h.keyRow.current = keyRecord({ id: 'key_stamp', allowedCidrs: ['203.0.113.7'] });
    expect((await call('192.0.2.1').run()).status).toBe(403);
    expect(h.update).not.toHaveBeenCalled();
    expect((await call('203.0.113.7').run()).status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'key_stamp' } });
  });

  it('does not spend the per-key limit on refused requests', async () => {
    h.keyRow.current =
      keyRecord(
        {
          id: 'key_quota',
          allowedCidrs:
            [
              '203.0.113.7',
            ],
          rateLimitPerMinute: 2,
        },
      );
    for (
      let i = 0;
      i <
      6;
      i++
    ) {
      expect(
        (
          await call(
            '192.0.2.1',
          ).run()
        )
          .status,
      ).toBe(
        403,
      );
    }
    expect(
      (
        await call(
          '203.0.113.7',
        ).run()
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      (
        await call(
          '203.0.113.7',
        ).run()
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      (
        await call(
          '203.0.113.7',
        ).run()
      )
        .status,
    ).toBe(
      429,
    );
  });
});

describe('a key limit lower than the tier', () => {
  it('shows it in X-RateLimit-Limit and refuses the 11th request with a 429', async () => {
    h.keyRow.current =
      keyRecord(
        {
          id: 'key_ten',
          rateLimitPerMinute: 10,
        },
      );
    for (
      let i = 1;
      i <=
      10;
      i++
    ) {
      const res =
        await call(
          '203.0.113.7',
        ).run();
      expect(
        res.status,
      ).toBe(
        200,
      );
      expect(
        res.headers.get(
          'X-RateLimit-Limit',
        ),
      ).toBe(
        '10',
      );
      expect(
        res.headers.get(
          'X-RateLimit-Remaining',
        ),
      ).toBe(
        String(
          10 -
            i,
        ),
      );
    }
    const eleventh =
      await call(
        '203.0.113.7',
      ).run();
    expect(
      eleventh.status,
    ).toBe(
      429,
    );
    expect(
      (
        await eleventh.json()
      )
        .error
        .code,
    ).toBe(
      'rate_limited',
    );
  });

  it('never exceeds the tier, even if the plan was lowered after it was set', async () => {
    h.keyRow.current =
      keyRecord(
        {
          id: 'key_high',
          rateLimitPerMinute: 5000,
        },
      );
    const res =
      await call(
        '203.0.113.7',
      ).run();
    expect(
      res.headers.get(
        'X-RateLimit-Limit',
      ),
    ).toBe(
      '120',
    );
  });

  it('keeps the tier limit when the key has none', async () => {
    h.keyRow.current =
      keyRecord(
        {
          id: 'key_tier',
        },
      );
    const res =
      await call(
        '203.0.113.7',
      ).run();
    expect(
      res.headers.get(
        'X-RateLimit-Limit',
      ),
    ).toBe(
      String(
        120 *
          RATE_LIMIT_MULTIPLIER,
      ),
    );
  });
});

describe('saving restrictions', () => {
  it('rejects a range that covers every address, with advice', () => {
    for (const range of [
      '0.0.0.0/0',
      '::/0',
    ]) {
      const parsed =
        patchKeyBody.safeParse(
          {
            allowedCidrs:
              [
                range,
              ],
          },
        );
      expect(
        parsed.success,
      ).toBe(
        false,
      );
      if (
        !parsed.success
      ) {
        expect(
          parsed
            .error
            .issues[0]!
            .message,
        ).toMatch(
          /leave the list empty/,
        );
        expect(
          parsed
            .error
            .issues[0]!
            .path,
        ).toEqual(
          [
            'allowedCidrs',
            0,
          ],
        );
      }
    }
  });

  it('rejects hostnames, wildcards, bad prefixes and more than 20 entries', () => {
    expect(
      createKeyBody.safeParse(
        {
          name: 'k',
          allowedCidrs:
            [
              'example.com',
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      createKeyBody.safeParse(
        {
          name: 'k',
          allowedCidrs:
            [
              '10.*',
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      createKeyBody.safeParse(
        {
          name: 'k',
          allowedCidrs:
            [
              '10.0.0.0/4',
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    const many =
      Array.from(
        {
          length: 21,
        },
        (
          _,
          i,
        ) =>
          `10.0.${i}.1`,
      );
    expect(
      createKeyBody.safeParse(
        {
          name: 'k',
          allowedCidrs:
            many,
        },
      )
        .success,
    ).toBe(
      false,
    );
  });

  it('trims and de-duplicates what it stores', () => {
    const parsed =
      patchKeyBody.parse(
        {
          allowedCidrs:
            [
              ' 203.0.113.7 ',
              '203.0.113.7',
              '',
            ],
        },
      );
    expect(
      parsed.allowedCidrs,
    ).toEqual(
      [
        '203.0.113.7',
      ],
    );
  });

  it('accepts an empty list to lift the restriction and null to return to the tier limit', () => {
    expect(
      patchKeyBody.parse(
        {
          allowedCidrs:
            [],
          rateLimitPerMinute:
            null,
        },
      ),
    ).toEqual(
      {
        allowedCidrs:
          [],
        rateLimitPerMinute:
          null,
      },
    );
    expect(
      patchKeyBody.safeParse(
        {
          rateLimitPerMinute: 0,
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      patchKeyBody.safeParse(
        {
          rateLimitPerMinute: 1.5,
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
});

describe('PATCH /api/developer/keys/$id', () => {
  type Handler =
    (a: {
      request: Request;
      params: Record<
        string,
        string
      >;
    }) => Promise<Response>;

  async function patch(
    body: unknown,
    userId = 'owner',
  ) {
    h.getSession.mockResolvedValue(
      {
        user: {
          id: userId,
          role: 'user',
        },
        session:
          {
            id: 's',
          },
      },
    );
    const mod =
      await import('@/lib/developer/api/developer.keys.$id.server');
    const handler =
      handlersOfModule<Handler>(
        mod,
      ).PATCH!;
    return handler(
      {
        request:
          new Request(
            'https://rmhstudios.com/api/developer/keys/key_1',
            {
              method:
                'PATCH',
              headers:
                {
                  'content-type':
                    'application/json',
                  cookie:
                    'better-auth.session_token=x',
                },
              body: JSON.stringify(
                body,
              ),
            },
          ),
        params:
          {
            id: 'key_1',
          },
      },
    );
  }

  beforeEach(
    () => {
      h.findUnique.mockResolvedValue(
        {
          userId:
            'owner',
          revokedAt:
            null,
        },
      );
      h.update.mockImplementation(
        async ({
          data,
        }: {
          data: Record<
            string,
            unknown
          >;
        }) => ({
          id: 'key_1',
          ...data,
        }),
      );
    },
  );

  it('saves the list and the limit for the owner', async () => {
    const res =
      await patch(
        {
          allowedCidrs:
            [
              '203.0.113.0/24',
            ],
          rateLimitPerMinute: 30,
        },
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    const data =
      h
        .update
        .mock
        .calls[0]![0]
        .data;
    expect(
      data,
    ).toMatchObject(
      {
        allowedCidrs:
          [
            '203.0.113.0/24',
          ],
        rateLimitPerMinute: 30,
      },
    );
  });

  it('does not let another member edit the key', async () => {
    const res =
      await patch(
        {
          allowedCidrs:
            [
              '203.0.113.7',
            ],
        },
        'someone-else',
      );
    expect(
      res.status,
    ).toBe(
      404,
    );
    expect(
      h.update,
    ).not.toHaveBeenCalled();
  });

  it('refuses 0.0.0.0/0 with a 400 and changes nothing', async () => {
    const res =
      await patch(
        {
          allowedCidrs:
            [
              '0.0.0.0/0',
            ],
        },
      );
    expect(
      res.status,
    ).toBe(
      400,
    );
    expect(
      h.update,
    ).not.toHaveBeenCalled();
  });

  it('refuses a limit above the tier maximum', async () => {
    const res =
      await patch(
        {
          rateLimitPerMinute: 121,
        },
      );
    expect(
      res.status,
    ).toBe(
      400,
    );
    expect(
      (
        await res.json()
      )
        .error,
    ).toMatch(
      /at most 120/,
    );
    expect(
      h.update,
    ).not.toHaveBeenCalled();
  });
});

describe('refusal summary on the key list', () => {
  it('adds the refusals of the last 7 days and the latest masked address per key', async () => {
    const findMany =
      vi.fn(
        async () => [
          {
            keyId:
              'key_a',
            count: 2,
            lastPrefix:
              '192.0.2.x',
          },
          {
            keyId:
              'key_a',
            count: 5,
            lastPrefix:
              '198.51.100.x',
          },
          {
            keyId:
              'key_b',
            count: 1,
            lastPrefix:
              null,
          },
        ],
      );
    (
      h as unknown as {
        findMany: typeof findMany;
      }
    ).findMany =
      findMany;
    const {
      prisma,
    } =
      await import('@/lib/prisma.server');
    (
      prisma as unknown as {
        apiKeyRefusalDaily: {
          findMany: typeof findMany;
        };
      }
    ).apiKeyRefusalDaily.findMany =
      findMany;
    const {
      getKeyRefusalSummaries,
    } =
      await import('@/lib/api/key-refusals.server');

    const now =
      new Date(
        '2026-11-21T12:00:00Z',
      );
    const out =
      await getKeyRefusalSummaries(
        [
          'key_a',
          'key_b',
          'key_c',
        ],
        now,
      );

    // Newest day first: key_a's latest address is the first row's.
    expect(
      out.get(
        'key_a',
      ),
    ).toEqual(
      {
        count: 7,
        lastPrefix:
          '192.0.2.x',
      },
    );
    expect(
      out.get(
        'key_b',
      ),
    ).toEqual(
      {
        count: 1,
        lastPrefix:
          null,
      },
    );
    expect(
      out.has(
        'key_c',
      ),
    ).toBe(
      false,
    );
    expect(
      findMany,
    ).toHaveBeenCalledWith(
      {
        where:
          {
            keyId:
              {
                in: [
                  'key_a',
                  'key_b',
                  'key_c',
                ],
              },
            day: {
              gte: '2026-11-15',
            },
          },
        orderBy:
          {
            day: 'desc',
          },
        select:
          {
            keyId: true,
            count: true,
            lastPrefix: true,
          },
      },
    );
  });

  it('asks the database nothing when no key has a list', async () => {
    const {
      getKeyRefusalSummaries,
    } =
      await import('@/lib/api/key-refusals.server');
    expect(
      (
        await getKeyRefusalSummaries(
          [],
        )
      )
        .size,
    ).toBe(
      0,
    );
  });
});
