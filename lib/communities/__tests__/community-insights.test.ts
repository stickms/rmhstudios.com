/**
 * s03-15 community insights: moderators only, every membership change writes exactly one event,
 * the raw SQL names the real tables and columns of the schema, and the answer is cached per
 * community, range and zone. Prisma is stood in for.
 */
import {
  readdirSync,
  readFileSync,
} from 'node:fs';
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
    () => {
      const fns =
        new Map<
          string,
          ReturnType<
            typeof vi.fn
          >
        >();
      const fn =
        (
          key: string,
        ) => {
          let f =
            fns.get(
              key,
            );
          if (
            !f
          ) {
            f =
              vi.fn();
            fns.set(
              key,
              f,
            );
          }
          return f;
        };
      const model =
        (
          name: string,
        ) =>
          new Proxy(
            {},
            {
              get: (
                _t,
                method: string,
              ) =>
                fn(
                  `${name}.${method}`,
                ),
            },
          );
      const db: Record<
        string,
        unknown
      > =
        new Proxy(
          {},
          {
            get: (
              _t,
              key: string,
            ) => {
              if (
                key ===
                'then'
              )
                return undefined;
              if (
                key ===
                '$transaction'
              ) {
                return async (
                  arg: unknown,
                ) =>
                  Array.isArray(
                    arg,
                  )
                    ? Promise.all(
                        arg,
                      )
                    : (
                        arg as (
                          tx: unknown,
                        ) => unknown
                      )(
                        db,
                      );
              }
              if (
                key ===
                  '$queryRaw' ||
                key ===
                  '$executeRaw'
              )
                return fn(
                  key,
                );
              return model(
                key,
              );
            },
          },
        );
      const cache =
        {
          keys: [] as string[],
        };
      return {
        fns,
        fn,
        db,
        cache,
      };
    },
  );

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      h.db,
  }),
);
vi.mock(
  '@/lib/cached.server',
  () => ({
    cached:
      async (
        key: string,
        _ttl: number,
        load: () => unknown,
      ) => {
        h.cache.keys.push(
          key,
        );
        return load();
      },
    invalidateCached:
      vi.fn(),
  }),
);
vi.mock(
  '@/lib/api/handler.server',
  () => ({
    defineHandler:
      (
        _o: unknown,
        fn: (
          c: unknown,
        ) => unknown,
      ) =>
        fn,
  }),
);
vi.mock(
  '@/lib/notifications.server',
  () => ({
    createNotification:
      vi.fn(),
  }),
);
vi.mock(
  '@/lib/communities/modlog.server',
  () => ({
    logModAction:
      vi.fn(),
  }),
);

import {
  computeInsights,
  getCommunityInsights,
} from '@/lib/communities/insights.server';
import { decideRequest } from '@/lib/communities/join-requests.server';
import { acceptInvite } from '@/lib/communities/invites.server';
import { insightsQuery } from '@/lib/communities/insights-schema';

type Handler =
  (
    ctx: Record<
      string,
      unknown
    >,
  ) => Promise<Response>;
const load =
  async (
    file: string,
    method: string,
  ): Promise<Handler> =>
    handlersOfModule<Handler>(
      await import(
        /* @vite-ignore */ `@/lib/communities/api/communities.$slug.${file}.server`
      ),
    )[
      method
    ]!;

const mock =
  (
    key: string,
  ) =>
    h.fn(
      key,
    );
const events =
  () =>
    mock(
      'communityMemberEvent.create',
    ).mock.calls.map(
      (
        c,
      ) =>
        (
          c[0] as {
            data: Record<
              string,
              unknown
            >;
          }
        )
          .data,
    );

const community =
  (
    role:
      | string
      | null,
    over: Record<
      string,
      unknown
    > = {},
  ) =>
    mock(
      'community.findUnique',
    ).mockResolvedValue(
      {
        id: 'c1',
        slug: 'club',
        name: 'The Club',
        isPrivate: false,
        createdById:
          'owner',
        members:
          role
            ? [
                {
                  role,
                },
              ]
            : [],
        rulesRequireAgreement: false,
        ...over,
      },
    );

const ctx =
  (
    over: Record<
      string,
      unknown
    > = {},
  ) => ({
    params:
      {
        slug: 'club',
      },
    userId:
      'u1',
    session:
      {
        user: {
          id: 'u1',
        },
      },
    query:
      {},
    ...over,
  });

