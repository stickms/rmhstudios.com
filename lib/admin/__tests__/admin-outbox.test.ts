/**
 * s05-03 outbox console, through the real endpoint wrapper with Prisma stood in for by a small
 * in-memory table: non-admins are refused on every endpoint, requeue touches only dead, undelivered
 * rows and resets attempts and the next attempt, "requeue all" stops at 500, discard deletes only
 * dead rows, every action is audited in the same transaction, ids and topics are validated, and a
 * payload is redacted and capped.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

interface Row {
  id: bigint;
  topic: string;
  payload: unknown;
  attempts: number;
  nextAttempt: Date;
  deliveredAt: Date | null;
  deadAt: Date | null;
  lastError:
    | string
    | null;
  createdAt: Date;
}

const h =
  vi.hoisted(
    () => ({
      session:
        null as {
          user: {
            id: string;
            isAdmin: boolean;
          };
        } | null,
      rows: [] as Row[],
      audits:
        [] as {
          adminId: string;
          action: string;
          opts: Record<
            string,
            unknown
          >;
        }[],
      failAudit: false,
      txCommitted: 0,
    }),
  );

vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          vi.fn(
            async () =>
              h.session,
          ),
      },
    },
  }),
);

vi.mock(
  '@/lib/admin-audit.server',
  () => ({
    recordAdminActionIn:
      vi.fn(
        async (
          _tx: unknown,
          adminId: string,
          action: string,
          opts: Record<
            string,
            unknown
          >,
        ) => {
          if (
            h.failAudit
          )
            throw new Error(
              'audit down',
            );
          h.audits.push(
            {
              adminId,
              action,
              opts,
            },
          );
        },
      ),
  }),
);

type Where =
  {
    id?: {
      in?: bigint[];
      lt?: bigint;
    };
    topic?: string;
    deliveredAt?: null | {
      gte: Date;
    };
    deadAt?: null | {
      not: null;
    };
    nextAttempt?: {
      lte: Date;
    };
  };

function matches(
  r: Row,
  w: Where,
): boolean {
  if (
    w
      .id
      ?.in &&
    !w.id.in.includes(
      r.id,
    )
  )
    return false;
  if (
    w
      .id
      ?.lt !==
      undefined &&
    !(
      r.id <
      w
        .id
        .lt
    )
  )
    return false;
  if (
    w.topic !==
      undefined &&
    r.topic !==
      w.topic
  )
    return false;
  if (
    w.deliveredAt ===
      null &&
    r.deliveredAt !==
      null
  )
    return false;
  if (
    w.deliveredAt &&
    'gte' in
      w.deliveredAt &&
    !(
      r.deliveredAt &&
      r.deliveredAt >=
        w
          .deliveredAt
          .gte
    )
  )
    return false;
  if (
    w.deadAt ===
      null &&
    r.deadAt !==
      null
  )
    return false;
  if (
    w.deadAt &&
    'not' in
      w.deadAt &&
    r.deadAt ===
      null
  )
    return false;
  if (
    w.nextAttempt &&
    !(
      r.nextAttempt <=
      w
        .nextAttempt
        .lte
    )
  )
    return false;
  return true;
}

vi.mock(
  '@/lib/prisma.server',
  () => {
    const outboxEvent =
      {
        findMany:
          vi.fn(
            async (a: {
              where: Where;
              orderBy?: {
                id:
                  | 'asc'
                  | 'desc';
              };
              take?: number;
            }) => {
              const out =
                h.rows.filter(
                  (
                    r,
                  ) =>
                    matches(
                      r,
                      a.where,
                    ),
                );
              out.sort(
                (
                  x,
                  y,
                ) =>
                  a
                    .orderBy
                    ?.id ===
                  'asc'
                    ? x.id <
                      y.id
                      ? -1
                      : 1
                    : x.id <
                        y.id
                      ? 1
                      : -1,
              );
              return out.slice(
                0,
                a.take,
              );
            },
          ),
        findUnique:
          vi.fn(
            async (a: {
              where: {
                id: bigint;
              };
            }) =>
              h.rows.find(
                (
                  r,
                ) =>
                  r.id ===
                  a
                    .where
                    .id,
              ) ??
              null,
          ),
        updateMany:
          vi.fn(
            async (a: {
              where: Where;
              data: Partial<Row>;
            }) => {
              const hit =
                h.rows.filter(
                  (
                    r,
                  ) =>
                    matches(
                      r,
                      a.where,
                    ),
                );
              for (const r of hit)
                Object.assign(
                  r,
                  a.data,
                );
              return {
                count:
                  hit.length,
              };
            },
          ),
        deleteMany:
          vi.fn(
            async (a: {
              where: Where;
            }) => {
              const hit =
                h.rows.filter(
                  (
                    r,
                  ) =>
                    matches(
                      r,
                      a.where,
                    ),
                );
              h.rows =
                h.rows.filter(
                  (
                    r,
                  ) =>
                    !hit.includes(
                      r,
                    ),
                );
              return {
                count:
                  hit.length,
              };
            },
          ),
        groupBy:
          vi.fn(
            async (a: {
              where: Where;
            }) => {
              const by =
                new Map<
                  string,
                  Row[]
                >();
              for (const r of h.rows.filter(
                (
                  x,
                ) =>
                  matches(
                    x,
                    a.where,
                  ),
              ))
                by.set(
                  r.topic,
                  [
                    ...(by.get(
                      r.topic,
                    ) ??
                      []),
                    r,
                  ],
                );
              return [
                ...by,
              ].map(
                ([
                  topic,
                  rs,
                ]) => ({
                  topic,
                  _count:
                    {
                      _all: rs.length,
                    },
                  _min: {
                    createdAt:
                      rs
                        .map(
                          (
                            r,
                          ) =>
                            r.createdAt,
                        )
                        .sort(
                          (
                            x,
                            y,
                          ) =>
                            +x -
                            +y,
                        )[0],
                  },
                }),
              );
            },
          ),
      };
    const prisma =
      {
        outboxEvent,
        // The transaction rolls back every row change when its callback throws.
        $transaction:
          async (
            fn: (
              tx: unknown,
            ) => Promise<unknown>,
          ) => {
            const snapshot =
              h.rows.map(
                (
                  r,
                ) => ({
                  ...r,
                }),
              );
            const audits =
              h
                .audits
                .length;
            try {
              return await fn(
                prisma,
              );
            } catch (e) {
              h.rows =
                snapshot;
              h.audits.length =
                audits;
              throw e;
            }
          },
      };
    return {
      prisma,
    };
  },
);

const NOW =
  new Date(
    '2026-11-21T12:00:00Z',
  );
const ago =
  (
    ms: number,
  ) =>
    new Date(
      NOW.getTime() -
        ms,
    );
const row =
  (
    id:
      | number
      | bigint,
    over: Partial<Row> = {},
  ): Row => ({
    id: BigInt(
      id,
    ),
    topic:
      'webhook.post.created',
    payload:
      {
        postId:
          'p1',
      },
    attempts: 7,
    nextAttempt:
      ago(
        1000,
      ),
    deliveredAt:
      null,
    deadAt:
      ago(
        500,
      ),
    lastError:
      'HTTP 500\nstack line',
    createdAt:
      ago(
        60_000,
      ),
    ...over,
  });

/** The fields the tests read; each endpoint fills its own. */
interface Body {
  topics: Record<
    string,
    unknown
  >[];
  events: {
    id: string;
    error?: string;
  }[];
  nextCursor:
    | string
    | null;
  event: {
    id: string;
    lastError: string;
    payload: {
      text: string;
      truncated: boolean;
    };
  };
  requested: number;
  affected: number;
}

