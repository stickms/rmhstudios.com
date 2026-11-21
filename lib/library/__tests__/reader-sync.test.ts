import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * The server half of reader sync: marks are the caller's alone, a book the caller cannot
 * open refuses, the caps hold under the member's lock, and a batch naming another member's
 * ids cannot reach their rows. Prisma is a small in-memory fake that records every query.
 */

interface Row {
  id: string;
  userId: string;
  docSlug: string;
  clientId: string;
  kind: string;
  page: number;
  location:
    | string
    | null;
  label:
    | string
    | null;
  body:
    | string
    | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const db =
  vi.hoisted(
    () => ({
      rows: [] as Row[],
      calls:
        [] as string[],
      seq: 0,
      readable:
        new Set<string>(),
    }),
  );

type Where =
  Record<
    string,
    unknown
  >;

function matches(
  row: Row,
  where: Where,
): boolean {
  for (const [
    key,
    cond,
  ] of Object.entries(
    where,
  )) {
    if (
      key ===
      'OR'
    ) {
      if (
        !(
          cond as Where[]
        ).some(
          (
            c,
          ) =>
            matches(
              row,
              c,
            ),
        )
      )
        return false;
      continue;
    }
    const value =
      (
        row as unknown as Record<
          string,
          unknown
        >
      )[
        key
      ];
    if (
      cond ===
      null
    ) {
      if (
        value !==
        null
      )
        return false;
    } else if (
      cond instanceof
      Date
    ) {
      if (
        !(
          value instanceof
          Date
        ) ||
        value.getTime() !==
          cond.getTime()
      )
        return false;
    } else if (
      typeof cond ===
      'object'
    ) {
      const c =
        cond as {
          in?: unknown[];
          gt?: Date;
          lt?: Date;
        };
      if (
        c.in &&
        !c.in.includes(
          value,
        )
      )
        return false;
      if (
        c.gt &&
        !(
          value instanceof
            Date &&
          value.getTime() >
            c.gt.getTime()
        )
      )
        return false;
      if (
        c.lt &&
        !(
          value instanceof
            Date &&
          value.getTime() <
            c.lt.getTime()
        )
      )
        return false;
    } else if (
      value !==
      cond
    )
      return false;
  }
  return true;
}

const model =
  vi.hoisted(
    () => {
      const m =
        {
          findMany:
            async (args: {
              where: Where;
              take?: number;
              orderBy?: unknown;
            }) => {
              db.calls.push(
                `findMany:${JSON.stringify(args.where)}`,
              );
              const rows =
                db.rows.filter(
                  (
                    r,
                  ) =>
                    matches(
                      r,
                      args.where,
                    ),
                );
              const by =
                args.orderBy as
                  | {
                      updatedAt?: 'desc';
                    }
                  | undefined;
              if (
                by &&
                !Array.isArray(
                  by,
                ) &&
                by.updatedAt ===
                  'desc'
              ) {
                rows.sort(
                  (
                    a,
                    b,
                  ) =>
                    b.updatedAt.getTime() -
                    a.updatedAt.getTime(),
                );
              }
              return rows.slice(
                0,
                args.take,
              );
            },
          count:
            async (args: {
              where: Where;
            }) => {
              db.calls.push(
                'count',
              );
              return db.rows.filter(
                (
                  r,
                ) =>
                  matches(
                    r,
                    args.where,
                  ),
              )
                .length;
            },
          create:
            async (args: {
              data: Partial<Row>;
            }) => {
              db.calls.push(
                `create:${args.data.userId}`,
              );
              const row =
                {
                  id: `row${++db.seq}`,
                  location:
                    null,
                  label:
                    null,
                  body: null,
                  deletedAt:
                    null,
                  createdAt:
                    new Date(),
                  updatedAt:
                    new Date(),
                  ...args.data,
                } as Row;
              db.rows.push(
                row,
              );
              return row;
            },
          update:
            async (args: {
              where: {
                userId_docSlug_clientId: {
                  userId: string;
                  docSlug: string;
                  clientId: string;
                };
              };
              data: Partial<Row>;
            }) => {
              const k =
                args
                  .where
                  .userId_docSlug_clientId;
              db.calls.push(
                `update:${k.userId}:${k.clientId}`,
              );
              const row =
                db.rows.find(
                  (
                    r,
                  ) =>
                    r.userId ===
                      k.userId &&
                    r.docSlug ===
                      k.docSlug &&
                    r.clientId ===
                      k.clientId,
                );
              if (
                !row
              )
                throw new Error(
                  'missing row',
                );
              Object.assign(
                row,
                args.data,
              );
              return row;
            },
          upsert:
            async (args: {
              where: {
                userId_docSlug_clientId: {
                  userId: string;
                  docSlug: string;
                  clientId: string;
                };
              };
              create: Partial<Row>;
              update: Partial<Row>;
            }) => {
              const k =
                args
                  .where
                  .userId_docSlug_clientId;
              db.calls.push(
                `upsert:${k.userId}:${k.clientId}`,
              );
              const row =
                db.rows.find(
                  (
                    r,
                  ) =>
                    r.userId ===
                      k.userId &&
                    r.docSlug ===
                      k.docSlug &&
                    r.clientId ===
                      k.clientId,
                );
              if (
                row
              )
                Object.assign(
                  row,
                  args.update,
                );
              else
                db.rows.push(
                  {
                    id: `row${++db.seq}`,
                    location:
                      null,
                    label:
                      null,
                    body: null,
                    deletedAt:
                      null,
                    createdAt:
                      new Date(),
                    updatedAt:
                      new Date(),
                    ...args.create,
                  } as Row,
                );
            },
          deleteMany:
            async (args: {
              where: Where;
            }) => {
              db.calls.push(
                `deleteMany:${JSON.stringify(args.where)}`,
              );
              const gone =
                db.rows.filter(
                  (
                    r,
                  ) =>
                    matches(
                      r,
                      args.where,
                    ),
                );
              db.rows =
                db.rows.filter(
                  (
                    r,
                  ) =>
                    !gone.includes(
                      r,
                    ),
                );
              return {
                count:
                  gone.length,
              };
            },
        };
      return m;
    },
  );

vi.mock(
  '@/lib/prisma.server',
  () => {
    const client =
      {
        libraryReaderMark:
          model,
        $transaction:
          async (
            fn: (
              tx: unknown,
            ) => unknown,
          ) =>
            fn(
              client,
            ),
      };
    return {
      prisma:
        client,
    };
  },
);
vi.mock(
  '@/lib/db/advisory-lock.server',
  () => ({
    lockKey:
      vi.fn(
        async (
          _tx: unknown,
          key: string,
        ) => {
          db.calls.push(
            `lock:${key}`,
          );
        },
      ),
  }),
);
vi.mock(
  '@/lib/library/library.server',
  () => ({
    getBook:
      vi.fn(
        async (
          slug: string,
        ) =>
          db.readable.has(
            slug,
          )
            ? {
                slug,
                title: `Book ${slug}`,
                coverUrl:
                  null,
                hue: 10,
                pages: 200,
              }
            : undefined,
      ),
  }),
);

const {
  deleteReaderMarks,
  exportReaderMarks,
  getReaderMarks,
  listContinueReading,
  putReaderMarks,
} =
  await import('@/lib/library/reader-sync.server');
const {
  MAX_MARKS_PER_BOOK,
  MAX_MARKS_PER_USER,
} =
  await import('@/lib/library/reader-sync');
const {
  putMarksBody,
} =
  await import('@/lib/library/reader-sync-schema');

const NOW = 1_800_000_000_000;
const id =
  (
    n: number,
  ) =>
    `mark-${String(n).padStart(20, '0')}`;

function mark(
  n: number,
  over: Record<
    string,
    unknown
  > = {},
) {
  return {
    id: id(
      n,
    ),
    kind: 'bookmark' as const,
    page: 3,
    label:
      'Page 3',
    body: null,
    createdAt:
      NOW -
      5000,
    updatedAt:
      NOW -
      1000,
    deletedAt:
      null,
    ...over,
  };
}

function seed(
  over: Partial<Row>,
): Row {
  const row: Row =
    {
      id: `row${++db.seq}`,
      userId:
        'u1',
      docSlug:
        'moby',
      clientId:
        id(
          1,
        ),
      kind: 'bookmark',
      page: 3,
      location:
        null,
      label:
        'Page 3',
      body: null,
      deletedAt:
        null,
      createdAt:
        new Date(
          NOW -
            5000,
        ),
      updatedAt:
        new Date(
          NOW -
            2000,
        ),
      ...over,
    };
  db.rows.push(
    row,
  );
  return row;
}

beforeEach(
  () => {
    db.rows =
      [];
    db.calls =
      [];
    db.seq = 0;
    db.readable =
      new Set(
        [
          'moby',
          'dune',
        ],
      );
  },
);

describe("reader marks are the caller's alone", () => {
  it("reads only the caller's rows for the book", async () => {
    seed(
      {
        userId:
          'u1',
        clientId:
          id(
            1,
          ),
      },
    );
    seed(
      {
        userId:
          'u2',
        clientId:
          id(
            2,
          ),
        label:
          'theirs',
      },
    );
    seed(
      {
        userId:
          'u1',
        docSlug:
          'dune',
        clientId:
          id(
            3,
          ),
      },
    );
    seed(
      {
        userId:
          'u1',
        kind: 'place',
        clientId:
          'place',
        page: 41,
        updatedAt:
          new Date(
            NOW,
          ),
      },
    );
    const res =
      await getReaderMarks(
        'u1',
        'moby',
        NOW,
      );
    expect(
      res?.marks.map(
        (
          m,
        ) =>
          m.id,
      ),
    ).toEqual(
      [
        id(
          1,
        ),
      ],
    );
    expect(
      res?.place,
    ).toEqual(
      {
        page: 41,
        location:
          null,
        updatedAt:
          NOW,
      },
    );
  });

  it("answers the caller's tombstones from the last 30 days and not older ones", async () => {
    seed(
      {
        clientId:
          id(
            1,
          ),
        deletedAt:
          new Date(
            NOW -
              86_400_000,
          ),
        updatedAt:
          new Date(
            NOW -
              86_400_000,
          ),
      },
    );
    seed(
      {
        clientId:
          id(
            2,
          ),
        deletedAt:
          new Date(
            NOW -
              31 *
                86_400_000,
          ),
        updatedAt:
          new Date(
            NOW -
              31 *
                86_400_000,
          ),
      },
    );
    const res =
      await getReaderMarks(
        'u1',
        'moby',
        NOW,
      );
    expect(
      res?.marks.map(
        (
          m,
        ) =>
          m.id,
      ),
    ).toEqual(
      [
        id(
          1,
        ),
      ],
    );
    expect(
      res
        ?.marks[0]
        ?.deletedAt,
    ).toBe(
      NOW -
        86_400_000,
    );
  });

  it('refuses a book the caller cannot open, on read and on write', async () => {
    db.readable.delete(
      'moby',
    );
    expect(
      await getReaderMarks(
        'u1',
        'moby',
        NOW,
      ),
    ).toBeNull();
    expect(
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
              ),
            ],
        },
        NOW,
      ),
    ).toBeNull();
    expect(
      db.rows,
    ).toHaveLength(
      0,
    );
    expect(
      db.calls,
    ).toEqual(
      [],
    );
  });

  it('lets a member remove their own synced data even for a book they can no longer open', async () => {
    db.readable.delete(
      'moby',
    );
    seed(
      {
        userId:
          'u1',
        clientId:
          id(
            1,
          ),
      },
    );
    seed(
      {
        userId:
          'u2',
        clientId:
          id(
            2,
          ),
      },
    );
    expect(
      await deleteReaderMarks(
        'u1',
        'moby',
      ),
    ).toBe(
      1,
    );
    expect(
      db.rows.map(
        (
          r,
        ) =>
          r.userId,
      ),
    ).toEqual(
      [
        'u2',
      ],
    );
  });

  it("cannot touch another member's rows with their ids in a batch", async () => {
    const theirs =
      seed(
        {
          userId:
            'u2',
          clientId:
            id(
              1,
            ),
          label:
            'theirs',
          updatedAt:
            new Date(
              NOW -
                9000,
            ),
        },
      );
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
                {
                  label:
                    'mine',
                  updatedAt:
                    NOW -
                    10,
                },
              ),
              mark(
                2,
                {
                  deletedAt:
                    NOW -
                    5,
                },
              ),
            ],
        },
        NOW,
      );
    expect(
      theirs.label,
    ).toBe(
      'theirs',
    );
    expect(
      theirs.updatedAt.getTime(),
    ).toBe(
      NOW -
        9000,
    );
    expect(
      db.rows.filter(
        (
          r,
        ) =>
          r.userId ===
          'u2',
      ),
    ).toHaveLength(
      1,
    );
    // The caller got their own row under the same client id; every write names the caller.
    expect(
      db.rows.find(
        (
          r,
        ) =>
          r.userId ===
            'u1' &&
          r.clientId ===
            id(
              1,
            ),
      )
        ?.label,
    ).toBe(
      'mine',
    );
    expect(
      res?.marks.map(
        (
          m,
        ) =>
          m.id,
      ),
    ).toContain(
      id(
        1,
      ),
    );
    for (const call of db.calls.filter(
      (
        c,
      ) =>
        /^(create|update|upsert):/.test(
          c,
        ),
    )) {
      expect(
        call.split(
          ':',
        )[1],
      ).toBe(
        'u1',
      );
    }
    for (const call of db.calls.filter(
      (
        c,
      ) =>
        c.startsWith(
          'findMany:',
        ) ||
        c.startsWith(
          'deleteMany:',
        ),
    )) {
      expect(
        call,
      ).toContain(
        '"userId":"u1"',
      );
    }
  });

  it("the place is the caller's own row with the fixed client id", async () => {
    seed(
      {
        userId:
          'u2',
        kind: 'place',
        clientId:
          'place',
        page: 99,
        updatedAt:
          new Date(
            NOW -
              9000,
          ),
      },
    );
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [],
          place:
            {
              page: 12,
              location:
                'c3:2',
              updatedAt:
                NOW -
                20,
            },
        },
        NOW,
      );
    expect(
      res?.place,
    ).toEqual(
      {
        page: 12,
        location:
          'c3:2',
        updatedAt:
          NOW -
          20,
      },
    );
    expect(
      db.rows.find(
        (
          r,
        ) =>
          r.userId ===
          'u2',
      )
        ?.page,
    ).toBe(
      99,
    );
    expect(
      db.rows.find(
        (
          r,
        ) =>
          r.userId ===
          'u1',
      )
        ?.clientId,
    ).toBe(
      'place',
    );
  });
});

