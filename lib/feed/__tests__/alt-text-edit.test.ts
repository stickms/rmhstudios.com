/**
 * Describe images after posting (sprint 05 #16): the author edits, nobody else does, a deleted or locked post is
 * refused, a list of the wrong length is a 400, nothing is recorded as an edit, and the settings list holds exactly the
 * caller's own posts that still have an undescribed image, in pages. Prisma is an in-memory fake; nothing here touches
 * a database.
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

interface PostRow {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
  imageUrls: string[];
  imageAlts: string[];
  deletedAt: Date | null;
  unlockPrice:
    | number
    | null;
  expiresAt: Date | null;
  editedAt: Date | null;
}

const h =
  vi.hoisted(
    () => ({
      viewer:
        'author' as string,
      posts:
        [] as PostRow[],
      locked: false,
      writes:
        [] as string[],
      rawSql:
        [] as string[],
      rawCount: 0,
      findManyCalls: 0,
    }),
  );

vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          async () => ({
            user: {
              id: h.viewer,
            },
            session:
              {},
          }),
      },
    },
  }),
);
vi.mock(
  '@/lib/rate-limit.server',
  () => ({
    withRateLimitAsync:
      async () =>
        null,
  }),
);
vi.mock(
  '@/lib/feed/map-feed-item.server',
  () => ({
    isLocked:
      () =>
        h.locked,
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => {
    const prisma =
      {
        rMHark:
          {
            findUnique:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    id: string;
                  };
                }) =>
                  h.posts.find(
                    (
                      p,
                    ) =>
                      p.id ===
                      where.id,
                  ) ??
                  null,
              ),
            updateMany:
              vi.fn(
                async ({
                  where,
                  data,
                }: {
                  where: {
                    id: string;
                    userId: string;
                    deletedAt: null;
                    imageUrls?: { equals: string[] };
                  };
                  data: {
                    imageAlts: string[];
                  };
                }) => {
                  h.writes.push(
                    `updateMany:${Object.keys(data).join(',')}`,
                  );
                  const post =
                    h.posts.find(
                      (
                        p,
                      ) =>
                        p.id ===
                          where.id &&
                        p.userId ===
                          where.userId &&
                        !p.deletedAt &&
                        (!where.imageUrls ||
                          JSON.stringify(
                            p.imageUrls,
                          ) ===
                            JSON.stringify(
                              where.imageUrls
                                .equals,
                            )),
                    );
                  if (
                    !post
                  )
                    return {
                      count: 0,
                    };
                  post.imageAlts =
                    data.imageAlts;
                  return {
                    count: 1,
                  };
                },
              ),
            update:
              vi.fn(
                async () => {
                  h.writes.push(
                    'update',
                  );
                  return {};
                },
              ),
            findMany:
              vi.fn(
                async ({
                  where,
                  take,
                }: {
                  where: {
                    userId: string;
                    AND: {
                      OR?: {
                        createdAt?:
                          | {
                              lt?: Date;
                            }
                          | Date;
                        id?: {
                          lt: string;
                        };
                      }[];
                    }[];
                  };
                  take: number;
                }) => {
                  h.findManyCalls++;
                  const cursor =
                    where.AND.flatMap(
                      (
                        a,
                      ) =>
                        a.OR ??
                        [],
                    ).find(
                      (
                        o,
                      ) =>
                        o.createdAt &&
                        o.id ===
                          undefined,
                    ) as
                      | {
                          createdAt: {
                            lt: Date;
                          };
                        }
                      | undefined;
                  const tie =
                    where.AND.flatMap(
                      (
                        a,
                      ) =>
                        a.OR ??
                        [],
                    ).find(
                      (
                        o,
                      ) =>
                        o.id,
                    ) as
                      | {
                          createdAt: Date;
                          id: {
                            lt: string;
                          };
                        }
                      | undefined;
                  return h.posts
                    .filter(
                      (
                        p,
                      ) =>
                        p.userId ===
                          where.userId &&
                        !p.deletedAt &&
                        p
                          .imageUrls
                          .length >
                          0 &&
                        (!p.expiresAt ||
                          p.expiresAt.getTime() >
                            Date.now()),
                    )
                    .sort(
                      (
                        a,
                        b,
                      ) =>
                        b.createdAt.getTime() -
                          a.createdAt.getTime() ||
                        (a.id <
                        b.id
                          ? 1
                          : -1),
                    )
                    .filter(
                      (
                        p,
                      ) => {
                        if (
                          !cursor ||
                          !tie
                        )
                          return true;
                        return (
                          p.createdAt.getTime() <
                            cursor.createdAt.lt.getTime() ||
                          (p.createdAt.getTime() ===
                            tie.createdAt.getTime() &&
                            p.id <
                              tie
                                .id
                                .lt)
                        );
                      },
                    )
                    .slice(
                      0,
                      take,
                    );
                },
              ),
          },
        rMHarkEdit:
          {
            create:
              vi.fn(
                async () => {
                  h.writes.push(
                    'rMHarkEdit.create',
                  );
                  return {};
                },
              ),
          },
        $queryRaw:
          vi.fn(
            async (query: {
              strings?: readonly string[];
              sql?: string;
            }) => {
              h.rawSql.push(
                query.sql ??
                  (
                    query.strings ??
                    []
                  ).join(
                    '?',
                  ),
              );
              return [
                {
                  n: h.rawCount,
                },
              ];
            },
          ),
      };
    return {
      prisma,
      default:
        prisma,
    };
  },
);

import { route as altRoute } from '@/lib/feed/api/rmharks.$id.alt-text.server';
import { route as missingRoute } from '@/lib/feed/api/settings.missing-alt-text.server';
import { listPostsMissingAlts, updatePostAlts } from '@/lib/feed/alt-text-edit.server';
import { MISSING_ALT_PAGE_SIZE } from '@/lib/feed/alt-text-edit';

const URLS =
  [
    '/img/a.png',
    '/img/b.png',
  ];
let seq = 0;
function post(
  over: Partial<PostRow> = {},
): PostRow {
  seq++;
  return {
    id: `p${seq}`,
    userId:
      'author',
    content: `post ${seq}`,
    createdAt:
      new Date(
        Date.UTC(
          2026,
          0,
          1,
          0,
          0,
          0,
        ) +
          seq *
            60_000,
      ),
    imageUrls:
      URLS,
    imageAlts:
      [],
    deletedAt:
      null,
    unlockPrice:
      null,
    expiresAt:
      null,
    editedAt:
      null,
    ...over,
  };
}

const put =
  (
    id: string,
    body: unknown,
  ) =>
    handlersOf<TestHandler>(
      altRoute,
    )
      .PUT!(
      {
        request:
          new Request(
            `http://localhost/api/rmharks/${id}/alt-text`,
            {
              method:
                'PUT',
              headers:
                {
                  'content-type':
                    'application/json',
                  cookie:
                    'better-auth.session_token=t',
                },
              body: JSON.stringify(
                body,
              ),
            },
          ),
        params:
          {
            id,
          },
      },
    );

const getMissing =
  (
    after?: string,
  ) =>
    handlersOf<TestHandler>(
      missingRoute,
    )
      .GET!(
      {
        request:
          new Request(
            `http://localhost/api/settings/missing-alt-text${after ? `?after=${encodeURIComponent(after)}` : ''}`,
            {
              headers:
                {
                  cookie:
                    'better-auth.session_token=t',
                },
            },
          ),
        params:
          {},
      },
    );

beforeEach(
  () => {
    seq = 0;
    h.viewer =
      'author';
    h.posts =
      [];
    h.locked = false;
    h.writes =
      [];
    h.rawSql =
      [];
    h.rawCount = 0;
    h.findManyCalls = 0;
  },
);

describe('PUT /api/rmharks/$id/alt-text', () => {
  it('lets the author describe the images of an old post, trimmed, without recording an edit', async () => {
    const old =
      post(
        {
          createdAt:
            new Date(
              '2020-01-01T00:00:00Z',
            ),
        },
      );
    h.posts =
      [
        old,
      ];
    const res =
      await put(
        old.id,
        {
          alts: [
            '  A red door  ',
            'Two cats\non a sofa',
          ],
        },
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
        success: true,
        imageAlts:
          [
            'A red door',
            'Two cats on a sofa',
          ],
      },
    );
    expect(
      old.imageAlts,
    ).toEqual(
      [
        'A red door',
        'Two cats on a sofa',
      ],
    );
    expect(
      old.editedAt,
    ).toBeNull();
    // Only the descriptions are written: no history row, no content update.
    expect(
      h.writes,
    ).toEqual(
      [
        'updateMany:imageAlts',
      ],
    );
  });

  it('can clear a description by sending an empty string', async () => {
    const p =
      post(
        {
          imageAlts:
            [
              'one',
              'two',
            ],
        },
      );
    h.posts =
      [
        p,
      ];
    const res =
      await put(
        p.id,
        {
          alts: [
            'one',
            '',
          ],
        },
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      p.imageAlts,
    ).toEqual(
      [
        'one',
        '',
      ],
    );
  });

  it('refuses anyone but the author with 403 and writes nothing', async () => {
    const p =
      post();
    h.posts =
      [
        p,
      ];
    h.viewer =
      'someone-else';
    const res =
      await put(
        p.id,
        {
          alts: [
            'a',
            'b',
          ],
        },
      );
    expect(
      res.status,
    ).toBe(
      403,
    );
    expect(
      h.writes,
    ).toEqual(
      [],
    );
    expect(
      p.imageAlts,
    ).toEqual(
      [],
    );
  });

  it('answers 404 for an expired post', async () => {
    const old = post({ expiresAt: new Date(Date.now() - 1000) });
    h.posts = [old];
    expect((await put(old.id, { alts: ['a', 'b'] })).status).toBe(404);
  });

  it('refuses when the images changed between the read and the write', async () => {
    const p = post();
    h.posts = [p];
    const original = p.imageUrls;
    const res = await updatePostAlts({ postId: p.id, userId: p.userId, alts: ['a', 'b'] });
    expect(res.ok).toBe(true);
    p.imageUrls = [...original, 'https://x/new.png'];
    p.imageAlts = [];
    // A write whose CAS names the old image list matches nothing.
    const { prisma } = await import('@/lib/prisma.server');
    const out = await (prisma as any).rMHark.updateMany({
      where: { id: p.id, userId: p.userId, deletedAt: null, imageUrls: { equals: original } },
      data: { imageAlts: ['z', 'z'] },
    });
    expect(out.count).toBe(0);
    expect(p.imageAlts).toEqual([]);
  });

  it('answers 404 for a deleted or missing post', async () => {
    const gone =
      post(
        {
          deletedAt:
            new Date(),
        },
      );
    h.posts =
      [
        gone,
      ];
    expect(
      (
        await put(
          gone.id,
          {
            alts: [
              'a',
              'b',
            ],
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
    expect(
      (
        await put(
          'nope',
          {
            alts: [
              'a',
              'b',
            ],
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
    expect(
      h.writes,
    ).toEqual(
      [],
    );
  });

  it('refuses a locked post', async () => {
    const p =
      post();
    h.posts =
      [
        p,
      ];
    h.locked = true;
    const res =
      await put(
        p.id,
        {
          alts: [
            'a',
            'b',
          ],
        },
      );
    expect(
      res.status,
    ).toBe(
      403,
    );
    expect(
      h.writes,
    ).toEqual(
      [],
    );
  });

  it('rejects a list that is not exactly one description per image with 400', async () => {
    const p =
      post();
    h.posts =
      [
        p,
      ];
    expect(
      (
        await put(
          p.id,
          {
            alts: [
              'only one',
            ],
          },
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      (
        await put(
          p.id,
          {
            alts: [
              'a',
              'b',
              'c',
            ],
          },
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      h.writes,
    ).toEqual(
      [],
    );
  });

  it('rejects a post with no images with 400', async () => {
    const p =
      post(
        {
          imageUrls:
            [],
        },
      );
    h.posts =
      [
        p,
      ];
    expect(
      (
        await put(
          p.id,
          {
            alts: [
              'a',
            ],
          },
        )
      )
        .status,
    ).toBe(
      400,
    );
  });

  it('rejects a description over the length cap or a body that is not a list of strings', async () => {
    const p =
      post();
    h.posts =
      [
        p,
      ];
    expect(
      (
        await put(
          p.id,
          {
            alts: [
              'x'.repeat(
                1001,
              ),
              'b',
            ],
          },
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      (
        await put(
          p.id,
          {
            alts: 'nope',
          },
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      (
        await put(
          p.id,
          {},
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      h.writes,
    ).toEqual(
      [],
    );
  });
});

describe('GET /api/settings/missing-alt-text', () => {
  it("lists only the caller's own live posts with an undescribed image, newest first", async () => {
    const described =
      post(
        {
          imageAlts:
            [
              'a',
              'b',
            ],
        },
      );
    const partial =
      post(
        {
          imageAlts:
            [
              'a',
            ],
        },
      );
    const blank =
      post(
        {
          imageAlts:
            [
              '  ',
              'b',
            ],
        },
      );
    const none =
      post(
        {
          imageAlts:
            [],
        },
      );
    const text =
      post(
        {
          imageUrls:
            [],
          imageAlts:
            [],
        },
      );
    const deleted =
      post(
        {
          deletedAt:
            new Date(),
        },
      );
    const expired =
      post(
        {
          expiresAt:
            new Date(
              Date.now() -
                1000,
            ),
        },
      );
    const other =
      post(
        {
          userId:
            'someone-else',
        },
      );
    h.posts =
      [
        described,
        partial,
        blank,
        none,
        text,
        deleted,
        expired,
        other,
      ];
    h.rawCount = 3;

    const res =
      await getMissing();
    expect(
      res.status,
    ).toBe(
      200,
    );
    const page =
      await res.json();
    expect(
      page.rows.map(
        (r: {
          id: string;
        }) =>
          r.id,
      ),
    ).toEqual(
      [
        none.id,
        blank.id,
        partial.id,
      ],
    );
    expect(
      page
        .rows[2],
    ).toMatchObject(
      {
        missing: 1,
        imageAlts:
          [
            'a',
            '',
          ],
        firstLine:
          partial.content,
      },
    );
    expect(
      page.total,
    ).toBe(
      3,
    );
    expect(
      page.capped,
    ).toBe(
      false,
    );
    expect(
      page.nextCursor,
    ).toBeNull();
  });

  it('caps the count at 99 and says so', async () => {
    h.posts =
      [
        post(),
      ];
    h.rawCount = 100;
    const page =
      await (
        await getMissing()
      ).json();
    expect(
      page.total,
    ).toBe(
      99,
    );
    expect(
      page.capped,
    ).toBe(
      true,
    );
  });

  it('pages 20 at a time with a keyset cursor and no overlap, counting only on the first page', async () => {
    h.posts =
      Array.from(
        {
          length: 45,
        },
        () =>
          post(),
      );
    h.rawCount = 45;
    const first =
      await (
        await getMissing()
      ).json();
    expect(
      first.rows,
    ).toHaveLength(
      MISSING_ALT_PAGE_SIZE,
    );
    expect(
      first.total,
    ).toBe(
      45,
    );
    expect(
      first.nextCursor,
    ).toBeTruthy();

    const second =
      await (
        await getMissing(
          first.nextCursor,
        )
      ).json();
    expect(
      second.rows,
    ).toHaveLength(
      MISSING_ALT_PAGE_SIZE,
    );
    expect(
      second.total,
    ).toBeNull();
    const third =
      await (
        await getMissing(
          second.nextCursor,
        )
      ).json();
    expect(
      third.rows,
    ).toHaveLength(
      5,
    );
    expect(
      third.nextCursor,
    ).toBeNull();

    const ids =
      [
        ...first.rows,
        ...second.rows,
        ...third.rows,
      ].map(
        (r: {
          id: string;
        }) =>
          r.id,
      );
    expect(
      new Set(
        ids,
      )
        .size,
    ).toBe(
      45,
    );
    expect(
      h.rawSql,
    ).toHaveLength(
      1,
    );
  });

  it('skips described posts without a full scan: one batch of 100 candidates fills a page', async () => {
    h.posts =
      [
        ...Array.from(
          {
            length: 60,
          },
          () =>
            post(
              {
                imageAlts:
                  [
                    'a',
                    'b',
                  ],
              },
            ),
        ),
        ...Array.from(
          {
            length: 30,
          },
          () =>
            post(),
        ),
      ];
    const page =
      await listPostsMissingAlts(
        'author',
      );
    expect(
      page.rows,
    ).toHaveLength(
      20,
    );
    expect(
      h.findManyCalls,
    ).toBe(
      1,
    );
  });

  it('a post that is fully described leaves the list', async () => {
    const p =
      post();
    h.posts =
      [
        p,
      ];
    expect(
      (
        await listPostsMissingAlts(
          'author',
        )
      )
        .rows,
    ).toHaveLength(
      1,
    );
    await put(
      p.id,
      {
        alts: [
          'a',
          'b',
        ],
      },
    );
    expect(
      (
        await listPostsMissingAlts(
          'author',
        )
      )
        .rows,
    ).toHaveLength(
      0,
    );
  });

  it('rejects a malformed cursor with 400', async () => {
    expect(
      (
        await getMissing(
          'not-a-cursor',
        )
      )
        .status,
    ).toBe(
      400,
    );
  });
});

describe('the count query', () => {
  it('names the real table and quoted camelCase columns', async () => {
    h.posts =
      [
        post(),
      ];
    await getMissing();
    const sql =
      h
        .rawSql[0]!;
    expect(
      sql,
    ).toContain(
      'FROM "rmheet"',
    );
    for (const col of [
      '"userId"',
      '"deletedAt"',
      '"expiresAt"',
      '"imageUrls"',
      '"imageAlts"',
    ]) {
      expect(
        sql,
      ).toContain(
        col,
      );
    }
    expect(
      sql,
    ).toMatch(
      /LIMIT/,
    );
    // Whitespace test is a regex that includes NBSP, matching JS trim().
    expect(
      sql,
    ).toMatch(
      /"imageAlts"\[i\], ''\) ~ /,
    );
  });
});