type Handlers =
  Record<
    string,
    (a: {
      request: Request;
      params: Record<
        string,
        string
      >;
    }) => Promise<Response>
  >;

async function call(
  mod:
    | 'summary'
    | 'events'
    | 'event'
    | 'actions',
  method:
    | 'GET'
    | 'POST',
  params: Record<
    string,
    string
  >,
  opts: {
    query?: string;
    body?: unknown;
  } = {},
) {
  const route =
    (
      await {
        summary:
          () =>
            import('@/lib/admin/api/admin.outbox.server'),
        events:
          () =>
            import('@/lib/admin/api/admin.outbox.events.server'),
        event:
          () =>
            import('@/lib/admin/api/admin.outbox.events.$id.server'),
        actions:
          () =>
            import('@/lib/admin/api/admin.outbox.actions.server'),
      }[
        mod
      ]()
    )
      .route;
  const res =
    await (
      route.handlers as Handlers
    )[
      method
    ]!(
      {
        request:
          new Request(
            `https://rmhstudios.com/api/admin/outbox${opts.query ?? ''}`,
            {
              method,
              headers:
                {
                  'content-type':
                    'application/json',
                  'cf-connecting-ip': `${Math.random()}`,
                  cookie:
                    'better-auth.session_token=abc',
                },
              ...(opts.body ===
              undefined
                ? {}
                : {
                    body: JSON.stringify(
                      opts.body,
                    ),
                  }),
            },
          ),
        params,
      },
    );
  return {
    status:
      res.status,
    json: (await res
      .json()
      .catch(
        () =>
          null,
      )) as Body | null,
  };
}

