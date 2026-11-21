/**
 * s05-02 background jobs console, through the real endpoint wrapper with pg-boss and Prisma stood in
 * for: non-admins are refused on every endpoint, an unknown queue is 404, retry passes exactly the
 * parsed ids to pg-boss and is audited, more than 100 ids is 400, delete only reaches failed or
 * cancelled jobs, the raw queries name pg-boss's real tables and columns, and a job's data is
 * redacted and capped at 8 KB.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Prisma } from '@prisma/client';

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
      queues:
        new Set<string>(),
      audits:
        [] as {
          adminId: string;
          action: string;
          opts: Record<
            string,
            unknown
          >;
        }[],
      raw: [] as {
        sql: string;
        values: unknown[];
      }[],
      rawRows:
        [] as unknown[],
      boss: {
        getQueue:
          vi.fn(),
        getQueues:
          vi.fn(),
        getSchedules:
          vi.fn(),
        previewSchedule:
          vi.fn(),
        findJobs:
          vi.fn(),
        retry:
          vi.fn(),
        cancel:
          vi.fn(),
        deleteJob:
          vi.fn(),
      },
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
vi.mock(
  '@/lib/jobs/boss.server',
  () => ({
    PGBOSS_SCHEMA:
      'pgboss',
    getBoss:
      vi.fn(
        async () =>
          h.boss,
      ),
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => {
    const prisma = {
      $queryRaw: vi.fn(async (q: { sql: string; values: unknown[] }) => {
        h.raw.push({ sql: q.sql, values: q.values });
        return h.rawRows;
      }),
      // pg-boss statements run on the transaction connection through this adapter.
      $queryRawUnsafe: vi.fn(async () => []),
      // The transaction hands the same mock back as `tx`.
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    return { prisma };
  },
);

const ID1 =
  '11111111-1111-4111-8111-111111111111';
const ID2 =
  '22222222-2222-4222-8222-222222222222';
const ID3 =
  '33333333-3333-4333-8333-333333333333';

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
    | 'queues'
    | 'queue'
    | 'job'
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
        queues:
          () =>
            import('@/lib/admin/api/admin.jobs.server'),
        queue:
          () =>
            import('@/lib/admin/api/admin.jobs.$queue.server'),
        job: () =>
          import('@/lib/admin/api/admin.jobs.$queue.$id.server'),
        actions:
          () =>
            import('@/lib/admin/api/admin.jobs.$queue.actions.server'),
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
            `https://rmhstudios.com/api/admin/jobs${opts.query ?? ''}`,
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
      )) as Record<
      string,
      unknown
    > | null,
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

beforeEach(
  () => {
    h.session =
      null;
    h.queues =
      new Set(
        [
          'digest.send',
        ],
      );
    h.audits.length = 0;
    h.raw.length = 0;
    h.rawRows =
      [];
    for (const fn of Object.values(
      h.boss,
    ))
      fn.mockReset();
    h.boss.getQueue.mockImplementation(
      async (
        n: string,
      ) =>
        h.queues.has(
          n,
        )
          ? {
              name: n,
            }
          : null,
    );
    h.boss.getQueues.mockResolvedValue(
      [],
    );
    h.boss.getSchedules.mockResolvedValue(
      [],
    );
    h.boss.retry.mockImplementation(
      async (
        _q: string,
        ids: string[],
      ) => ({
        affected:
          ids.length,
      }),
    );
    h.boss.cancel.mockImplementation(
      async (
        _q: string,
        ids: string[],
      ) => ({
        affected:
          ids.length,
      }),
    );
    h.boss.deleteJob.mockImplementation(
      async (
        _q: string,
        ids: string[],
      ) => ({
        affected:
          ids.length,
      }),
    );
  },
);

describe('s05-02 admin jobs: access', () => {
  const requests =
    [
      () =>
        call(
          'queues',
          'GET',
          {},
        ),
      () =>
        call(
          'queue',
          'GET',
          {
            queue:
              'digest.send',
          },
          {
            query:
              '?state=failed',
          },
        ),
      () =>
        call(
          'job',
          'GET',
          {
            queue:
              'digest.send',
            id: ID1,
          },
        ),
      () =>
        call(
          'actions',
          'POST',
          {
            queue:
              'digest.send',
          },
          {
            body: {
              action:
                'retry',
              ids: ID1,
            },
          },
        ),
    ];

  it('refuses a signed-out caller with 401 and a non-admin with 403, on every endpoint', async () => {
    for (const request of requests) {
      h.session =
        null;
      expect(
        (
          await request()
        )
          .status,
      ).toBe(
        401,
      );
      h.session =
        {
          user: {
            id: 'member',
            isAdmin: false,
          },
        };
      expect(
        (
          await request()
        )
          .status,
      ).toBe(
        403,
      );
    }
    expect(
      h
        .boss
        .retry,
    ).not.toHaveBeenCalled();
    expect(
      h.raw,
    ).toHaveLength(
      0,
    );
  });

  it('answers 404 for an unknown queue on the list, the job and the actions', async () => {
    admin();
    expect(
      (
        await call(
          'queue',
          'GET',
          {
            queue:
              'nope',
          },
          {
            query:
              '?state=failed',
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
          'job',
          'GET',
          {
            queue:
              'nope',
            id: ID1,
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
          'actions',
          'POST',
          {
            queue:
              'nope',
          },
          {
            body: {
              action:
                'retry',
              ids: ID1,
            },
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
    // A name outside the allowed pattern never reaches pg-boss.
    h.boss.getQueue.mockClear();
    expect(
      (
        await call(
          'queue',
          'GET',
          {
            queue:
              'Bad Name;',
          },
          {
            query:
              '?state=failed',
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
    expect(
      h
        .boss
        .getQueue,
    ).not.toHaveBeenCalled();
    expect(
      h
        .boss
        .retry,
    ).not.toHaveBeenCalled();
  });
});

describe('s05-02 admin jobs: actions', () => {
  it('retry passes exactly the parsed ids to pg-boss and writes the audit row', async () => {
    admin();
    const r =
      await call(
        'actions',
        'POST',
        {
          queue:
            'digest.send',
        },
        {
          body: {
            action:
              'retry',
            ids: `${ID1}, ${ID2.toUpperCase()},${ID3},${ID1}`,
          },
        },
      );
    expect(
      r.status,
    ).toBe(
      200,
    );
    expect(
      r.json,
    ).toEqual(
      {
        requested: 3,
        affected: 3,
      },
    );
    expect(
      h
        .boss
        .retry,
    ).toHaveBeenCalledWith(
      'digest.send',
      [
        ID1,
        ID2,
        ID3,
      ],
      expect.objectContaining({ db: expect.anything() }),
    );
    expect(
      h.audits,
    ).toHaveLength(
      1,
    );
    expect(
      h
        .audits[0],
    ).toMatchObject(
      {
        adminId:
          'admin-1',
        action:
          'jobs.retry',
      },
    );
    expect(
      h
        .audits[0]!
        .opts,
    ).toMatchObject(
      {
        targetType:
          'pgboss_job',
        targetId: `${ID1}+2`,
      },
    );
    expect(
      String(
        h
          .audits[0]!
          .opts
          .detail,
      ),
    ).toContain(
      'queue=digest.send',
    );
    expect(
      String(
        h
          .audits[0]!
          .opts
          .detail,
      ),
    ).toContain(
      ID3,
    );
  });

  it('a single job is audited by its own id (the target column holds 64 characters)', async () => {
    admin();
    await call(
      'actions',
      'POST',
      {
        queue:
          'digest.send',
      },
      {
        body: {
          action:
            'cancel',
          ids: ID1,
        },
      },
    );
    expect(
      h
        .boss
        .cancel,
    ).toHaveBeenCalledWith(
      'digest.send',
      [
        ID1,
      ],
      expect.objectContaining({ db: expect.anything() }),
    );
    expect(
      h
        .audits[0]!
        .action,
    ).toBe(
      'jobs.cancel',
    );
    expect(
      h
        .audits[0]!
        .opts
        .targetId,
    ).toBe(
      ID1,
    );
    expect(
      String(
        h
          .audits[0]!
          .opts
          .targetId,
      )
        .length,
    ).toBeLessThanOrEqual(
      64,
    );
  });

  it('accepts 100 ids and refuses 101, an empty list and a non-UUID with 400', async () => {
    admin();
    const uuid =
      (
        n: number,
      ) =>
        `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const list =
      (
        n: number,
      ) =>
        Array.from(
          {
            length:
              n,
          },
          (
            _,
            i,
          ) =>
            uuid(
              i,
            ),
        ).join(
          ',',
        );
    const run =
      (
        ids: string,
        action = 'retry',
      ) =>
        call(
          'actions',
          'POST',
          {
            queue:
              'digest.send',
          },
          {
            body: {
              action,
              ids,
            },
          },
        );
    expect(
      (
        await run(
          list(
            100,
          ),
        )
      )
        .status,
    ).toBe(
      200,
    );
    h.boss.retry.mockClear();
    expect(
      (
        await run(
          list(
            101,
          ),
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      (
        await run(
          '',
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      (
        await run(
          'not-a-uuid',
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      (
        await run(
          ID1,
          'purge',
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      h
        .boss
        .retry,
    ).not.toHaveBeenCalled();
    expect(
      h.audits,
    ).toHaveLength(
      1,
    );
  });

  it('delete reaches only failed or cancelled jobs', async () => {
    admin();
    h.rawRows =
      [
        {
          id: ID1,
        },
      ];
    const r =
      await call(
        'actions',
        'POST',
        {
          queue:
            'digest.send',
        },
        {
          body: {
            action:
              'delete',
            ids: `${ID1},${ID2}`,
          },
        },
      );
    expect(
      r.json,
    ).toEqual(
      {
        requested: 2,
        affected: 1,
      },
    );
    expect(
      h
        .boss
        .deleteJob,
    ).toHaveBeenCalledWith(
      'digest.send',
      [
        ID1,
      ],
      expect.objectContaining({ db: expect.anything() }),
    );
    expect(
      h
        .raw[0]!
        .sql,
    ).toContain(
      `state IN ('failed'::"pgboss"."job_state", 'cancelled'::"pgboss"."job_state")`,
    );
    // The check locks the rows it found, so the delete cannot race a state change.
    expect(
      h
        .raw[0]!
        .sql,
    ).toContain(
      'FOR UPDATE',
    );
    expect(
      h
        .audits[0]!
        .action,
    ).toBe(
      'jobs.delete',
    );

    h.rawRows =
      [];
    h.boss.deleteJob.mockClear();
    const none =
      await call(
        'actions',
        'POST',
        {
          queue:
            'digest.send',
        },
        {
          body: {
            action:
              'delete',
            ids: ID2,
          },
        },
      );
    expect(
      none.json,
    ).toEqual(
      {
        requested: 1,
        affected: 0,
      },
    );
    expect(
      h
        .boss
        .deleteJob,
    ).not.toHaveBeenCalled();
  });

  it('rolls the action back when the audit row cannot be written', async () => {
    admin();
    const audit = await import('@/lib/admin-audit.server');
    vi.mocked(audit.recordAdminActionIn).mockRejectedValueOnce(
      new Error('audit down'),
    );
    const r = await call(
      'actions',
      'POST',
      { queue: 'digest.send' },
      { body: { action: 'cancel', ids: ID1 } },
    );
    // The error propagates out of the transaction (so Prisma rolls the cancel back): no 2xx.
    expect(r.status).toBeGreaterThanOrEqual(500);
  });

  it('never echoes a caught error', async () => {
    admin();
    h.boss.retry.mockRejectedValue(
      new Error(
        'connection string postgres://secret@db',
      ),
    );
    const r =
      await call(
        'actions',
        'POST',
        {
          queue:
            'digest.send',
        },
        {
          body: {
            action:
              'retry',
            ids: ID1,
          },
        },
      );
    expect(
      r.status,
    ).toBe(
      500,
    );
    expect(
      JSON.stringify(
        r.json,
      ),
    ).not.toContain(
      'secret',
    );
  });
});

describe('s05-02 admin jobs: raw SQL names pg-boss tables and columns', () => {
  it('the per-state list reads pgboss.job with its snake_case columns, keyset on (created_on, id)', async () => {
    admin();
    h.rawRows =
      [];
    await call(
      'queue',
      'GET',
      {
        queue:
          'digest.send',
      },
      {
        query:
          '?state=failed',
      },
    );
    const {
      sql,
      values,
    } =
      h
        .raw[0]!;
    expect(
      sql,
    ).toContain(
      'FROM "pgboss"."job"',
    );
    for (const col of [
      'id',
      'created_on',
      'started_on',
      'completed_on',
      'retry_count',
      'retry_limit',
      'output',
      'name',
      'state',
    ]) {
      expect(
        sql,
      ).toMatch(
        new RegExp(
          `\\b${col}\\b`,
        ),
      );
    }
    expect(
      sql,
    ).toContain(
      '::"pgboss"."job_state"',
    );
    expect(
      sql,
    ).toContain(
      'ORDER BY created_on DESC, id DESC',
    );
    expect(
      sql,
    ).toContain(
      'LIMIT',
    );
    expect(
      sql,
    ).not.toContain(
      'count(',
    );
    expect(
      values,
    ).toEqual(
      [
        'digest.send',
        'failed',
        51,
      ],
    );
    // Not the Prisma-cased names.
    expect(
      sql,
    ).not.toMatch(
      /"createdOn"|"retryCount"|"startedOn"/,
    );
  });

  it('the next page adds the keyset and binds the cursor, never splicing it into the SQL', async () => {
    admin();
    const cursor = `2026-11-20T10:00:00.123456Z_${ID1}`;
    await call(
      'queue',
      'GET',
      {
        queue:
          'digest.send',
      },
      {
        query: `?state=retry&after=${cursor}`,
      },
    );
    const {
      sql,
      values,
    } =
      h
        .raw[0]!;
    expect(
      sql,
    ).toContain(
      '(created_on, id) < (?::timestamptz, ?::uuid)',
    );
    expect(
      values,
    ).toContain(
      '2026-11-20T10:00:00.123456Z',
    );
    expect(
      values,
    ).toContain(
      ID1,
    );
    expect(
      sql,
    ).not.toContain(
      '2026-11-20',
    );
  });

  it('refuses an unknown state and a malformed cursor with 400', async () => {
    admin();
    expect(
      (
        await call(
          'queue',
          'GET',
          {
            queue:
              'digest.send',
          },
          {
            query:
              '?state=completed',
          },
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      (
        await call(
          'queue',
          'GET',
          {
            queue:
              'digest.send',
          },
          {
            query:
              "?state=failed&after=x'; DROP TABLE",
          },
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      h.raw,
    ).toHaveLength(
      0,
    );
  });

  it('pages: 51 rows return 50 and the cursor of the 50th', async () => {
    admin();
    const row =
      (
        n: number,
      ) => ({
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        created_on:
          new Date(
            '2026-11-20T10:00:00Z',
          ),
        started_on:
          null,
        completed_on:
          null,
        retry_count: 1,
        retry_limit: 3,
        error:
          'Boom\n  at x',
        cursor_key: `2026-11-20T10:00:00.000000Z_${n}`,
      });
    h.rawRows =
      Array.from(
        {
          length: 51,
        },
        (
          _,
          i,
        ) =>
          row(
            i,
          ),
      );
    const r =
      await call(
        'queue',
        'GET',
        {
          queue:
            'digest.send',
        },
        {
          query:
            '?state=failed',
        },
      );
    expect(
      (
        r
          .json!
          .jobs as unknown[]
      )
        .length,
    ).toBe(
      50,
    );
    expect(
      r
        .json!
        .nextCursor,
    ).toBe(
      '2026-11-20T10:00:00.000000Z_49',
    );
    expect(
      (
        r
          .json!
          .jobs as {
          error: string;
        }[]
      )[0]!
        .error,
    ).toBe(
      'Boom',
    );
    expect(
      h
        .raw[0]!
        .sql,
    ).toContain(
      'FROM "pgboss"."job"',
    );
  });

  it('the newest-failure query names the failed state and groups by queue name', async () => {
    admin();
    h.boss.getQueues.mockResolvedValue(
      [
        {
          name: 'digest.send',
          failedCount: 2,
          readyCount: 1,
          deferredCount: 0,
          activeCount: 0,
          totalCount: 5,
          policy:
            'standard',
        },
        {
          name: 'clean',
          failedCount: 0,
          readyCount: 0,
          deferredCount: 0,
          activeCount: 0,
          totalCount: 0,
        },
      ],
    );
    h.rawRows =
      [
        {
          name: 'digest.send',
          newest:
            new Date(
              '2026-11-20T10:00:00Z',
            ),
        },
      ];
    h.boss.getSchedules.mockResolvedValue(
      [
        {
          name: 'clean',
          key: '',
          kind: 'cron',
          cron: '0 * * * *',
          timezone:
            'UTC',
        },
      ],
    );
    h.boss.previewSchedule.mockReturnValue(
      [
        new Date(
          '2026-11-21T15:00:00Z',
        ),
      ],
    );
    const r =
      await call(
        'queues',
        'GET',
        {},
      );
    const {
      sql,
      values,
    } =
      h
        .raw[0]!;
    expect(
      sql,
    ).toContain(
      'FROM "pgboss"."job"',
    );
    expect(
      sql,
    ).toContain(
      'state = \'failed\'::"pgboss"."job_state"',
    );
    expect(
      sql,
    ).toMatch(
      /max\(completed_on\)/,
    );
    expect(
      sql,
    ).toContain(
      'GROUP BY name',
    );
    expect(
      values,
    ).toEqual(
      [
        [
          'digest.send',
        ],
      ],
    );
    const queues =
      r
        .json!
        .queues as {
        name: string;
        newestFailureAt:
          | string
          | null;
        schedules: {
          nextRunAt: string;
        }[];
      }[];
    expect(
      queues.map(
        (
          q,
        ) =>
          q.name,
      ),
    ).toEqual(
      [
        'digest.send',
        'clean',
      ],
    );
    expect(
      queues[0]!
        .newestFailureAt,
    ).toBe(
      '2026-11-20T10:00:00.000Z',
    );
    expect(
      queues[1]!
        .schedules[0]!
        .nextRunAt,
    ).toBe(
      '2026-11-21T15:00:00.000Z',
    );
    expect(
      h
        .boss
        .previewSchedule,
    ).toHaveBeenCalledWith(
      '0 * * * *',
      {
        tz: 'UTC',
        count: 1,
      },
    );
  });

  it('the schema is a constant identifier, not a bind parameter', () => {
    expect(
      Prisma.raw(
        '"pgboss"."job"',
      )
        .sql,
    ).toBe(
      '"pgboss"."job"',
    );
  });
});

describe('s05-02 admin jobs: one job', () => {
  it('truncates data over 8 KB, redacts secrets, and returns the timestamps', async () => {
    admin();
    h.boss.findJobs.mockResolvedValue(
      [
        {
          id: ID1,
          state:
            'failed',
          data: {
            apiToken:
              'sekret',
            nested:
              {
                password:
                  'p',
              },
            subject:
              'x'.repeat(
                20_000,
              ),
          },
          output:
            {
              message:
                'Boom',
              stack:
                'at y',
            },
          createdOn:
            new Date(
              '2026-11-20T10:00:00Z',
            ),
          startedOn:
            new Date(
              '2026-11-20T10:00:01Z',
            ),
          completedOn:
            new Date(
              '2026-11-20T10:00:02Z',
            ),
          startAfter:
            new Date(
              '2026-11-20T10:00:00Z',
            ),
          retryCount: 2,
          retryLimit: 3,
          singletonKey:
            'k',
          deadLetter:
            'dlq',
        },
      ],
    );
    const r =
      await call(
        'job',
        'GET',
        {
          queue:
            'digest.send',
          id: ID1,
        },
      );
    expect(
      h
        .boss
        .findJobs,
    ).toHaveBeenCalledWith(
      'digest.send',
      {
        id: ID1,
        limit: 1,
      },
    );
    const job =
      r
        .json!
        .job as {
        data: {
          text: string;
          truncated: boolean;
        };
        output: {
          text: string;
          truncated: boolean;
        };
        singletonKey: string;
        deadLetter: string;
      };
    expect(
      job
        .data
        .truncated,
    ).toBe(
      true,
    );
    expect(
      new TextEncoder().encode(
        job
          .data
          .text,
      )
        .length,
    ).toBeLessThanOrEqual(
      8192,
    );
    expect(
      job
        .data
        .text,
    ).toContain(
      '[redacted]',
    );
    expect(
      job
        .data
        .text,
    ).not.toContain(
      'sekret',
    );
    expect(
      job
        .output
        .truncated,
    ).toBe(
      false,
    );
    expect(
      job.singletonKey,
    ).toBe(
      'k',
    );
    expect(
      job.deadLetter,
    ).toBe(
      'dlq',
    );
  });

  it('is 404 for a job that does not exist and for an id that is not a UUID', async () => {
    admin();
    h.boss.findJobs.mockResolvedValue(
      [],
    );
    expect(
      (
        await call(
          'job',
          'GET',
          {
            queue:
              'digest.send',
            id: ID1,
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
          'job',
          'GET',
          {
            queue:
              'digest.send',
            id: 'x',
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
  });
});