beforeEach(
  () => {
    for (const f of h.fns.values())
      f.mockReset();
    h.cache.keys.length = 0;
    mock(
      'communityMemberEvent.create',
    ).mockResolvedValue(
      {
        id: 1n,
      },
    );
    mock(
      '$queryRaw',
    ).mockResolvedValue(
      [],
    );
    mock(
      'communityMember.count',
    ).mockResolvedValue(
      10,
    );
    mock(
      'user.findMany',
    ).mockResolvedValue(
      [],
    );
    mock(
      'userProfile.findMany',
    ).mockResolvedValue(
      [],
    );
  },
);

describe('GET /api/communities/$slug/insights', () => {
  it.each(
    [
      [
        'a plain member',
        'MEMBER',
      ],
      [
        'someone who is not a member',
        null,
      ],
    ],
  )(
    'answers 403 to %s',
    async (
      _name,
      role,
    ) => {
      community(
        role,
      );
      const res =
        await (
          await load(
            'insights',
            'GET',
          )
        )(
          ctx(),
        );
      expect(
        res.status,
      ).toBe(
        403,
      );
      expect(
        mock(
          '$queryRaw',
        ),
      ).not.toHaveBeenCalled();
    },
  );

  it('answers 404 for a community that does not exist', async () => {
    mock(
      'community.findUnique',
    ).mockResolvedValue(
      null,
    );
    const res =
      await (
        await load(
          'insights',
          'GET',
        )
      )(
        ctx(),
      );
    expect(
      res.status,
    ).toBe(
      404,
    );
  });

  it.each(
    [
      'MOD',
      'ADMIN',
    ],
  )(
    'serves %s the insights, 28 days in UTC by default',
    async (
      role,
    ) => {
      community(
        role,
      );
      const res =
        await (
          await load(
            'insights',
            'GET',
          )
        )(
          ctx(),
        );
      const body =
        (await res.json()) as {
          range: number;
          timeZone: string;
          members: number;
        };
      expect(
        body,
      ).toMatchObject(
        {
          range: 28,
          timeZone:
            'UTC',
          members: 10,
        },
      );
      expect(
        h
          .cache
          .keys,
      ).toEqual(
        [
          'community:insights:c1:28:UTC',
        ],
      );
    },
  );

  it('passes the chosen range and zone through to the cache key', async () => {
    community(
      'MOD',
    );
    await (
      await load(
        'insights',
        'GET',
      )
    )(
      ctx(
        {
          query:
            {
              range:
                '365',
              tz: 'Europe/Paris',
            },
        },
      ),
    );
    expect(
      h
        .cache
        .keys,
    ).toEqual(
      [
        'community:insights:c1:365:Europe/Paris',
      ],
    );
  });
});