const admin =
  () => {
    h.session =
      {
        user: {
          id: 'admin-1',
          isAdmin: true,
        },
      };
  };
const act =
  (
    body: unknown,
  ) =>
    call(
      'actions',
      'POST',
      {},
      {
        body,
      },
    );

beforeEach(
  () => {
    h.session =
      null;
    h.rows =
      [];
    h.audits.length = 0;
    h.failAudit = false;
  },
);

describe('s05-03 admin outbox: access', () => {
  const requests =
    [
      () =>
        call(
          'summary',
          'GET',
          {},
        ),
      () =>
        call(
          'events',
          'GET',
          {},
          {
            query:
              '/events?topic=a&state=dead',
          },
        ),
      () =>
        call(
          'event',
          'GET',
          {
            id: '1',
          },
        ),
      () =>
        act(
          {
            action:
              'requeue',
            ids: '1',
          },
        ),
    ];
  it('refuses a signed-out visitor with 401 on every endpoint', async () => {
    h.rows =
      [
        row(
          1,
        ),
      ];
    for (const r of requests)
      expect(
        (
          await r()
        )
          .status,
      ).toBe(
        401,
      );
    expect(
      h
        .rows[0]!
        .deadAt,
    ).not.toBeNull();
  });
  it('refuses a signed-in non-admin with 403 on every endpoint and changes nothing', async () => {
    h.session =
      {
        user: {
          id: 'u1',
          isAdmin: false,
        },
      };
    h.rows =
      [
        row(
          1,
        ),
      ];
    for (const r of requests)
      expect(
        (
          await r()
        )
          .status,
      ).toBe(
        403,
      );
    expect(
      h.rows,
    ).toHaveLength(
      1,
    );
    expect(
      h
        .rows[0]!
        .deadAt,
    ).not.toBeNull();
    expect(
      h.audits,
    ).toHaveLength(
      0,
    );
  });
});