describe('conflicts resolve on the server the same way as on the device', () => {
  it('a stale edit does not overwrite a newer stored one, and the answer says so', async () => {
    seed(
      {
        clientId:
          id(
            1,
          ),
        label:
          'fresh',
        updatedAt:
          new Date(
            NOW -
              100,
          ),
      },
    );
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
                {
                  label:
                    'old',
                  updatedAt:
                    NOW -
                    900,
                },
              ),
            ],
        },
        NOW,
      );
    expect(
      db
        .rows[0]
        ?.label,
    ).toBe(
      'fresh',
    );
    expect(
      res
        ?.marks[0]
        ?.label,
    ).toBe(
      'fresh',
    );
    expect(
      db.calls.some(
        (
          c,
        ) =>
          c.startsWith(
            'update:',
          ),
      ),
    ).toBe(
      false,
    );
  });

  it('a newer deletion wins and drops the note text; an older deletion does not', async () => {
    seed(
      {
        clientId:
          id(
            1,
          ),
        kind: 'note',
        body: 'secret words',
        label:
          '#ffd479',
        updatedAt:
          new Date(
            NOW -
              500,
          ),
      },
    );
    await putReaderMarks(
      'u1',
      'moby',
      {
        marks:
          [
            mark(
              1,
              {
                kind: 'note',
                body: 'x',
                deletedAt:
                  NOW -
                  800,
                updatedAt:
                  NOW -
                  800,
              },
            ),
          ],
      },
      NOW,
    );
    expect(
      db
        .rows[0]
        ?.deletedAt,
    ).toBeNull();
    await putReaderMarks(
      'u1',
      'moby',
      {
        marks:
          [
            mark(
              1,
              {
                kind: 'note',
                body: 'x',
                deletedAt:
                  NOW -
                  100,
                updatedAt:
                  NOW -
                  100,
              },
            ),
          ],
      },
      NOW,
    );
    expect(
      db.rows[0]?.deletedAt?.getTime(),
    ).toBe(
      NOW -
        100,
    );
    expect(
      db
        .rows[0]
        ?.body,
    ).toBeNull();
    expect(
      db
        .rows[0]
        ?.label,
    ).toBeNull();
  });

  it('a newer edit undoes an older deletion', async () => {
    seed(
      {
        clientId:
          id(
            1,
          ),
        deletedAt:
          new Date(
            NOW -
              500,
          ),
        updatedAt:
          new Date(
            NOW -
              500,
          ),
        label:
          null,
      },
    );
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
                {
                  label:
                    'back',
                  updatedAt:
                    NOW -
                    50,
                },
              ),
            ],
        },
        NOW,
      );
    expect(
      db
        .rows[0]
        ?.deletedAt,
    ).toBeNull();
    expect(
      db
        .rows[0]
        ?.label,
    ).toBe(
      'back',
    );
    expect(
      res
        ?.marks[0]
        ?.deletedAt,
    ).toBeNull();
  });

  it("clamps a client clock that runs ahead to the server's time", async () => {
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
                {
                  updatedAt:
                    NOW +
                    86_400_000,
                },
              ),
            ],
        },
        NOW,
      );
    expect(
      res
        ?.marks[0]
        ?.updatedAt,
    ).toBe(
      NOW,
    );
    expect(
      db.rows[0]?.updatedAt.getTime(),
    ).toBe(
      NOW,
    );
  });

  it('keeps the newer place', async () => {
    await putReaderMarks(
      'u1',
      'moby',
      {
        marks:
          [],
        place:
          {
            page: 50,
            location:
              null,
            updatedAt:
              NOW -
              10,
          },
      },
      NOW,
    );
    const stale =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [],
          place:
            {
              page: 7,
              location:
                null,
              updatedAt:
                NOW -
                500,
            },
        },
        NOW,
      );
    expect(
      stale
        ?.place
        ?.page,
    ).toBe(
      50,
    );
    expect(
      db.rows.filter(
        (
          r,
        ) =>
          r.kind ===
          'place',
      ),
    ).toHaveLength(
      1,
    );
  });

  it('never turns a bookmark into a note', async () => {
    seed(
      {
        clientId:
          id(
            1,
          ),
        kind: 'bookmark',
        updatedAt:
          new Date(
            NOW -
              500,
          ),
      },
    );
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
                {
                  kind: 'note',
                  body: 'hi',
                  updatedAt:
                    NOW -
                    5,
                },
              ),
            ],
        },
        NOW,
      );
    expect(
      db
        .rows[0]
        ?.kind,
    ).toBe(
      'bookmark',
    );
    expect(
      res
        ?.marks[0]
        ?.kind,
    ).toBe(
      'bookmark',
    );
  });

  it('a tombstone for a mark the server never had stores nothing', async () => {
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
                {
                  deletedAt:
                    NOW -
                    10,
                  updatedAt:
                    NOW -
                    10,
                },
              ),
            ],
        },
        NOW,
      );
    expect(
      db.rows,
    ).toHaveLength(
      0,
    );
    expect(
      res
        ?.marks[0]
        ?.deletedAt,
    ).toBe(
      NOW -
        10,
    );
  });

  it('prunes tombstones older than 30 days for the book it writes', async () => {
    seed(
      {
        clientId:
          id(
            9,
          ),
        deletedAt:
          new Date(
            NOW -
              31 *
                86_400_000,
          ),
        updatedAt:
          new Date(
            NOW -
              31 *
                86_400_000,
          ),
      },
    );
    await putReaderMarks(
      'u1',
      'moby',
      {
        marks:
          [
            mark(
              1,
            ),
          ],
      },
      NOW,
    );
    expect(
      db.rows.map(
        (
          r,
        ) =>
          r.clientId,
      ),
    ).toEqual(
      [
        id(
          1,
        ),
      ],
    );
  });
});