describe('the insights query', () => {
  it('accepts the three ranges and a real zone, and nothing else', () => {
    expect(
      insightsQuery.safeParse(
        {},
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      insightsQuery.safeParse(
        {
          range:
            '90',
          tz: 'America/New_York',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      insightsQuery.safeParse(
        {
          range:
            '7',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      insightsQuery.safeParse(
        {
          tz: 'Mars/Base',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      insightsQuery.safeParse(
        {
          tz: 'x'.repeat(
            65,
          ),
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
});

describe('membership events', () => {
  it('a join writes one join event', async () => {
    community(
      'MEMBER',
      {
        members:
          [],
      },
    );
    mock(
      'communityMember.findUnique',
    ).mockResolvedValue(
      null,
    );
    const res =
      await (
        await load(
          'join',
          'POST',
        )
      )(
        ctx(
          {
            body: {},
          },
        ),
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      events(),
    ).toEqual(
      [
        {
          communityId:
            'c1',
          userId:
            'u1',
          kind: 'join',
        },
      ],
    );
  });

  it('a leave writes one leave event', async () => {
    community(
      'MEMBER',
    );
    mock(
      'communityMember.findUnique',
    ).mockResolvedValue(
      {
        id: 'm1',
      },
    );
    const res =
      await (
        await load(
          'join',
          'POST',
        )
      )(
        ctx(
          {
            body: {},
          },
        ),
      );
    expect(
      await res.json(),
    ).toEqual(
      {
        success: true,
        joined: false,
      },
    );
    expect(
      events(),
    ).toEqual(
      [
        {
          communityId:
            'c1',
          userId:
            'u1',
          kind: 'leave',
        },
      ],
    );
  });

  it('the owner cannot leave, so no event is written', async () => {
    community(
      'ADMIN',
    );
    mock(
      'communityMember.findUnique',
    ).mockResolvedValue(
      {
        id: 'm1',
      },
    );
    const res =
      await (
        await load(
          'join',
          'POST',
        )
      )(
        ctx(
          {
            userId:
              'owner',
            session:
              {
                user: {
                  id: 'owner',
                },
              },
            body: {},
          },
        ),
      );
    expect(
      res.status,
    ).toBe(
      400,
    );
    expect(
      events(),
    ).toEqual(
      [],
    );
  });

  it('removing a member writes one removed event for that member', async () => {
    community(
      'MOD',
    );
    mock(
      'communityMember.findUnique',
    )
      .mockResolvedValueOnce(
        {
          role: 'MOD',
        },
      )
      .mockResolvedValueOnce(
        {
          id: 'm9',
          role: 'MEMBER',
        },
      );
    const res =
      await (
        await load(
          'members.$userId',
          'DELETE',
        )
      )(
        ctx(
          {
            params:
              {
                slug: 'club',
                userId:
                  'u9',
              },
          },
        ),
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      events(),
    ).toEqual(
      [
        {
          communityId:
            'c1',
          userId:
            'u9',
          kind: 'removed',
        },
      ],
    );
  });

  it('a refused removal writes none', async () => {
    community(
      'MEMBER',
    );
    const res =
      await (
        await load(
          'members.$userId',
          'DELETE',
        )
      )(
        ctx(
          {
            params:
              {
                slug: 'club',
                userId:
                  'u9',
              },
          },
        ),
      );
    expect(
      res.status,
    ).toBe(
      403,
    );
    expect(
      events(),
    ).toEqual(
      [],
    );
  });

  it('approving a join request writes one join event, and only when the member was added', async () => {
    mock(
      'communityJoinRequest.findFirst',
    ).mockResolvedValue(
      {
        userId:
          'u7',
      },
    );
    mock(
      'communityJoinRequest.updateMany',
    ).mockResolvedValue(
      {
        count: 1,
      },
    );
    mock(
      'communityMember.createMany',
    ).mockResolvedValue(
      {
        count: 1,
      },
    );
    const c =
      {
        id: 'c1',
        slug: 'club',
        name: 'The Club',
      };
    await decideRequest(
      c,
      5n,
      'mod1',
      'approve',
    );
    expect(
      events(),
    ).toEqual(
      [
        {
          communityId:
            'c1',
          userId:
            'u7',
          kind: 'join',
        },
      ],
    );

    mock(
      'communityMemberEvent.create',
    ).mockClear();
    mock(
      'communityMember.createMany',
    ).mockResolvedValue(
      {
        count: 0,
      },
    );
    await decideRequest(
      c,
      5n,
      'mod1',
      'approve',
    );
    expect(
      events(),
    ).toEqual(
      [],
    );
  });

  it('denying a join request writes none', async () => {
    mock(
      'communityJoinRequest.findFirst',
    ).mockResolvedValue(
      {
        userId:
          'u7',
      },
    );
    mock(
      'communityJoinRequest.updateMany',
    ).mockResolvedValue(
      {
        count: 1,
      },
    );
    await decideRequest(
      {
        id: 'c1',
        slug: 'club',
        name: 'The Club',
      },
      5n,
      'mod1',
      'deny',
    );
    expect(
      events(),
    ).toEqual(
      [],
    );
  });

  it('joining with an invite writes one join event', async () => {
    mock(
      'communityJoinRequest.findUnique',
    ).mockResolvedValue(
      null,
    );
    mock(
      'communityMember.findUnique',
    ).mockResolvedValue(
      null,
    );
    mock(
      '$executeRaw',
    ).mockResolvedValue(
      1,
    );
    mock(
      'communityMember.createMany',
    ).mockResolvedValue(
      {
        count: 1,
      },
    );
    const res =
      await acceptInvite(
        'c1',
        'u3',
        'code',
      );
    expect(
      res,
    ).toEqual(
      {
        ok: true,
        alreadyMember: false,
      },
    );
    expect(
      events(),
    ).toEqual(
      [
        {
          communityId:
            'c1',
          userId:
            'u3',
          kind: 'join',
        },
      ],
    );
  });

  it('creating a community records the creator joining', async () => {
    const src =
      readFileSync(
        'lib/communities/api/communities.server.ts',
        'utf8',
      );
    expect(
      src,
    ).toContain(
      "memberEvents: { create: { userId: session.user.id, kind: 'join' } }",
    );
  });
});

/** Every `@@map` table of the schema, with its model's field names. */
function schemaTables(): Map<
  string,
  Set<string>
> {
  const dir =
    'prisma/schema';
  const tables =
    new Map<
      string,
      Set<string>
    >();
  for (const file of readdirSync(
    dir,
  ).filter(
    (
      f,
    ) =>
      f.endsWith(
        '.prisma',
      ),
  )) {
    const src =
      readFileSync(
        `${dir}/${file}`,
        'utf8',
      );
    for (const block of src.match(
      /^model \w+ \{[\s\S]*?^\}/gm,
    ) ??
      []) {
      const map =
        /@@map\("([^"]+)"\)/.exec(
          block,
        )?.[1];
      if (
        !map
      )
        continue;
      const fields =
        new Set(
          [
            ...block.matchAll(
              /^\s{2}(\w+)\s+\S/gm,
            ),
          ].map(
            (
              m,
            ) =>
              m[1]!,
          ),
        );
      tables.set(
        map,
        fields,
      );
    }
  }
  return tables;
}

describe('the insights SQL', () => {
  it('names real tables and real columns', async () => {
    await computeInsights(
      'c1',
      28,
      'UTC',
      Date.parse(
        '2026-12-01T12:00:00Z',
      ),
    );
    const queries =
      mock(
        '$queryRaw',
      ).mock.calls.map(
        (
          c,
        ) =>
          (
            c[0] as readonly string[]
          ).join(
            '?',
          ),
      );
    expect(
      queries.length,
    ).toBeGreaterThanOrEqual(
      10,
    );
    const sql =
      queries.join(
        '\n',
      );

    const tables =
      schemaTables();
    const used =
      new Set(
        [
          ...sql.matchAll(
            /(?:FROM|JOIN)\s+"([a-z_]+)"/g,
          ),
        ].map(
          (
            m,
          ) =>
            m[1]!,
        ),
      );
    // The real @@map names of RMHark, its reactions, likes and comments, and the new event table.
    for (const name of [
      'rmheet',
      'rmheet_reaction',
      'rmheet_like',
      'rmheet_comment',
      'community_member',
      'community_member_event',
      'community_post_flair',
      'community_flair',
    ]) {
      expect(
        used,
        name,
      ).toContain(
        name,
      );
    }
    for (const name of used)
      expect(
        tables.has(
          name,
        ),
        `table ${name}`,
      ).toBe(
        true,
      );

    const columns: Record<
      string,
      string[]
    > =
      {
        rmheet:
          [
            'id',
            'userId',
            'content',
            'communityId',
            'createdAt',
            'deletedAt',
            'audience',
            'isSensitive',
            'unlockPrice',
            'likeCount',
            'commentCount',
          ],
        rmheet_reaction:
          [
            'rmheetId',
            'userId',
            'createdAt',
          ],
        rmheet_like:
          [
            'rmheetId',
            'userId',
            'createdAt',
          ],
        rmheet_comment:
          [
            'rmheetId',
            'createdAt',
            'deletedAt',
          ],
        community_member:
          [
            'communityId',
            'joinedAt',
          ],
        community_member_event:
          [
            'id',
            'communityId',
            'kind',
            'createdAt',
          ],
        community_post_flair:
          [
            'postId',
            'flairId',
          ],
        community_flair:
          [
            'id',
            'name',
          ],
      };
    for (const [
      table,
      cols,
    ] of Object.entries(
      columns,
    )) {
      for (const col of cols)
        expect(
          tables
            .get(
              table,
            )
            ?.has(
              col,
            ),
          `${table}.${col}`,
        ).toBe(
          true,
        );
    }
    // Counts only: nothing selects who joined or left.
    for (const q of queries.filter(
      (
        x,
      ) =>
        x.includes(
          '"community_member"',
        ) ||
        x.includes(
          '"community_member_event"',
        ),
    )) {
      expect(
        q.split(
          'WHERE',
        )[0],
      ).not.toContain(
        '"userId"',
      );
    }
  });

  it('the migration creates the table the SQL reads, with its index', () => {
    const sql =
      readFileSync(
        'prisma/migrations/20261123030000_s03_community_member_events/migration.sql',
        'utf8',
      );
    expect(
      sql,
    ).toContain(
      'CREATE TABLE "community_member_event"',
    );
    expect(
      sql,
    ).toContain(
      '("communityId", "createdAt")',
    );
    expect(
      sql,
    ).not.toMatch(
      /DROP|ALTER TABLE "(?!community_member_event)/,
    );
  });
});

describe('the answer', () => {
  const now =
    Date.parse(
      '2026-12-01T12:00:00Z',
    );

  it('counts joins from today’s members before the first event and from events after it', async () => {
    mock(
      '$queryRaw',
    ).mockImplementation(
      async (
        parts: readonly string[],
      ) => {
        const text =
          parts.join(
            '?',
          );
        if (
          text.includes(
            'SELECT to_char("joinedAt"',
          )
        )
          return [
            {
              day: '2026-11-20',
              n: 4,
            },
          ];
        if (
          /FROM "community_member_event"\s+ORDER BY/.test(
            text,
          )
        )
          return [
            {
              at: '2026-11-25T08:00:00Z',
            },
          ];
        if (
          text.includes(
            'GROUP BY 1, 2',
          )
        ) {
          return [
            {
              day: '2026-11-28',
              kind: 'join',
              n: 2,
            },
            {
              day: '2026-11-29',
              kind: 'leave',
              n: 1,
            },
            {
              day: '2026-11-30',
              kind: 'removed',
              n: 1,
            },
          ];
        }
        return [];
      },
    );
    const out =
      await computeInsights(
        'c1',
        28,
        'UTC',
        now,
      );
    expect(
      out.lossesKnownFrom,
    ).toBe(
      '2026-11-25',
    );
    expect(
      out
        .joins
        .value,
    ).toBe(
      6,
    );
    expect(
      out
        .leaves
        .value,
    ).toBe(
      1,
    );
    expect(
      out
        .removed
        .value,
    ).toBe(
      1,
    );
    expect(
      out
        .netChange
        .value,
    ).toBe(
      4,
    );
    // Members now 10: the removal on the 30th and the leave on the 29th are added back going
    // backwards, the two joins on the 28th are taken off.
    const line =
      Object.fromEntries(
        out.memberLine.map(
          (
            p,
          ) => [
            p.day,
            p.total,
          ],
        ),
      );
    expect(
      line[
        '2026-12-01'
      ],
    ).toBe(
      10,
    );
    expect(
      line[
        '2026-11-30'
      ],
    ).toBe(
      10,
    );
    expect(
      line[
        '2026-11-29'
      ],
    ).toBe(
      11,
    );
    expect(
      line[
        '2026-11-28'
      ],
    ).toBe(
      12,
    );
    expect(
      line[
        '2026-11-27'
      ],
    ).toBe(
      10,
    );
    expect(
      out.memberLine,
    ).toHaveLength(
      28,
    );
  });

  it('shows who wrote a top post by public handle only', async () => {
    mock(
      '$queryRaw',
    ).mockImplementation(
      async (
        parts: readonly string[],
      ) =>
        parts
          .join(
            '?',
          )
          .includes(
            '"likes" + x."reactions"',
          )
          ? [
              {
                id: 'p1',
                userId:
                  'u2',
                excerpt:
                  'hello',
                createdAt:
                  new Date(
                    '2026-11-30T10:00:00Z',
                  ),
                likes: 3,
                reactions: 2,
                replies: 1,
              },
            ]
          : [],
    );
    mock(
      'user.findMany',
    ).mockResolvedValue(
      [
        {
          id: 'u2',
          handle:
            'sam',
          name: 'Sam',
          image:
            null,
        },
      ],
    );
    const out =
      await computeInsights(
        'c1',
        28,
        'UTC',
        now,
      );
    expect(
      out.topPosts,
    ).toEqual(
      [
        {
          id: 'p1',
          author:
            'sam',
          authorName:
            'Sam',
          excerpt:
            'hello',
          createdAt:
            '2026-11-30T10:00:00.000Z',
          likes: 3,
          reactions: 2,
          replies: 1,
        },
      ],
    );
  });

  it('withholds a top post\'s figures when its author hides their counts (quiet counts)', async () => {
    mock('$queryRaw').mockImplementation(async (strings: TemplateStringsArray) =>
      String(strings?.join?.('?') ?? '').includes('"likeCount"')
        ? [{ id: 'p1', userId: 'u2', excerpt: 'hi', createdAt: new Date(now), likes: 3, reactions: 2, replies: 1 }]
        : [],
    );
    mock('user.findMany').mockResolvedValue([{ id: 'u2', handle: 'sam', name: 'Sam', image: null }]);
    mock('userProfile.findMany').mockResolvedValue([{ userId: 'u2' }]);
    const out = await computeInsights('c1', 28, 'UTC', now);
    expect(out.topPosts).toHaveLength(1);
    expect(out.topPosts[0]).toMatchObject({ likes: null, reactions: null, replies: null });
  });

  it('is cached per community, range and zone', async () => {
    await getCommunityInsights(
      'c1',
      90,
      'Asia/Tokyo',
    );
    expect(
      h
        .cache
        .keys,
    ).toEqual(
      [
        'community:insights:c1:90:Asia/Tokyo',
      ],
    );
  });
});