describe('s05-03 admin outbox: summary and lists', () => {
  it('counts due, scheduled, dead and recently delivered per topic, dead topics first', async () => {
    admin();
    h.rows =
      [
        row(
          1,
          {
            topic:
              'a.ok',
            deadAt:
              null,
            nextAttempt:
              ago(
                1000,
              ),
            attempts: 1,
          },
        ),
        row(
          2,
          {
            topic:
              'a.ok',
            deadAt:
              null,
            nextAttempt:
              new Date(
                Date.now() +
                  3_600_000,
              ),
            attempts: 3,
          },
        ),
        row(
          3,
          {
            topic:
              'a.ok',
            deliveredAt:
              new Date(),
            deadAt:
              null,
          },
        ),
        row(
          4,
          {
            topic:
              'z.dead',
          },
        ),
        row(
          5,
          {
            topic:
              'z.dead',
          },
        ),
      ];
    const {
      status,
      json,
    } =
      await call(
        'summary',
        'GET',
        {},
      );
    expect(
      status,
    ).toBe(
      200,
    );
    const topics =
      json!
        .topics as {
        topic: string;
        oldestPendingAt: string;
      }[];
    expect(
      topics.map(
        (
          t,
        ) =>
          t.topic,
      ),
    ).toEqual(
      [
        'z.dead',
        'a.ok',
      ],
    );
    expect(
      topics[0],
    ).toMatchObject(
      {
        dead: 2,
        pendingDue: 0,
        scheduled: 0,
      },
    );
    expect(
      topics[1],
    ).toMatchObject(
      {
        dead: 0,
        pendingDue: 1,
        scheduled: 1,
        delivered24h: 1,
      },
    );
    expect(
      topics[1]
        .oldestPendingAt,
    ).toEqual(
      expect.any(
        String,
      ),
    );
  });

  it('lists a topic newest first, 50 a page, with a keyset cursor, and never a delivered or other-topic row', async () => {
    admin();
    h.rows =
      [
        ...Array.from(
          {
            length: 55,
          },
          (
            _,
            i,
          ) =>
            row(
              i +
                1,
            ),
        ),
        row(
          100,
          {
            topic:
              'other',
          },
        ),
        row(
          101,
          {
            deliveredAt:
              new Date(),
            deadAt:
              null,
          },
        ),
        row(
          102,
          {
            deadAt:
              null,
          },
        ),
      ];
    const first =
      await call(
        'events',
        'GET',
        {},
        {
          query:
            '/events?topic=webhook.post.created&state=dead',
        },
      );
    expect(
      first.status,
    ).toBe(
      200,
    );
    expect(
      first
        .json!
        .events,
    ).toHaveLength(
      50,
    );
    expect(
      first
        .json!
        .events[0],
    ).toMatchObject(
      {
        id: '55',
        error:
          'HTTP 500',
      },
    );
    expect(
      first
        .json!
        .nextCursor,
    ).toBe(
      '6',
    );
    const second =
      await call(
        'events',
        'GET',
        {},
        {
          query:
            '/events?topic=webhook.post.created&state=dead&after=6',
        },
      );
    expect(
      second.json!.events.map(
        (
          e,
        ) =>
          e.id,
      ),
    ).toEqual(
      [
        '5',
        '4',
        '3',
        '2',
        '1',
      ],
    );
    expect(
      second
        .json!
        .nextCursor,
    ).toBeNull();
    const pending =
      await call(
        'events',
        'GET',
        {},
        {
          query:
            '/events?topic=webhook.post.created&state=pending',
        },
      );
    expect(
      pending.json!.events.map(
        (
          e,
        ) =>
          e.id,
      ),
    ).toEqual(
      [
        '102',
      ],
    );
  });

  it('validates the topic, state and cursor', async () => {
    admin();
    for (const q of [
      '/events?topic=Bad Topic&state=dead',
      '/events?topic=a&state=delivered',
      '/events?topic=a&state=dead&after=12x',
      '/events?topic=a&state=dead&after=-1',
      `/events?topic=${'a'.repeat(81)}&state=dead`,
      '/events?state=dead',
    ])
      expect(
        (
          await call(
            'events',
            'GET',
            {},
            {
              query:
                q,
            },
          )
        )
          .status,
      ).toBe(
        400,
      );
  });
});