describe("caps hold under the member's lock", () => {
  it('takes the lock before it counts and before it writes', async () => {
    await putReaderMarks(
      'u1',
      'moby',
      {
        marks:
          [
            mark(
              1,
            ),
          ],
      },
      NOW,
    );
    const lock =
      db.calls.indexOf(
        'lock:reader-marks:u1',
      );
    expect(
      lock,
    ).toBe(
      0,
    );
    expect(
      db.calls.indexOf(
        'count',
      ),
    ).toBeGreaterThan(
      lock,
    );
    expect(
      db.calls.findIndex(
        (
          c,
        ) =>
          c.startsWith(
            'create:',
          ),
      ),
    ).toBeGreaterThan(
      db.calls.indexOf(
        'count',
      ),
    );
  });

  it('turns away new marks past 500 in a book and says which', async () => {
    for (
      let i = 0;
      i <
      MAX_MARKS_PER_BOOK -
        1;
      i++
    )
      seed(
        {
          clientId:
            id(
              1000 +
                i,
            ),
        },
      );
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
              ),
              mark(
                2,
              ),
              mark(
                3,
              ),
            ],
        },
        NOW,
      );
    expect(
      res?.rejected,
    ).toEqual(
      [
        id(
          2,
        ),
        id(
          3,
        ),
      ],
    );
    expect(
      res?.marks.map(
        (
          m,
        ) =>
          m.id,
      ),
    ).toEqual(
      [
        id(
          1,
        ),
      ],
    );
    expect(
      db.rows.filter(
        (
          r,
        ) =>
          r.docSlug ===
          'moby',
      ),
    ).toHaveLength(
      MAX_MARKS_PER_BOOK,
    );
  });

  it('turns away new marks past 5,000 across books, but still lets existing ones be edited', async () => {
    for (
      let i = 0;
      i <
      MAX_MARKS_PER_USER;
      i++
    )
      seed(
        {
          docSlug:
            i <
            400
              ? 'moby'
              : 'dune',
          clientId:
            id(
              2000 +
                i,
            ),
        },
      );
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
              ),
              mark(
                2000,
                {
                  label:
                    'edited',
                  updatedAt:
                    NOW -
                    1,
                },
              ),
            ],
        },
        NOW,
      );
    expect(
      res?.rejected,
    ).toEqual(
      [
        id(
          1,
        ),
      ],
    );
    expect(
      db.rows.find(
        (
          r,
        ) =>
          r.clientId ===
          id(
            2000,
          ),
      )
        ?.label,
    ).toBe(
      'edited',
    );
  });

  it("does not count another member's marks or a book's tombstones against the cap", async () => {
    for (
      let i = 0;
      i <
      MAX_MARKS_PER_BOOK;
      i++
    )
      seed(
        {
          userId:
            'u2',
          clientId:
            id(
              3000 +
                i,
            ),
        },
      );
    for (
      let i = 0;
      i <
      10;
      i++
    ) {
      seed(
        {
          clientId:
            id(
              4000 +
                i,
            ),
          deletedAt:
            new Date(
              NOW -
                1000,
            ),
          updatedAt:
            new Date(
              NOW -
                1000,
            ),
        },
      );
    }
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
              ),
            ],
        },
        NOW,
      );
    expect(
      res?.rejected,
    ).toEqual(
      [],
    );
  });

  it('a resurrection counts as a new live mark and a turned-away one stays deleted', async () => {
    for (
      let i = 0;
      i <
      MAX_MARKS_PER_BOOK;
      i++
    )
      seed(
        {
          clientId:
            id(
              5000 +
                i,
            ),
        },
      );
    seed(
      {
        clientId:
          id(
            1,
          ),
        deletedAt:
          new Date(
            NOW -
              900,
          ),
        updatedAt:
          new Date(
            NOW -
              900,
          ),
        label:
          null,
      },
    );
    const res =
      await putReaderMarks(
        'u1',
        'moby',
        {
          marks:
            [
              mark(
                1,
                {
                  updatedAt:
                    NOW -
                    10,
                },
              ),
            ],
        },
        NOW,
      );
    expect(
      res?.rejected,
    ).toEqual(
      [
        id(
          1,
        ),
      ],
    );
    expect(
      db.rows.find(
        (
          r,
        ) =>
          r.clientId ===
          id(
            1,
          ),
      )
        ?.deletedAt,
    ).not.toBeNull();
    expect(
      res
        ?.marks[0]
        ?.deletedAt,
    ).toBe(
      NOW -
        900,
    );
  });
});

