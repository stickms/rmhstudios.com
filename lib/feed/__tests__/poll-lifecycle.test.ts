/**
 * Poll lifecycle (s04-08): only the author ends or extends, a poll past 30 days is refused, a vote after the end is
 * 409 `POLL_CLOSED` (also when the end lands between the vote's first check and its write), and the notice job
 * tells the author and the voters once. Prisma is mocked; nothing here touches a database.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const DAY = 86_400_000;
const NOW =
  new Date(
    '2026-11-10T12:00:00Z',
  );

type PollRow =
  {
    id: string;
    rmheetId: string;
    closesAt: Date | null;
    closedAt: Date | null;
    extendedAt: Date | null;
    createdAt: Date;
    endNotifiedAt: Date | null;
  };
type PostRow =
  {
    id: string;
    userId: string;
    deletedAt: Date | null;
    pollId:
      | string
      | null;
  };

const h =
  vi.hoisted(
    () => ({
      polls:
        new Map<
          string,
          unknown
        >(),
      posts:
        new Map<
          string,
          unknown
        >(),
      lockKey:
        vi.fn(
          async () =>
            undefined,
        ),
      createNotification:
        vi.fn(
          async (
            _input: unknown,
          ) =>
            undefined,
        ),
      getSession:
        vi.fn(),
    }),
  );

const prisma =
  vi.hoisted(
    () => ({
      rMHarkPollOption:
        {
          findUnique:
            vi.fn(),
          findMany:
            vi.fn(),
          updateMany:
            vi.fn(),
          update:
            vi.fn(),
        },
      rMHarkPollVote:
        {
          findUnique:
            vi.fn(),
          findMany:
            vi.fn(),
          create:
            vi.fn(),
          delete:
            vi.fn(),
          deleteMany:
            vi.fn(),
        },
      rMHarkPoll:
        {
          findUnique:
            vi.fn(),
        },
      $transaction:
        vi.fn(),
    }),
  );
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma,
  }),
);
vi.mock(
  '@/lib/db/advisory-lock.server',
  () => ({
    lockKey:
      h.lockKey,
  }),
);
vi.mock(
  '@/lib/notifications.server',
  () => ({
    createNotification:
      h.createNotification,
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
  '@/lib/rate-limit.server',
  async (
    orig,
  ) => ({
    ...(await orig<
      typeof import('@/lib/rate-limit.server')
    >()),
    checkRateLimit:
      vi.fn(
        async () => ({
          allowed: true,
        }),
      ),
  }),
);
vi.mock(
  '@/lib/feed/audience.server',
  () => ({
    canReadPostThread:
      vi.fn(
        async () =>
          true,
      ),
  }),
);
vi.mock(
  '@/lib/xp/engine.server',
  () => ({
    awardXp:
      vi.fn(),
  }),
);
vi.mock(
  '@/lib/quests/engine.server',
  () => ({
    progressQuests:
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

const poll =
  (
    id: string,
  ) =>
    h.polls.get(
      id,
    ) as PollRow;
const post =
  (
    id: string,
  ) =>
    h.posts.get(
      id,
    ) as PostRow;

// A transaction client over the two maps: just the calls the lifecycle module makes.
const tx =
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
            }) => {
              const p =
                h.posts.get(
                  where.id,
                ) as
                  | PostRow
                  | undefined;
              return p
                ? {
                    userId:
                      p.userId,
                    deletedAt:
                      p.deletedAt,
                    poll: p.pollId
                      ? {
                          id: p.pollId,
                        }
                      : null,
                  }
                : null;
            },
          ),
      },
    rMHarkPoll:
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
              (h.polls.get(
                where.id,
              ) as
                | PollRow
                | undefined) ??
              null,
          ),
        update:
          vi.fn(
            async ({
              where,
              data,
            }: {
              where: {
                id: string;
              };
              data: Partial<PollRow>;
            }) => {
              const row =
                {
                  ...poll(
                    where.id,
                  ),
                  ...data,
                };
              h.polls.set(
                where.id,
                row,
              );
              return row;
            },
          ),
      },
  };
// The interactive-transaction form only: the functions under test never pass an array.
const db =
  {
    $transaction:
      vi.fn(
        async (
          fn: (
            t: unknown,
          ) => unknown,
        ) =>
          fn(
            tx,
          ),
      ),
  } as unknown as NonNullable<Parameters<typeof endPoll>[1]>;

import {
  endPoll,
  extendPoll,
  PollLifecycleError,
} from '@/lib/feed/poll-lifecycle.server';

function seed(
  over: Partial<PollRow> = {},
  author = 'author',
  deletedAt: Date | null = null,
) {
  h.polls.set(
    'poll1',
    {
      id: 'poll1',
      rmheetId:
        'post1',
      closesAt:
        new Date(
          NOW.getTime() +
            DAY,
        ),
      closedAt:
        null,
      extendedAt:
        null,
      createdAt:
        new Date(
          NOW.getTime() -
            DAY,
        ),
      endNotifiedAt:
        null,
      ...over,
    } satisfies PollRow,
  );
  h.posts.set(
    'post1',
    {
      id: 'post1',
      userId:
        author,
      deletedAt,
      pollId:
        'poll1',
    } satisfies PostRow,
  );
}

async function failure(
  p: Promise<unknown>,
): Promise<PollLifecycleError> {
  try {
    await p;
  } catch (e) {
    if (
      e instanceof
      PollLifecycleError
    )
      return e;
    throw e;
  }
  throw new Error(
    'expected a refusal',
  );
}

beforeEach(
  () => {
    vi.clearAllMocks();
    h.polls.clear();
    h.posts.clear();
    seed();
  },
);

describe('ending a poll', () => {
  it('lets the author end it now, under the poll lock', async () => {
    const view =
      await endPoll(
        {
          postId:
            'post1',
          userId:
            'author',
        },
        db,
        NOW,
      );
    expect(
      view,
    ).toMatchObject(
      {
        ended: true,
        closesAt:
          NOW.toISOString(),
        extendDays:
          [],
      },
    );
    expect(
      poll(
        'poll1',
      )
        .closedAt,
    ).toEqual(
      NOW,
    );
    expect(
      h.lockKey,
    ).toHaveBeenCalledWith(
      tx,
      'poll:poll1',
    );
  });

  it('ends a poll that never had an end', async () => {
    seed(
      {
        closesAt:
          null,
      },
    );
    expect(
      (
        await endPoll(
          {
            postId:
              'post1',
            userId:
              'author',
          },
          db,
          NOW,
        )
      )
        .ended,
    ).toBe(
      true,
    );
  });

  it('refuses anyone but the author', async () => {
    const err =
      await failure(
        endPoll(
          {
            postId:
              'post1',
            userId:
              'someone-else',
          },
          db,
          NOW,
        ),
      );
    expect(
      err,
    ).toMatchObject(
      {
        code: 'FORBIDDEN',
        status: 403,
      },
    );
    expect(
      poll(
        'poll1',
      )
        .closedAt,
    ).toBeNull();
  });

  it('refuses a deleted post, a post with no poll and a poll that has already ended', async () => {
    seed(
      {},
      'author',
      new Date(
        NOW.getTime() -
          1000,
      ),
    );
    expect(
      await failure(
        endPoll(
          {
            postId:
              'post1',
            userId:
              'author',
          },
          db,
          NOW,
        ),
      ),
    ).toMatchObject(
      {
        status: 404,
      },
    );
    h.posts.set(
      'plain',
      {
        id: 'plain',
        userId:
          'author',
        deletedAt:
          null,
        pollId:
          null,
      },
    );
    expect(
      await failure(
        endPoll(
          {
            postId:
              'plain',
            userId:
              'author',
          },
          db,
          NOW,
        ),
      ),
    ).toMatchObject(
      {
        status: 404,
      },
    );
    seed(
      {
        closesAt:
          new Date(
            NOW.getTime() -
              1000,
          ),
      },
    );
    expect(
      await failure(
        endPoll(
          {
            postId:
              'post1',
            userId:
              'author',
          },
          db,
          NOW,
        ),
      ),
    ).toMatchObject(
      {
        code: 'POLL_CLOSED',
        status: 409,
      },
    );
  });
});

describe('extending a poll', () => {
  it('moves the end by the chosen days and marks the poll extended', async () => {
    const view =
      await extendPoll(
        {
          postId:
            'post1',
          userId:
            'author',
          days: 3,
        },
        db,
        NOW,
      );
    expect(
      poll(
        'poll1',
      )
        .closesAt,
    ).toEqual(
      new Date(
        NOW.getTime() +
          4 *
            DAY,
      ),
    );
    expect(
      poll(
        'poll1',
      )
        .extendedAt,
    ).toEqual(
      NOW,
    );
    expect(
      view,
    ).toMatchObject(
      {
        ended: false,
        extended: true,
      },
    );
  });

  it('refuses anyone but the author', async () => {
    const err =
      await failure(
        extendPoll(
          {
            postId:
              'post1',
            userId:
              'someone-else',
            days: 1,
          },
          db,
          NOW,
        ),
      );
    expect(
      err.status,
    ).toBe(
      403,
    );
    expect(
      poll(
        'poll1',
      )
        .extendedAt,
    ).toBeNull();
  });

  it('refuses an extension past 30 days from the post', async () => {
    // Created a day ago and closing on day 24: 7 more days would be day 31.
    seed(
      {
        closesAt:
          new Date(
            NOW.getTime() +
              23 *
                DAY,
          ),
      },
    );
    expect(
      await failure(
        extendPoll(
          {
            postId:
              'post1',
            userId:
              'author',
            days: 7,
          },
          db,
          NOW,
        ),
      ),
    ).toMatchObject(
      {
        code: 'TOO_LONG',
        status: 409,
      },
    );
    expect(
      (
        await extendPoll(
          {
            postId:
              'post1',
            userId:
              'author',
            days: 3,
          },
          db,
          NOW,
        )
      )
        .ended,
    ).toBe(
      false,
    );
  });

  it('refuses an ended poll (never reopened) and a poll with no end', async () => {
    seed(
      {
        closedAt:
          new Date(
            NOW.getTime() -
              1000,
          ),
      },
    );
    expect(
      await failure(
        extendPoll(
          {
            postId:
              'post1',
            userId:
              'author',
            days: 1,
          },
          db,
          NOW,
        ),
      ),
    ).toMatchObject(
      {
        code: 'POLL_CLOSED',
      },
    );
    seed(
      {
        closesAt:
          null,
      },
    );
    expect(
      await failure(
        extendPoll(
          {
            postId:
              'post1',
            userId:
              'author',
            days: 1,
          },
          db,
          NOW,
        ),
      ),
    ).toMatchObject(
      {
        code: 'NOT_TIMED',
      },
    );
  });

  it('accepts only 1, 3 or 7 days at the route', async () => {
    const {
      route,
    } =
      await import('@/lib/feed/api/rmharks.$id.poll.extend.server');
    h.getSession.mockResolvedValue(
      {
        user: {
          id: 'author',
        },
      },
    );
    const call =
      (
        body: unknown,
      ) =>
        handlersOf(
          route,
        )
          .POST!(
          {
            params:
              {
                id: 'post1',
              },
            request:
              new Request(
                'https://x.test/api/rmharks/post1/poll/extend',
                {
                  method:
                    'POST',
                  headers:
                    {
                      cookie:
                        'better-auth.session_token=abc',
                      'content-type':
                        'application/json',
                      'cf-connecting-ip':
                        '1.2.3.4',
                    },
                  body: JSON.stringify(
                    body,
                  ),
                },
              ),
          },
        );
    expect(
      (
        await call(
          {
            days: 2,
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
          {
            days: '3',
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
          {},
        )
      )
        .status,
    ).toBe(
      400,
    );
  });
});

describe('voting after the end', () => {
  const optionRow =
    (
      pollOver: Partial<PollRow> = {},
    ) => ({
      id: 'opt1',
      poll: {
        id: 'poll1',
        rmheetId:
          'post1',
        multiSelect: false,
        closesAt:
          poll(
            'poll1',
          )
            .closesAt,
        closedAt:
          null,
        ...pollOver,
      },
    });
  const vote =
    async () => {
      const {
        route,
      } =
        await import('@/lib/feed/api/rmharks.$id.vote.server');
      return handlersOf(
        route,
      )
        .POST!(
        {
          params:
            {
              id: 'post1',
            },
          request:
            new Request(
              'https://x.test/api/rmharks/post1/vote',
              {
                method:
                  'POST',
                headers:
                  {
                    cookie:
                      'better-auth.session_token=abc',
                    'content-type':
                      'application/json',
                    'cf-connecting-ip':
                      '1.2.3.4',
                  },
                body: JSON.stringify(
                  {
                    optionId:
                      'opt1',
                  },
                ),
              },
            ),
        },
      );
    };

  beforeEach(
    () => {
      h.getSession.mockResolvedValue(
        {
          user: {
            id: 'voter',
          },
        },
      );
      prisma.rMHarkPollVote.findUnique.mockResolvedValue(
        null,
      );
      prisma.rMHarkPollOption.findMany.mockResolvedValue(
        [
          {
            id: 'opt1',
            voteCount: 0,
          },
        ],
      );
      prisma.rMHarkPollVote.findMany.mockResolvedValue(
        [],
      );
      prisma.$transaction.mockImplementation(
        async (
          fn: (
            t: unknown,
          ) => unknown,
        ) =>
          fn(
            {
              rMHarkPoll:
                prisma.rMHarkPoll,
              rMHarkPollOption:
                prisma.rMHarkPollOption,
              rMHarkPollVote:
                prisma.rMHarkPollVote,
            },
          ),
      );
    },
  );

  it('is 409 POLL_CLOSED when the author ended the poll', async () => {
    prisma.rMHarkPollOption.findUnique.mockResolvedValue(
      optionRow(
        {
          closedAt:
            new Date(
              Date.now() -
                1000,
            ),
        },
      ),
    );
    const res =
      await vote();
    expect(
      res.status,
    ).toBe(
      409,
    );
    expect(
      await res.json(),
    ).toMatchObject(
      {
        code: 'POLL_CLOSED',
      },
    );
    expect(
      prisma
        .rMHarkPollVote
        .create,
    ).not.toHaveBeenCalled();
  });

  it('is 409 POLL_CLOSED when the time ran out', async () => {
    prisma.rMHarkPollOption.findUnique.mockResolvedValue(
      optionRow(
        {
          closesAt:
            new Date(
              Date.now() -
                1000,
            ),
        },
      ),
    );
    expect(
      (
        await vote()
      )
        .status,
    ).toBe(
      409,
    );
  });

  it('is 409 and writes nothing when the end lands after the first check, under the lock', async () => {
    prisma.rMHarkPollOption.findUnique.mockResolvedValue(
      optionRow(
        {
          closesAt:
            new Date(
              Date.now() +
                DAY,
            ),
        },
      ),
    );
    prisma.rMHarkPoll.findUnique.mockResolvedValue(
      {
        closesAt:
          new Date(
            Date.now() +
              DAY,
          ),
        closedAt:
          new Date(
            Date.now() -
              1,
          ),
      },
    );
    const res =
      await vote();
    expect(
      res.status,
    ).toBe(
      409,
    );
    expect(
      h.lockKey,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'poll:poll1',
    );
    expect(
      prisma
        .rMHarkPollVote
        .create,
    ).not.toHaveBeenCalled();
    expect(
      prisma
        .rMHarkPollOption
        .update,
    ).not.toHaveBeenCalled();
  });

  it('still counts a vote on an open poll', async () => {
    prisma.rMHarkPollOption.findUnique.mockResolvedValue(
      optionRow(
        {
          closesAt:
            new Date(
              Date.now() +
                DAY,
            ),
        },
      ),
    );
    prisma.rMHarkPoll.findUnique.mockResolvedValue(
      {
        closesAt:
          new Date(
            Date.now() +
              DAY,
          ),
        closedAt:
          null,
      },
    );
    prisma.rMHarkPollOption.findMany.mockResolvedValue(
      [
        {
          id: 'opt1',
          voteCount: 1,
        },
      ],
    );
    const res =
      await vote();
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      prisma
        .rMHarkPollVote
        .create,
    ).toHaveBeenCalledWith(
      {
        data: {
          optionId:
            'opt1',
          userId:
            'voter',
        },
      },
    );
  });
});

describe('the poll-ended notice job', () => {
  type Vote =
    {
      userId: string;
    };
  const state =
    {
      polls:
        new Map<
          string,
          {
            id: string;
            createdAt: Date;
            closesAt: Date | null;
            closedAt: Date | null;
            endNotifiedAt: Date | null;
          }
        >(),
      votes:
        [] as Vote[],
      blocks:
        [] as {
          blockerId: string;
          blockedId: string;
        }[],
      mutes:
        [] as {
          muterId: string;
          mutedId: string;
        }[],
      options:
        [
          {
            id: 'a',
            text: 'Cats',
            voteCount: 54,
          },
          {
            id: 'b',
            text: 'Dogs',
            voteCount: 46,
          },
        ],
      deletedAt:
        null as Date | null,
    };
  const due =
    (
      p: {
        closesAt: Date | null;
        closedAt: Date | null;
        endNotifiedAt: Date | null;
      },
      now: Date,
    ) =>
      p.endNotifiedAt ===
        null &&
      ((p.closedAt &&
        p.closedAt <=
          now) ||
        (p.closedAt ===
          null &&
          p.closesAt &&
          p.closesAt <=
            now));
  const noticeDb =
    {
      rMHarkPoll:
        {
          findMany:
            vi.fn(
              async (a: {
                where: {
                  OR: [
                    {
                      closedAt: {
                        lte: Date;
                      };
                    },
                  ];
                };
              }) => {
                const now =
                  a
                    .where
                    .OR[0]
                    .closedAt
                    .lte;
                return [
                  ...state.polls.values(),
                ]
                  .filter(
                    (
                      p,
                    ) =>
                      due(
                        p,
                        now,
                      ),
                  )
                  .map(
                    (
                      p,
                    ) => ({
                      id: p.id,
                    }),
                  );
              },
            ),
          updateMany:
            vi.fn(
              async (a: {
                where: {
                  id: string;
                  OR: [
                    {
                      closedAt: {
                        lte: Date;
                      };
                    },
                  ];
                };
                data: {
                  endNotifiedAt: Date;
                };
              }) => {
                const p =
                  state.polls.get(
                    a
                      .where
                      .id,
                  );
                if (
                  !p ||
                  !due(
                    p,
                    a
                      .where
                      .OR[0]
                      .closedAt
                      .lte,
                  )
                )
                  return {
                    count: 0,
                  };
                p.endNotifiedAt =
                  a.data.endNotifiedAt;
                return {
                  count: 1,
                };
              },
            ),
          findUnique:
            vi.fn(
              async () => ({
                options:
                  state.options,
                rmhark:
                  {
                    id: 'post1',
                    userId:
                      'author',
                    deletedAt:
                      state.deletedAt,
                    user: {
                      handle:
                        'ann',
                    },
                  },
              }),
            ),
        },
      rMHarkPollVote:
        {
          findMany:
            vi.fn(
              async (a: {
                where: {
                  userId: {
                    gt: string;
                    not: string;
                  };
                };
                take: number;
              }) =>
                [
                  ...new Set(
                    state.votes.map(
                      (
                        v,
                      ) =>
                        v.userId,
                    ),
                  ),
                ]
                  .filter(
                    (
                      u,
                    ) =>
                      u >
                        a
                          .where
                          .userId
                          .gt &&
                      u !==
                        a
                          .where
                          .userId
                          .not,
                  )
                  .sort()
                  .slice(
                    0,
                    a.take,
                  )
                  .map(
                    (
                      userId,
                    ) => ({
                      userId,
                    }),
                  ),
            ),
        },
      userBlock:
        {
          findMany:
            vi.fn(
              async (a: {
                where: {
                  OR: unknown[];
                };
              }) => {
                void a;
                return state.blocks;
              },
            ),
        },
      userMute:
        {
          findMany:
            vi.fn(
              async () =>
                state.mutes,
            ),
        },
    };

  beforeEach(
    () => {
      state.polls.clear();
      state.polls.set(
        'poll1',
        {
          id: 'poll1',
          createdAt:
            new Date(
              0,
            ),
          closesAt:
            new Date(
              NOW.getTime() -
                1000,
            ),
          closedAt:
            null,
          endNotifiedAt:
            null,
        },
      );
      state.votes =
        [
          {
            userId:
              'v1',
          },
          {
            userId:
              'v2',
          },
          {
            userId:
              'v3',
          },
        ];
      state.blocks =
        [];
      state.mutes =
        [];
      state.options =
        [
          {
            id: 'a',
            text: 'Cats',
            voteCount: 54,
          },
          {
            id: 'b',
            text: 'Dogs',
            voteCount: 46,
          },
        ];
      state.deletedAt =
        null;
    },
  );

  const run =
    async () => {
      const {
        runPollEndNotices,
      } =
        await import('@/lib/feed/poll-lifecycle.server');
      return runPollEndNotices(
        NOW,
        noticeDb as never,
      );
    };
  const recipients =
    () =>
      h.createNotification.mock.calls
        .map(
          (
            c,
          ) =>
            (
              c[0] as unknown as {
                userId: string;
              }
            )
              .userId,
        )
        .sort();

  it('tells the author the result and each voter that it ended, linked to the post and grouped per poll', async () => {
    expect(
      await run(),
    ).toBe(
      1,
    );
    expect(
      recipients(),
    ).toEqual(
      [
        'author',
        'v1',
        'v2',
        'v3',
      ],
    );
    const calls =
      h.createNotification.mock.calls.map(
        (
          c,
        ) =>
          c[0] as unknown as Record<
            string,
            unknown
          >,
      );
    const author =
      calls.find(
        (
          c,
        ) =>
          c.userId ===
          'author',
      )!;
    expect(
      author,
    ).toMatchObject(
      {
        type: 'SYSTEM',
        entityType:
          'poll_result',
        preview:
          'Your poll ended: Cats won with 54%',
        link: '/u/ann/post/post1',
        groupKey:
          'poll-ended:poll1',
      },
    );
    expect(
      calls.find(
        (
          c,
        ) =>
          c.userId ===
          'v1',
      ),
    ).toMatchObject(
      {
        preview:
          'A poll you voted in ended',
        groupKey:
          'poll-ended:poll1',
      },
    );
  });

  it('notifies once: a second run, or a second worker, finds nothing', async () => {
    await run();
    const first =
      h
        .createNotification
        .mock
        .calls
        .length;
    expect(
      await run(),
    ).toBe(
      0,
    );
    expect(
      h
        .createNotification
        .mock
        .calls
        .length,
    ).toBe(
      first,
    );
  });

  it('claims a poll before acting, so two runs at once notify once', async () => {
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          run(),
          run(),
        ],
      );
    expect(
      a +
        b,
    ).toBe(
      1,
    );
    expect(
      recipients().filter(
        (
          u,
        ) =>
          u ===
          'author',
      ),
    ).toHaveLength(
      1,
    );
  });

  it('notifies for a poll the author ended early, and not for one still open', async () => {
    const p =
      state.polls.get(
        'poll1',
      )!;
    p.closesAt =
      new Date(
        NOW.getTime() +
          DAY,
      );
    expect(
      await run(),
    ).toBe(
      0,
    );
    p.closedAt =
      new Date(
        NOW.getTime() -
          5,
      );
    expect(
      await run(),
    ).toBe(
      1,
    );
  });

  it('does not tell voters who are blocked in either direction with the author, or who muted them', async () => {
    state.blocks =
      [
        {
          blockerId:
            'author',
          blockedId:
            'v1',
        },
        {
          blockerId:
            'v2',
          blockedId:
            'author',
        },
      ];
    state.votes.push(
      {
        userId:
          'v4',
      },
    );
    state.mutes =
      [
        {
          muterId:
            'v4',
          mutedId:
            'author',
        },
      ];
    await run();
    expect(
      recipients(),
    ).toEqual(
      [
        'author',
        'v3',
      ],
    );
  });

  it('tells only the author when the poll has more than 2,000 votes', async () => {
    state.options =
      [
        {
          id: 'a',
          text: 'Cats',
          voteCount: 1500,
        },
        {
          id: 'b',
          text: 'Dogs',
          voteCount: 501,
        },
      ];
    await run();
    expect(
      recipients(),
    ).toEqual(
      [
        'author',
      ],
    );
    expect(
      noticeDb
        .rMHarkPollVote
        .findMany,
    ).not.toHaveBeenCalled();
  });

  it('claims but never notifies for a deleted post', async () => {
    state.deletedAt =
      new Date(
        NOW.getTime() -
          1000,
      );
    expect(
      await run(),
    ).toBe(
      1,
    );
    expect(
      h.createNotification,
    ).not.toHaveBeenCalled();
    expect(
      await run(),
    ).toBe(
      0,
    );
  });

  it('names every tied option to the author', async () => {
    state.options =
      [
        {
          id: 'a',
          text: 'Cats',
          voteCount: 5,
        },
        {
          id: 'b',
          text: 'Dogs',
          voteCount: 5,
        },
      ];
    await run();
    const author =
      h.createNotification.mock.calls
        .map(
          (
            c,
          ) =>
            c[0] as unknown as Record<
              string,
              unknown
            >,
        )
        .find(
          (
            c,
          ) =>
            c.userId ===
            'author',
        )!;
    expect(
      author.preview,
    ).toBe(
      'Your poll ended in a tie: Cats and Dogs with 50% each',
    );
  });
});
