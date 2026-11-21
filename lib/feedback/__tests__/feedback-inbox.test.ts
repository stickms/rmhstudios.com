/**
 * s06-05 feedback inbox, through the real endpoint wrapper with Prisma stood in for by a small in-memory table:
 * non-admins are refused on every admin endpoint, "mine" never returns another member's rows or the internal note,
 * unticked context is not stored, over-cap context is refused, a query string is stripped, a reply notifies once, a
 * status change is audited in the same transaction, and the export leaves out the internal note.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

interface Row {
  id: string;
  category: string;
  message: string;
  userId: string;
  createdAt: Date;
  context: unknown;
  status: string;
  outcome:
    | string
    | null;
  adminNote:
    | string
    | null;
  reply:
    | string
    | null;
  repliedAt: Date | null;
  replyNotifiedAt: Date | null;
  handledById:
    | string
    | null;
  updatedAt: Date | null;
  assistiveTech:
    | string
    | null;
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
          tx: unknown;
          adminId: string;
          action: string;
          opts: Record<
            string,
            unknown
          >;
        }[],
      failAudit: false,
      notifications:
        [] as Record<
          string,
          unknown
        >[],
      txObject:
        {} as Record<
          string,
          unknown
        >,
      sqlSeen:
        [] as unknown[],
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
          tx: unknown,
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
              tx,
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
  '@/lib/notifications.server',
  () => ({
    createNotification:
      vi.fn(
        async (
          input: Record<
            string,
            unknown
          >,
        ) => {
          h.notifications.push(
            input,
          );
        },
      ),
  }),
);

vi.mock(
  '@/lib/prisma.server',
  () => {
    const user =
      {
        name: 'Ada',
        handle: 'ada',
        image:
          null,
        id: 'u1',
      };
    let n = 0;
    const feedback =
      {
        create:
          vi.fn(
            async (a: {
              data: Partial<Row>;
            }) => {
              const row: Row =
                {
                  id: `fb${++n}`,
                  category:
                    'bug',
                  message:
                    '',
                  userId:
                    '',
                  createdAt:
                    new Date(
                      2026,
                      0,
                      1,
                      0,
                      0,
                      n,
                    ),
                  context:
                    null,
                  status:
                    'new',
                  outcome:
                    null,
                  adminNote:
                    null,
                  reply:
                    null,
                  repliedAt:
                    null,
                  replyNotifiedAt:
                    null,
                  handledById:
                    null,
                  updatedAt:
                    null,
                  assistiveTech:
                    null,
                  ...a.data,
                };
              h.rows.push(
                row,
              );
              return {
                ...row,
                user,
              };
            },
          ),
        findMany:
          vi.fn(
            async (a: {
              where?: {
                userId?: string;
                status?: string;
              };
              select?: Record<
                string,
                unknown
              >;
            }) => {
              let out =
                h.rows.filter(
                  (
                    r,
                  ) =>
                    (!a
                      .where
                      ?.userId ||
                      r.userId ===
                        a
                          .where
                          .userId) &&
                    (!a
                      .where
                      ?.status ||
                      r.status ===
                        a
                          .where
                          .status),
                );
              out =
                [
                  ...out,
                ].sort(
                  (
                    x,
                    y,
                  ) =>
                    y.createdAt.getTime() -
                    x.createdAt.getTime(),
                );
              return out.map(
                (
                  r,
                ) => {
                  // Honour `select`: a column that is not selected is not returned, like the real client.
                  const sel =
                    a.select;
                  const base =
                    sel
                      ? Object.fromEntries(
                          Object.keys(
                            sel,
                          )
                            .filter(
                              (
                                k,
                              ) =>
                                k !==
                                'user',
                            )
                            .map(
                              (
                                k,
                              ) => [
                                k,
                                (
                                  r as never
                                )[
                                  k
                                ],
                              ],
                            ),
                        )
                      : r;
                  return {
                    ...base,
                    user: {
                      ...user,
                      id: r.userId,
                    },
                  };
                },
              );
            },
          ),
        findUnique:
          vi.fn(
            async (a: {
              where: {
                id: string;
              };
              select?: Record<
                string,
                unknown
              >;
            }) => {
              const r =
                h.rows.find(
                  (
                    x,
                  ) =>
                    x.id ===
                    a
                      .where
                      .id,
                );
              return r
                ? {
                    ...r,
                    user,
                  }
                : null;
            },
          ),
        update:
          vi.fn(
            async (a: {
              where: {
                id: string;
              };
              data: Partial<Row>;
            }) => {
              const r =
                h.rows.find(
                  (
                    x,
                  ) =>
                    x.id ===
                    a
                      .where
                      .id,
                )!;
              Object.assign(
                r,
                a.data,
              );
              return r;
            },
          ),
        updateMany:
          vi.fn(
            async (a: {
              where: {
                id: string;
                replyNotifiedAt?: null;
                reply?: unknown;
              };
              data: Partial<Row>;
            }) => {
              const r =
                h.rows.find(
                  (
                    x,
                  ) =>
                    x.id ===
                    a
                      .where
                      .id,
                );
              if (
                !r
              )
                return {
                  count: 0,
                };
              if (
                a
                  .where
                  .replyNotifiedAt ===
                  null &&
                r.replyNotifiedAt !==
                  null
              )
                return {
                  count: 0,
                };
              if (
                a
                  .where
                  .reply &&
                r.reply ===
                  null
              )
                return {
                  count: 0,
                };
              Object.assign(
                r,
                a.data,
              );
              return {
                count: 1,
              };
            },
          ),
        count:
          vi.fn(
            async () =>
              0,
          ),
        deleteMany:
          vi.fn(),
      };
    const tx =
      {
        feedback,
      };
    h.txObject =
      tx;
    const prisma =
      {
        feedback,
        $queryRaw:
          vi.fn(
            async (
              sql: unknown,
            ) => {
              h.sqlSeen.push(
                sql,
              );
              return [];
            },
          ),
        $transaction:
          vi.fn(
            async (
              fn: (
                t: unknown,
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
              const auditsBefore =
                h
                  .audits
                  .length;
              try {
                return await fn(
                  tx,
                );
              } catch (e) {
                h.rows.splice(
                  0,
                  h
                    .rows
                    .length,
                  ...snapshot,
                );
                h.audits.length =
                  auditsBefore;
                throw e;
              }
            },
          ),
      };
    return {
      prisma,
    };
  },
);

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
    | 'list'
    | 'one'
    | 'mine'
    | 'post',
  method:
    | 'GET'
    | 'PATCH'
    | 'POST',
  params: Record<
    string,
    string
  > = {},
  opts: {
    query?: string;
    body?: unknown;
  } = {},
) {
  const route =
    (
      await {
        list: () =>
          import('@/lib/feedback/api/admin.feedback.server'),
        one: () =>
          import('@/lib/feedback/api/admin.feedback.$id.server'),
        mine: () =>
          import('@/lib/feedback/api/feedback.mine.server'),
        post: () =>
          import('@/lib/api/routes/feedback.server'),
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
            `https://rmhstudios.com${route.path}${opts.query ?? ''}`,
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

const as =
  (
    id: string,
    isAdmin = false,
  ) => {
    h.session =
      {
        user: {
          id,
          isAdmin,
        },
      };
  };

function seed(
  over: Partial<Row> = {},
): Row {
  const row: Row =
    {
      id: `seed${h.rows.length + 1}`,
      category:
        'bug',
      message:
        'The play button does nothing on my phone',
      userId:
        'member-1',
      createdAt:
        new Date(
          2026,
          0,
          1,
          0,
          0,
          h
            .rows
            .length,
        ),
      context:
        null,
      status:
        'new',
      outcome:
        null,
      adminNote:
        null,
      reply:
        null,
      repliedAt:
        null,
      replyNotifiedAt:
        null,
      handledById:
        null,
      updatedAt:
        null,
      assistiveTech:
        null,
      ...over,
    };
  h.rows.push(
    row,
  );
  return row;
}

beforeEach(
  () => {
    h.session =
      null;
    h.rows =
      [];
    h.audits.length = 0;
    h.failAudit = false;
    h.notifications.length = 0;
    h.sqlSeen.length = 0;
  },
);

describe('s06-05 feedback inbox: access', () => {
  it('refuses a signed-out caller and a non-admin on every admin endpoint', async () => {
    const row =
      seed();
    for (const as_ of [
      () =>
        (h.session =
          null),
      () =>
        as(
          'member-1',
        ),
    ]) {
      as_();
      const expected =
        h.session
          ? 403
          : 401;
      expect(
        (
          await call(
            'list',
            'GET',
          )
        )
          .status,
      ).toBe(
        expected,
      );
      expect(
        (
          await call(
            'one',
            'GET',
            {
              id: row.id,
            },
          )
        )
          .status,
      ).toBe(
        expected,
      );
      expect(
        (
          await call(
            'one',
            'PATCH',
            {
              id: row.id,
            },
            {
              body: {
                adminNote:
                  'x',
              },
            },
          )
        )
          .status,
      ).toBe(
        expected,
      );
    }
    expect(
      h
        .rows[0]!
        .adminNote,
    ).toBeNull();
  });

  it('"mine" returns only the caller’s rows and never the internal note', async () => {
    seed(
      {
        userId:
          'member-1',
        adminNote:
          'secret triage note',
        reply:
          'Fixed in the next release',
      },
    );
    seed(
      {
        userId:
          'member-2',
        message:
          'Another member’s private report',
      },
    );
    as(
      'member-1',
    );
    const res =
      await call(
        'mine',
        'GET',
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    const rows =
      res
        .json!
        .rows as Array<
        Record<
          string,
          unknown
        >
      >;
    expect(
      rows,
    ).toHaveLength(
      1,
    );
    expect(
      rows[0]!
        .reply,
    ).toBe(
      'Fixed in the next release',
    );
    expect(
      JSON.stringify(
        res.json,
      ),
    ).not.toContain(
      'secret triage note',
    );
    expect(
      JSON.stringify(
        res.json,
      ),
    ).not.toContain(
      'Another member',
    );
    expect(
      rows[0],
    ).not.toHaveProperty(
      'adminNote',
    );
  });
});

describe('s06-05 feedback inbox: submit and context', () => {
  const base =
    {
      category:
        'bug',
      message:
        'The play button does nothing on my phone',
    };

  it('stores only the ticked items, strips the query string and stamps the build', async () => {
    as(
      'member-1',
    );
    const res =
      await call(
        'post',
        'POST',
        {},
        {
          body: {
            ...base,
            context:
              {
                path: '/games/chess?room=abc#x',
                locale:
                  'en',
                build:
                  'current',
              },
          },
        },
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      h
        .rows[0]!
        .context,
    ).toEqual(
      {
        path: '/games/chess',
        locale:
          'en',
        build:
          expect.not.stringMatching(
            /^current$/,
          ),
      },
    );
    expect(
      h
        .rows[0]!
        .context,
    ).not.toHaveProperty(
      'viewport',
    );
    expect(
      h
        .rows[0]!
        .context,
    ).not.toHaveProperty(
      'errors',
    );
  });

  it('stores no context at all when nothing was ticked', async () => {
    as(
      'member-1',
    );
    expect(
      (
        await call(
          'post',
          'POST',
          {},
          {
            body: {
              ...base,
              context:
                {},
            },
          },
        )
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      h
        .rows[0]!
        .context ??
        null,
    ).toBeNull();
  });

  it('refuses a path that does not start with /, and values over their caps', async () => {
    as(
      'member-1',
    );
    const bad =
      [
        {
          path: 'games/chess',
        },
        {
          path: `/${'a'.repeat(200)}`,
        },
        {
          locale:
            'x'.repeat(
              17,
            ),
        },
        {
          edition:
            'x'.repeat(
              41,
            ),
        },
        {
          viewport:
            'wide',
        },
        {
          errors:
            [
              'a',
              'b',
              'c',
              'd',
            ],
        },
        {
          errors:
            [
              'e'.repeat(
                201,
              ),
            ],
        },
      ];
    for (const context of bad) {
      expect(
        (
          await call(
            'post',
            'POST',
            {},
            {
              body: {
                ...base,
                context,
              },
            },
          )
        )
          .status,
        JSON.stringify(
          context,
        ),
      ).toBe(
        400,
      );
    }
    expect(
      h.rows,
    ).toHaveLength(
      0,
    );
  });

  it('keeps the assistive technology and "where" only on accessibility reports', async () => {
    as(
      'member-1',
    );
    await call(
      'post',
      'POST',
      {},
      {
        body: {
          category:
            'accessibility',
          message:
            'The menu traps my focus',
          assistiveTech:
            'screen_reader',
          context:
            {
              path: '/help',
              where:
                '/help',
            },
        },
      },
    );
    await call(
      'post',
      'POST',
      {},
      {
        body: {
          ...base,
          assistiveTech:
            'screen_reader',
          context:
            {
              path: '/help',
              where:
                '/help',
            },
        },
      },
    );
    expect(
      h
        .rows[0],
    ).toMatchObject(
      {
        assistiveTech:
          'screen_reader',
        context:
          {
            path: '/help',
            where:
              '/help',
          },
      },
    );
    expect(
      h
        .rows[1]!
        .assistiveTech,
    ).toBeNull();
    expect(
      h
        .rows[1]!
        .context,
    ).toEqual(
      {
        path: '/help',
      },
    );
  });
});

describe('s06-05 feedback inbox: replies and audit', () => {
  it('notifies the member once per reply version', async () => {
    const row =
      seed();
    as(
      'admin-1',
      true,
    );
    const send =
      (
        reply: string,
      ) =>
        call(
          'one',
          'PATCH',
          {
            id: row.id,
          },
          {
            body: {
              reply,
            },
          },
        );

    expect(
      (
        (
          await send(
            'We fixed it',
          )
        )
          .json as {
          notified: boolean;
        }
      )
        .notified,
    ).toBe(
      true,
    );
    expect(
      h.notifications,
    ).toHaveLength(
      1,
    );
    expect(
      h
        .notifications[0],
    ).toMatchObject(
      {
        userId:
          'member-1',
        type: 'SYSTEM',
        entityType:
          'feedback_reply',
        link: '/settings/feedback',
      },
    );

    // Saving the same reply again does not tell them again; a changed reply does.
    expect(
      (
        (
          await send(
            'We fixed it',
          )
        )
          .json as {
          notified: boolean;
        }
      )
        .notified,
    ).toBe(
      false,
    );
    expect(
      h.notifications,
    ).toHaveLength(
      1,
    );
    expect(
      (
        (
          await send(
            'We fixed it, thanks',
          )
        )
          .json as {
          notified: boolean;
        }
      )
        .notified,
    ).toBe(
      true,
    );
    expect(
      h.notifications,
    ).toHaveLength(
      2,
    );
  });

  it('claims the notification with a compare-and-set, so two racing saves send one', async () => {
    const row =
      seed(
        {
          reply:
            'Fixed',
          replyNotifiedAt:
            null,
        },
      );
    const {
      notifyReply,
    } =
      await import('@/lib/feedback/inbox.server');
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          notifyReply(
            row.id,
          ),
          notifyReply(
            row.id,
          ),
        ],
      );
    expect(
      [
        a,
        b,
      ].filter(
        Boolean,
      ),
    ).toHaveLength(
      1,
    );
    expect(
      h.notifications,
    ).toHaveLength(
      1,
    );
  });

  it('audits a status change in the same transaction, and rolls the change back if the audit fails', async () => {
    const row =
      seed();
    as(
      'admin-1',
      true,
    );
    const ok =
      await call(
        'one',
        'PATCH',
        {
          id: row.id,
        },
        {
          body: {
            status:
              'closed',
            outcome:
              'fixed',
          },
        },
      );
    expect(
      ok.status,
    ).toBe(
      200,
    );
    expect(
      h
        .rows[0],
    ).toMatchObject(
      {
        status:
          'closed',
        outcome:
          'fixed',
        handledById:
          'admin-1',
      },
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
          'feedback.status',
        opts: {
          targetType:
            'feedback',
          targetId:
            row.id,
        },
      },
    );
    expect(
      h
        .audits[0]!
        .tx,
    ).toBe(
      h.txObject,
    );

    h.failAudit = true;
    const failed =
      await call(
        'one',
        'PATCH',
        {
          id: row.id,
        },
        {
          body: {
            status:
              'in_progress',
          },
        },
      );
    expect(
      failed.status,
    ).toBe(
      500,
    );
    expect(
      h
        .rows[0]!
        .status,
    ).toBe(
      'closed',
    );
  });

  it('audits note and reply changes without writing the note text to the log', async () => {
    const row =
      seed();
    as(
      'admin-1',
      true,
    );
    await call(
      'one',
      'PATCH',
      {
        id: row.id,
      },
      {
        body: {
          adminNote:
            'repro on iOS 17 only',
          reply:
            'Thanks, looking',
        },
      },
    );
    expect(
      h.audits
        .map(
          (
            a,
          ) =>
            a.action,
        )
        .sort(),
    ).toEqual(
      [
        'feedback.note',
        'feedback.reply',
      ],
    );
    expect(
      JSON.stringify(
        h.audits,
      ),
    ).not.toContain(
      'repro on iOS',
    );
  });

  it('refuses a closed status without an outcome, an outcome on an open one, and an empty edit', async () => {
    const row =
      seed();
    as(
      'admin-1',
      true,
    );
    for (const body of [
      {
        status:
          'closed',
      },
      {
        status:
          'new',
        outcome:
          'fixed',
      },
      {
        outcome:
          'fixed',
      },
      {},
      {
        status:
          'gone',
      },
    ]) {
      expect(
        (
          await call(
            'one',
            'PATCH',
            {
              id: row.id,
            },
            {
              body,
            },
          )
        )
          .status,
        JSON.stringify(
          body,
        ),
      ).toBe(
        400,
      );
    }
    expect(
      h.audits,
    ).toHaveLength(
      0,
    );
  });

  it('returns 404 for a row that does not exist', async () => {
    as(
      'admin-1',
      true,
    );
    expect(
      (
        await call(
          'one',
          'GET',
          {
            id: 'nope',
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
          'one',
          'PATCH',
          {
            id: 'nope',
          },
          {
            body: {
              adminNote:
                'x',
            },
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
  });

  it('shows the admin the note and the context', async () => {
    const row =
      seed(
        {
          adminNote:
            'internal',
          context:
            {
              path: '/help',
              viewport:
                '390x844',
            },
        },
      );
    as(
      'admin-1',
      true,
    );
    const res =
      await call(
        'one',
        'GET',
        {
          id: row.id,
        },
      );
    expect(
      (
        res.json as {
          feedback: {
            adminNote: string;
            context: unknown;
          };
        }
      )
        .feedback,
    ).toMatchObject(
      {
        adminNote:
          'internal',
        context:
          {
            path: '/help',
            viewport:
              '390x844',
          },
      },
    );
  });
});

describe('s06-05 feedback inbox: export and search SQL', () => {
  it('exports what the member sent and was told, never the internal note', async () => {
    seed(
      {
        userId:
          'member-1',
        adminNote:
          'secret triage note',
        reply:
          'Fixed',
        context:
          {
            path: '/help',
          },
      },
    );
    seed(
      {
        userId:
          'member-2',
      },
    );
    const {
      exportFeedback,
    } =
      await import('@/lib/feedback/inbox.server');
    const out =
      await exportFeedback(
        'member-1',
      );
    expect(
      out,
    ).toHaveLength(
      1,
    );
    expect(
      out[0],
    ).toMatchObject(
      {
        category:
          'bug',
        reply:
          'Fixed',
        context:
          {
            path: '/help',
          },
        status:
          'new',
      },
    );
    expect(
      JSON.stringify(
        out,
      ),
    ).not.toContain(
      'secret triage note',
    );
    expect(
      out[0],
    ).not.toHaveProperty(
      'adminNote',
    );
  });

  it('searches the real table by its mapped name and quoted camelCase columns, over a bounded window', async () => {
    const {
      searchSql,
    } =
      await import('@/lib/feedback/inbox.server');
    const q =
      searchSql(
        {
          q: '50%_off',
          status:
            'new',
          category:
            'bug',
          after: `${Date.UTC(2026, 0, 1)}_fb9`,
        },
        26,
      );
    expect(
      q.sql,
    ).toContain(
      'FROM "feedback"',
    );
    expect(
      q.sql,
    ).toContain(
      '"createdAt"',
    );
    expect(
      q.sql,
    ).toContain(
      '"message" ILIKE',
    );
    expect(
      q.sql,
    ).toContain(
      '"status" =',
    );
    expect(
      q.sql,
    ).toContain(
      '"category" =',
    );
    expect(
      q.sql,
    ).toMatch(
      /LIMIT \?\n\s+\) AS "recent"/,
    );
    // Wildcards in the member's text are escaped, and the window is the newest 5,000 rows.
    expect(
      q.values,
    ).toContain(
      '%50\\%\\_off%',
    );
    expect(
      q.values,
    ).toContain(
      5000,
    );
  });
});

describe('s06-05 feedback inbox: error messages are scrubbed', () => {
  it('removes emails, URL query strings and token-like runs', async () => {
    const { scrubErrorMessage, feedbackContextSchema } = await import('@/lib/feedback-schema');
    // Built from parts so secret scanners do not mistake the fixture for a real key.
    const fakeKey = ['sk', 'live', 'ABCDEFGHIJKLMNOPQRSTUVWX'].join('_');
    expect(
      scrubErrorMessage(`Failed for ada@example.com at https://x.test/a?token=abc123#f and key ${fakeKey}`),
    ).toBe('Failed for [email] at https://x.test/a and key [token]');
    expect(feedbackContextSchema.parse({ errors: ['bad ada@example.com'] }).errors).toEqual(['bad [email]']);
  });
});