describe('the batch schema', () => {
  const ok =
    {
      marks:
        [
          mark(
            1,
          ),
        ],
    };
  it('accepts a normal batch and defaults the marks', () => {
    expect(
      putMarksBody.safeParse(
        ok,
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      putMarksBody.parse(
        {},
      )
        .marks,
    ).toEqual(
      [],
    );
  });
  it('refuses more than 50 marks, a short client id, long text and bad pages', () => {
    expect(
      putMarksBody.safeParse(
        {
          marks:
            Array.from(
              {
                length: 51,
              },
              (
                _,
                i,
              ) =>
                mark(
                  i +
                    1,
                ),
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      putMarksBody.safeParse(
        {
          marks:
            [
              mark(
                1,
                {
                  id: 'short',
                },
              ),
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      putMarksBody.safeParse(
        {
          marks:
            [
              mark(
                1,
                {
                  id: 'a'.repeat(
                    41,
                  ),
                },
              ),
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      putMarksBody.safeParse(
        {
          marks:
            [
              mark(
                1,
                {
                  kind: 'note',
                  body: 'x'.repeat(
                    2001,
                  ),
                },
              ),
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      putMarksBody.safeParse(
        {
          marks:
            [
              mark(
                1,
                {
                  label:
                    'x'.repeat(
                      121,
                    ),
                },
              ),
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      putMarksBody.safeParse(
        {
          marks:
            [
              mark(
                1,
                {
                  page: 0,
                },
              ),
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      putMarksBody.safeParse(
        {
          marks:
            [
              mark(
                1,
                {
                  page: 100_001,
                },
              ),
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      putMarksBody.safeParse(
        {
          marks:
            [
              mark(
                1,
                {
                  body: 'a bookmark with text',
                },
              ),
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      putMarksBody.safeParse(
        {
          marks:
            [
              mark(
                1,
                {
                  kind: 'place',
                },
              ),
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
  it('limits the EPUB location to 200 characters', () => {
    const place =
      (
        location: string,
      ) => ({
        place:
          {
            page: 1,
            location,
            updatedAt:
              NOW,
          },
        marks:
          [],
      });
    expect(
      putMarksBody.safeParse(
        place(
          'x'.repeat(
            200,
          ),
        ),
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      putMarksBody.safeParse(
        place(
          'x'.repeat(
            201,
          ),
        ),
      )
        .success,
    ).toBe(
      false,
    );
  });
});

describe('Continue reading and the export', () => {
  it("lists the caller's books by latest place, leaving out finished and unreadable ones", async () => {
    db.readable.add(
      'done',
    );
    seed(
      {
        kind: 'place',
        clientId:
          'place',
        docSlug:
          'moby',
        page: 50,
        updatedAt:
          new Date(
            NOW -
              10,
          ),
      },
    );
    seed(
      {
        kind: 'place',
        clientId:
          'place',
        docSlug:
          'dune',
        page: 100,
        updatedAt:
          new Date(
            NOW -
              5,
          ),
      },
    );
    seed(
      {
        kind: 'place',
        clientId:
          'place',
        docSlug:
          'done',
        page: 200,
        updatedAt:
          new Date(
            NOW,
          ),
      },
    );
    seed(
      {
        kind: 'place',
        clientId:
          'place',
        docSlug:
          'gone',
        page: 4,
        updatedAt:
          new Date(
            NOW -
              1,
          ),
      },
    );
    seed(
      {
        userId:
          'u2',
        kind: 'place',
        clientId:
          'place',
        docSlug:
          'moby',
        page: 1,
        updatedAt:
          new Date(
            NOW,
          ),
      },
    );
    const books =
      await listContinueReading(
        'u1',
      );
    expect(
      books.map(
        (
          b,
        ) => [
          b.slug,
          b.percent,
        ],
      ),
    ).toEqual(
      [
        [
          'dune',
          50,
        ],
        [
          'moby',
          25,
        ],
      ],
    );
  });

  it("exports only the caller's live marks", async () => {
    seed(
      {
        clientId:
          id(
            1,
          ),
        label:
          'mine',
      },
    );
    seed(
      {
        clientId:
          id(
            2,
          ),
        deletedAt:
          new Date(
            NOW,
          ),
        label:
          null,
      },
    );
    seed(
      {
        userId:
          'u2',
        clientId:
          id(
            3,
          ),
        label:
          'theirs',
      },
    );
    const out =
      await exportReaderMarks(
        'u1',
      );
    expect(
      out.map(
        (
          o,
        ) =>
          o.label,
      ),
    ).toEqual(
      [
        'mine',
      ],
    );
    expect(
      out[0],
    ).toMatchObject(
      {
        book: 'moby',
        kind: 'bookmark',
        page: 3,
      },
    );
  });
});