describe('s05-03 admin outbox: detail', () => {
  it('returns the payload redacted and the whole last error, ids as strings', async () => {
    admin();
    h.rows =
      [
        row(
          9007199254740993n,
          {
            payload:
              {
                url: 'https://x',
                headers:
                  {
                    Authorization:
                      'Bearer abc',
                  },
              },
          },
        ),
      ];
    const {
      status,
      json,
    } =
      await call(
        'event',
        'GET',
        {
          id: '9007199254740993',
        },
      );
    expect(
      status,
    ).toBe(
      200,
    );
    expect(
      json!
        .event
        .id,
    ).toBe(
      '9007199254740993',
    );
    expect(
      json!
        .event
        .lastError,
    ).toBe(
      'HTTP 500\nstack line',
    );
    expect(
      json!
        .event
        .payload
        .text,
    ).toContain(
      '[redacted]',
    );
    expect(
      json!
        .event
        .payload
        .text,
    ).not.toContain(
      'Bearer abc',
    );
  });
  it('cuts a large payload at 8 KB', async () => {
    admin();
    h.rows =
      [
        row(
          1,
          {
            payload:
              {
                blob: 'x'.repeat(
                  20_000,
                ),
              },
          },
        ),
      ];
    const {
      json,
    } =
      await call(
        'event',
        'GET',
        {
          id: '1',
        },
      );
    expect(
      json!
        .event
        .payload
        .truncated,
    ).toBe(
      true,
    );
    expect(
      new TextEncoder().encode(
        json!
          .event
          .payload
          .text,
      )
        .length,
    ).toBeLessThanOrEqual(
      8192,
    );
  });
  it('404s a missing event and an id that is not a bigint', async () => {
    admin();
    expect(
      (
        await call(
          'event',
          'GET',
          {
            id: '5',
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
    expect(
      (
        await call(
          'event',
          'GET',
          {
            id: 'abc',
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
    expect(
      (
        await call(
          'event',
          'GET',
          {
            id: '9999999999999999999',
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
  });
});

describe('s05-03 admin outbox: requeue', () => {
  it('revives only dead, undelivered rows, resets attempts and the next attempt, keeps the error, audits it', async () => {
    admin();
    h.rows =
      [
        row(
          1,
        ),
        row(
          2,
          {
            deadAt:
              null,
            attempts: 2,
          },
        ), // pending: untouched
        row(
          3,
          {
            deliveredAt:
              new Date(),
            deadAt:
              null,
          },
        ), // delivered meanwhile: untouched
      ];
    const before2 =
      {
        ...h
          .rows[1]!,
      };
    const {
      status,
      json,
    } =
      await act(
        {
          action:
            'requeue',
          ids: '1,2,3',
        },
      );
    expect(
      status,
    ).toBe(
      200,
    );
    expect(
      json,
    ).toEqual(
      {
        requested: 3,
        affected: 1,
      },
    );
    expect(
      h
        .rows[0],
    ).toMatchObject(
      {
        deadAt:
          null,
        attempts: 0,
        lastError:
          'HTTP 500\nstack line',
      },
    );
    expect(
      h.rows[0]!.nextAttempt.getTime(),
    ).toBeGreaterThan(
      Date.now() -
        5000,
    );
    expect(
      h
        .rows[1],
    ).toEqual(
      before2,
    );
    expect(
      h
        .rows[2]!
        .attempts,
    ).toBe(
      7,
    );
    expect(
      h.audits,
    ).toEqual(
      [
        {
          adminId:
            'admin-1',
          action:
            'outbox.requeue',
          opts: {
            targetType:
              'outbox_event',
            targetId:
              '1+2',
            detail:
              'affected=1/3 ids=1,2,3',
          },
        },
      ],
    );
  });

  it('audits a single id as itself', async () => {
    admin();
    h.rows =
      [
        row(
          42,
        ),
      ];
    await act(
      {
        action:
          'requeue',
        ids: '42',
      },
    );
    expect(
      h
        .audits[0]!
        .opts
        .targetId,
    ).toBe(
      '42',
    );
  });

  it('requeue all picks at most 500 dead events of the topic, oldest first, and leaves other topics', async () => {
    admin();
    h.rows =
      [
        ...Array.from(
          {
            length: 520,
          },
          (
            _,
            i,
          ) =>
            row(
              i +
                1,
            ),
        ),
        row(
          1000,
          {
            topic:
              'other',
          },
        ),
      ];
    const {
      json,
    } =
      await act(
        {
          action:
            'requeue',
          topic:
            'webhook.post.created',
          allDead: true,
        },
      );
    expect(
      json,
    ).toEqual(
      {
        requested: 500,
        affected: 500,
      },
    );
    const revived =
      h.rows.filter(
        (
          r,
        ) =>
          r.deadAt ===
          null,
      );
    expect(
      revived,
    ).toHaveLength(
      500,
    );
    expect(
      revived.every(
        (
          r,
        ) =>
          r.id <=
          500n,
      ),
    ).toBe(
      true,
    );
    expect(
      h.rows.find(
        (
          r,
        ) =>
          r.id ===
          1000n,
      )!
        .deadAt,
    ).not.toBeNull();
    expect(
      h
        .audits[0],
    ).toMatchObject(
      {
        action:
          'outbox.requeue',
        opts: {
          targetType:
            'outbox_event',
          targetId:
            'topic:webhook.post.created',
        },
      },
    );
    // The remainder is still there for a second pass.
    const again =
      await act(
        {
          action:
            'requeue',
          topic:
            'webhook.post.created',
          allDead: true,
        },
      );
    expect(
      again.json,
    ).toEqual(
      {
        requested: 20,
        affected: 20,
      },
    );
  });

  it('an empty topic requeues nothing and is still audited', async () => {
    admin();
    const {
      json,
    } =
      await act(
        {
          action:
            'requeue',
          topic:
            'nothing.here',
          allDead: true,
        },
      );
    expect(
      json,
    ).toEqual(
      {
        requested: 0,
        affected: 0,
      },
    );
    expect(
      h.audits,
    ).toHaveLength(
      1,
    );
  });

  it('rolls the change back when the audit row cannot be written', async () => {
    admin();
    h.rows =
      [
        row(
          1,
        ),
      ];
    h.failAudit = true;
    const {
      status,
    } =
      await act(
        {
          action:
            'requeue',
          ids: '1',
        },
      );
    expect(
      status,
    ).toBe(
      500,
    );
    expect(
      h
        .rows[0]!
        .deadAt,
    ).not.toBeNull();
    expect(
      h
        .rows[0]!
        .attempts,
    ).toBe(
      7,
    );
  });
});

describe('s05-03 admin outbox: discard', () => {
  it('deletes only dead, undelivered rows and audits it', async () => {
    admin();
    h.rows =
      [
        row(
          1,
        ),
        row(
          2,
          {
            deadAt:
              null,
          },
        ),
        row(
          3,
          {
            deliveredAt:
              new Date(),
            deadAt:
              null,
          },
        ),
        row(
          4,
        ),
      ];
    const {
      json,
    } =
      await act(
        {
          action:
            'discard',
          ids: '1,2,3,4',
        },
      );
    expect(
      json,
    ).toEqual(
      {
        requested: 4,
        affected: 2,
      },
    );
    expect(
      h.rows.map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        2n,
        3n,
      ],
    );
    expect(
      h
        .audits[0],
    ).toMatchObject(
      {
        action:
          'outbox.discard',
        opts: {
          targetType:
            'outbox_event',
        },
      },
    );
  });
  it('rolls the delete back when the audit row cannot be written', async () => {
    admin();
    h.rows =
      [
        row(
          1,
        ),
      ];
    h.failAudit = true;
    expect(
      (
        await act(
          {
            action:
              'discard',
            ids: '1',
          },
        )
      )
        .status,
    ).toBe(
      500,
    );
    expect(
      h.rows,
    ).toHaveLength(
      1,
    );
  });
});

describe('s05-03 admin outbox: input validation', () => {
  it('refuses malformed action requests without touching anything', async () => {
    admin();
    h.rows =
      [
        row(
          1,
        ),
      ];
    const bad: unknown[] =
      [
        {},
        {
          action:
            'delete',
          ids: '1',
        },
        {
          action:
            'requeue',
        },
        {
          action:
            'requeue',
          ids: '',
        },
        {
          action:
            'requeue',
          ids: '1,,2',
        },
        {
          action:
            'requeue',
          ids: '1,abc',
        },
        {
          action:
            'requeue',
          ids: '99999999999999999999',
        },
        {
          action:
            'requeue',
          ids: Array.from(
            {
              length: 101,
            },
            (
              _,
              i,
            ) =>
              i +
              1,
          ).join(
            ',',
          ),
        },
        {
          action:
            'requeue',
          ids: '1',
          allDead: true,
          topic:
            'a',
        },
        {
          action:
            'requeue',
          allDead: true,
        },
        {
          action:
            'requeue',
          topic:
            'a',
        },
        {
          action:
            'requeue',
          topic:
            'Bad Topic',
          allDead: true,
        },
        {
          action:
            'discard',
          topic:
            'a',
          allDead: true,
        },
        {
          action:
            'requeue',
          ids: '1',
          topic:
            'a',
        },
      ];
    for (const body of bad)
      expect(
        (
          await act(
            body,
          )
        )
          .status,
        JSON.stringify(
          body,
        ),
      ).toBe(
        400,
      );
    expect(
      h
        .rows[0]!
        .deadAt,
    ).not.toBeNull();
    expect(
      h.audits,
    ).toHaveLength(
      0,
    );
  });
  it('accepts exactly 100 ids and de-duplicates them', async () => {
    admin();
    h.rows =
      [
        row(
          1,
        ),
      ];
    const ids =
      Array.from(
        {
          length: 100,
        },
        (
          _,
          i,
        ) =>
          i +
          1,
      ).join(
        ',',
      );
    expect(
      (
        await act(
          {
            action:
              'requeue',
            ids,
          },
        )
      )
        .json,
    ).toEqual(
      {
        requested: 100,
        affected: 1,
      },
    );
    expect(
      (
        await act(
          {
            action:
              'requeue',
            ids: '5,5,5',
          },
        )
      )
        .json,
    ).toEqual(
      {
        requested: 1,
        affected: 0,
      },
    );
  });
});
