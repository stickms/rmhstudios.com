/**
 * Ranked-choice polls (sprint 06 #19), the server rules: what a poll may be, what a ballot may be, that a ballot is
 * replaced under the lock, and that the instant-runoff result is computed once at the end and read the same by the
 * end job and by a reader who got there first. Prisma is an in-memory fake; nothing here touches a database.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { instantRunoff } from '@/lib/feed/poll-count';

const h =
  vi.hoisted(
    () => ({
      lockKey:
        vi.fn(
          async () =>
            undefined,
        ),
      createNotification:
        vi.fn(
          async () =>
            undefined,
        ),
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
  '@/lib/prisma.server',
  () => ({
    prisma:
      {},
  }),
);

import { createRMHarkSchema } from '@/lib/rmhark-schema';
import {
  RankedBallotError,
  computeAndStoreResult,
  resolveEndedResult,
  submitBallot,
} from '@/lib/feed/ranked-poll.server';
import {
  PollLifecycleError,
  runPollEndNotices,
} from '@/lib/feed/poll-lifecycle.server';
import {
  pollOptionCount,
  rankedPollFields,
} from '@/lib/feed/ranked-poll';

interface Vote {
  optionId: string;
  userId: string;
  rank:
    | number
    | null;
}

/** An in-memory poll store with just the Prisma surface the code under test uses. */
function fakeDb(
  init: {
    ranked?: boolean;
    closesAt?: Date | null;
    closedAt?: Date | null;
  } = {},
) {
  const poll =
    {
      id: 'p1',
      ranked:
        init.ranked ??
        true,
      resultJson:
        null as unknown,
      closesAt:
        init.closesAt ===
        undefined
          ? new Date(
              Date.now() +
                3_600_000,
            )
          : init.closesAt,
      closedAt:
        init.closedAt ??
        null,
      endNotifiedAt:
        null as Date | null,
      createdAt:
        new Date(
          0,
        ),
      extendedAt:
        null,
    };
  const options =
    [
      'a',
      'b',
      'c',
      'd',
    ].map(
      (
        id,
        i,
      ) => ({
        id,
        text: `Option ${id}`,
        position:
          i,
        voteCount: 0,
      }),
    );
  let votes: Vote[] =
    [];
  const storeWrites: unknown[] =
    [];

  const model =
    {
      rMHarkPoll:
        {
          findUnique:
            vi.fn(
              async () => ({
                ...poll,
                options:
                  options.map(
                    (
                      o,
                    ) => ({
                      ...o,
                    }),
                  ),
                rmhark:
                  {
                    id: 'post1',
                    userId:
                      'author',
                    deletedAt:
                      null,
                    user: {
                      handle:
                        'author',
                    },
                  },
              }),
            ),
          findMany:
            vi.fn(
              async () => [
                {
                  id: 'p1',
                },
              ],
            ),
          updateMany:
            vi.fn(
              async (args: {
                where: Record<
                  string,
                  unknown
                >;
                data: Record<
                  string,
                  unknown
                >;
              }) => {
                if (
                  'resultJson' in
                  args.where
                ) {
                  if (
                    poll.resultJson !==
                    null
                  )
                    return {
                      count: 0,
                    };
                  poll.resultJson =
                    args.data.resultJson;
                  storeWrites.push(
                    args
                      .data
                      .resultJson,
                  );
                  return {
                    count: 1,
                  };
                }
                if (
                  poll.endNotifiedAt
                )
                  return {
                    count: 0,
                  };
                poll.endNotifiedAt =
                  args
                    .data
                    .endNotifiedAt as Date;
                return {
                  count: 1,
                };
              },
            ),
        },
      rMHarkPollOption:
        {
          findMany:
            vi.fn(
              async () =>
                options.map(
                  (
                    o,
                  ) => ({
                    ...o,
                  }),
                ),
            ),
          updateMany:
            vi.fn(
              async (args: {
                where: {
                  id: string;
                };
                data: {
                  voteCount: {
                    decrement: number;
                  };
                };
              }) => {
                const o =
                  options.find(
                    (
                      x,
                    ) =>
                      x.id ===
                      args
                        .where
                        .id,
                  );
                if (
                  o &&
                  o.voteCount >
                    0
                )
                  o.voteCount -=
                    args.data.voteCount.decrement;
                return {
                  count: 1,
                };
              },
            ),
          update:
            vi.fn(
              async (args: {
                where: {
                  id: string;
                };
                data: {
                  voteCount: {
                    increment: number;
                  };
                };
              }) => {
                const o =
                  options.find(
                    (
                      x,
                    ) =>
                      x.id ===
                      args
                        .where
                        .id,
                  )!;
                o.voteCount +=
                  args.data.voteCount.increment;
                return o;
              },
            ),
        },
      rMHarkPollVote:
        {
          findMany:
            vi.fn(
              async (args: {
                where: {
                  userId?:
                    | string
                    | {
                        gt: string;
                        not: string;
                      };
                };
              }) => {
                const u =
                  args
                    .where
                    .userId;
                if (
                  typeof u ===
                  'string'
                )
                  return votes.filter(
                    (
                      v,
                    ) =>
                      v.userId ===
                      u,
                  );
                if (
                  u &&
                  typeof u ===
                    'object'
                ) {
                  return [
                    ...new Set(
                      votes.map(
                        (
                          v,
                        ) =>
                          v.userId,
                      ),
                    ),
                  ]
                    .filter(
                      (
                        id,
                      ) =>
                        id >
                          u.gt &&
                        id !==
                          u.not,
                    )
                    .map(
                      (
                        userId,
                      ) => ({
                        userId,
                      }),
                    );
                }
                return votes.map(
                  (
                    v,
                  ) => ({
                    ...v,
                  }),
                );
              },
            ),
          deleteMany:
            vi.fn(
              async (args: {
                where: {
                  userId: string;
                };
              }) => {
                votes =
                  votes.filter(
                    (
                      v,
                    ) =>
                      v.userId !==
                      args
                        .where
                        .userId,
                  );
                return {
                  count: 1,
                };
              },
            ),
          createMany:
            vi.fn(
              async (args: {
                data: Vote[];
              }) => {
                votes.push(
                  ...args.data,
                );
                return {
                  count:
                    args
                      .data
                      .length,
                };
              },
            ),
        },
      userBlock:
        {
          findMany:
            vi.fn(
              async () => [],
            ),
        },
      userMute:
        {
          findMany:
            vi.fn(
              async () => [],
            ),
        },
    };
  const db =
    {
      ...model,
      $transaction:
        async <
          T,
        >(
          fn: (
            tx: typeof model,
          ) => Promise<T>,
        ) =>
          fn(
            model,
          ),
    };
  return {
    db: db as never,
    poll,
    options,
    storeWrites,
    votes:
      () =>
        votes,
    seed: (
      rows: Vote[],
    ) => {
      votes.push(
        ...rows,
      );
      for (const r of rows)
        if (
          r.rank ===
          1
        )
          options.find(
            (
              o,
            ) =>
              o.id ===
              r.optionId,
          )!.voteCount +=
            1;
    },
  };
}

const ballot =
  (
    userId: string,
    ...ids: string[]
  ): Vote[] =>
    ids.map(
      (
        optionId,
        i,
      ) => ({
        optionId,
        userId,
        rank:
          i +
          1,
      }),
    );

beforeEach(
  () => {
    h.lockKey.mockClear();
    h.createNotification.mockClear();
  },
);

describe('creating a ranked poll', () => {
  const base =
    {
      content:
        'which?',
      poll: {
        question:
          'Which?',
        options:
          [
            'a',
            'b',
            'c',
          ],
        ranked: true,
        durationHours: 24,
      },
    };
  const parse =
    (
      poll: Record<
        string,
        unknown
      >,
    ) =>
      createRMHarkSchema.safeParse(
        {
          content:
            'which?',
          poll,
        },
      );

  it('accepts three to six options with an end', () => {
    expect(
      createRMHarkSchema.safeParse(
        base,
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      parse(
        {
          ...base.poll,
          options:
            [
              'a',
              'b',
              'c',
              'd',
              'e',
              'f',
            ],
        },
      )
        .success,
    ).toBe(
      true,
    );
  });
  it('refuses ranked together with multi-select', () => {
    expect(
      parse(
        {
          ...base.poll,
          multiSelect: true,
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
  it('refuses fewer than three options', () => {
    expect(
      parse(
        {
          ...base.poll,
          options:
            [
              'a',
              'b',
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
  it('refuses more than six options', () => {
    expect(
      parse(
        {
          ...base.poll,
          options:
            [
              'a',
              'b',
              'c',
              'd',
              'e',
              'f',
              'g',
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
  it('refuses a ranked poll without an end', () => {
    expect(
      parse(
        {
          question:
            'Which?',
          options:
            [
              'a',
              'b',
              'c',
            ],
          ranked: true,
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
  it('leaves plain polls as they were, including the four-option limit', () => {
    expect(
      parse(
        {
          question:
            'Which?',
          options:
            [
              'a',
              'b',
            ],
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      parse(
        {
          question:
            'Which?',
          options:
            [
              'a',
              'b',
              'c',
              'd',
            ],
          multiSelect: true,
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      parse(
        {
          question:
            'Which?',
          options:
            [
              'a',
              'b',
              'c',
              'd',
              'e',
            ],
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
});

describe('submitBallot', () => {
  it("refuses an option that is not the poll's", async () => {
    const f =
      fakeDb();
    await expect(
      submitBallot(
        {
          pollId:
            'p1',
          userId:
            'u1',
          ranking:
            [
              'a',
              'zzz',
            ],
        },
        f.db,
      ),
    ).rejects.toMatchObject(
      {
        code: 'BAD_BALLOT',
        issue:
          'FOREIGN',
      },
    );
    expect(
      f.votes(),
    ).toEqual(
      [],
    );
  });
  it('refuses a duplicate and a gap', async () => {
    const f =
      fakeDb();
    await expect(
      submitBallot(
        {
          pollId:
            'p1',
          userId:
            'u1',
          ranking:
            [
              'a',
              'a',
            ],
        },
        f.db,
      ),
    ).rejects.toMatchObject(
      {
        issue:
          'DUPLICATE',
      },
    );
    await expect(
      submitBallot(
        {
          pollId:
            'p1',
          userId:
            'u1',
          ranking:
            [
              'a',
              '',
              'b',
            ],
        },
        f.db,
      ),
    ).rejects.toMatchObject(
      {
        issue:
          'GAP',
      },
    );
    await expect(
      submitBallot(
        {
          pollId:
            'p1',
          userId:
            'u1',
          ranking:
            [],
        },
        f.db,
      ),
    ).rejects.toBeInstanceOf(
      RankedBallotError,
    );
  });
  it('refuses a ballot on a poll that is not ranked', async () => {
    const f =
      fakeDb(
        {
          ranked: false,
        },
      );
    await expect(
      submitBallot(
        {
          pollId:
            'p1',
          userId:
            'u1',
          ranking:
            [
              'a',
            ],
        },
        f.db,
      ),
    ).rejects.toMatchObject(
      {
        code: 'NOT_RANKED',
      },
    );
  });
  it('refuses a ballot after the end', async () => {
    const f =
      fakeDb(
        {
          closesAt:
            new Date(
              Date.now() -
                1000,
            ),
        },
      );
    await expect(
      submitBallot(
        {
          pollId:
            'p1',
          userId:
            'u1',
          ranking:
            [
              'a',
            ],
        },
        f.db,
      ),
    ).rejects.toBeInstanceOf(
      PollLifecycleError,
    );
    expect(
      f.votes(),
    ).toEqual(
      [],
    );
  });
  it('replaces the previous ballot under the ballot lock and moves the first-preference tallies', async () => {
    const f =
      fakeDb();
    const first =
      await submitBallot(
        {
          pollId:
            'p1',
          userId:
            'u1',
          ranking:
            [
              'a',
              'b',
              'c',
            ],
        },
        f.db,
      );
    expect(
      h
        .lockKey
        .mock
        .calls[0],
    ).toEqual(
      [
        expect.anything(),
        'poll-ballot:p1:u1',
      ],
    );
    expect(
      first.options.find(
        (
          o,
        ) =>
          o.id ===
          'a',
      )
        ?.voteCount,
    ).toBe(
      1,
    );

    const second =
      await submitBallot(
        {
          pollId:
            'p1',
          userId:
            'u1',
          ranking:
            [
              'c',
              'a',
            ],
        },
        f.db,
      );
    expect(
      f
        .votes()
        .map(
          (
            v,
          ) => [
            v.optionId,
            v.rank,
          ],
        ),
    ).toEqual(
      [
        [
          'c',
          1,
        ],
        [
          'a',
          2,
        ],
      ],
    );
    expect(
      second.myRanking,
    ).toEqual(
      [
        'c',
        'a',
      ],
    );
    expect(
      second.options.map(
        (
          o,
        ) =>
          o.voteCount,
      ),
    ).toEqual(
      [
        0,
        0,
        1,
        0,
      ],
    );
    expect(
      second.totalVotes,
    ).toBe(
      1,
    );
  });
});

describe('the result', () => {
  const seedFive =
    (
      f: ReturnType<
        typeof fakeDb
      >,
    ) =>
      f.seed(
        [
          ...ballot(
            'u1',
            'a',
            'b',
          ),
          ...ballot(
            'u2',
            'a',
            'c',
          ),
          ...ballot(
            'u3',
            'b',
            'c',
          ),
          ...ballot(
            'u4',
            'c',
            'b',
          ),
          ...ballot(
            'u5',
            'd',
            'b',
          ),
        ],
      );

  it('is computed from the ballots by instantRunoff and stored once', async () => {
    const f =
      fakeDb();
    seedFive(
      f,
    );
    const expected =
      instantRunoff(
        [
          [
            'a',
            'b',
          ],
          [
            'a',
            'c',
          ],
          [
            'b',
            'c',
          ],
          [
            'c',
            'b',
          ],
          [
            'd',
            'b',
          ],
        ],
        [
          'a',
          'b',
          'c',
          'd',
        ],
      );
    const result =
      await computeAndStoreResult(
        'p1',
        f.db,
      );
    expect(
      result?.winnerOptionId,
    ).toBe(
      expected.winner,
    );
    expect(
      result?.rounds.map(
        (
          r,
        ) =>
          r.eliminatedOptionId,
      ),
    ).toEqual(
      expected.rounds.map(
        (
          r,
        ) =>
          r.eliminated,
      ),
    );
    expect(
      result?.ballots,
    ).toBe(
      5,
    );

    await computeAndStoreResult(
      'p1',
      f.db,
    );
    expect(
      f.storeWrites,
    ).toHaveLength(
      1,
    );
  });

  it('is null for a poll that is not ranked', async () => {
    const f =
      fakeDb(
        {
          ranked: false,
        },
      );
    expect(
      await computeAndStoreResult(
        'p1',
        f.db,
      ),
    ).toBeNull();
  });

  it('read before the job ran shows the result the job later keeps', async () => {
    const f =
      fakeDb(
        {
          closesAt:
            new Date(
              Date.now() -
                1000,
            ),
        },
      );
    seedFive(
      f,
    );
    const read =
      await resolveEndedResult(
        f.poll,
        f.db,
      );
    expect(
      read,
    ).not.toBeNull();
    expect(
      f.storeWrites,
    ).toHaveLength(
      1,
    );

    await runPollEndNotices(
      new Date(),
      f.db,
    );
    expect(
      f.storeWrites,
    ).toHaveLength(
      1,
    );
    expect(
      f
        .poll
        .resultJson,
    ).toEqual(
      read,
    );
  });

  it('is not computed for an open poll', async () => {
    const f =
      fakeDb();
    seedFive(
      f,
    );
    expect(
      await resolveEndedResult(
        f.poll,
        f.db,
      ),
    ).toBeNull();
    expect(
      f.storeWrites,
    ).toHaveLength(
      0,
    );
  });

  it('is computed inside the end claim and the end notice names the winner', async () => {
    const f =
      fakeDb(
        {
          closesAt:
            new Date(
              Date.now() -
                1000,
            ),
        },
      );
    seedFive(
      f,
    );
    await runPollEndNotices(
      new Date(),
      f.db,
    );
    const stored =
      f
        .poll
        .resultJson as {
        winnerOptionId: string;
      };
    expect(
      stored.winnerOptionId,
    ).toBeTruthy();
    const winnerText =
      f.options.find(
        (
          o,
        ) =>
          o.id ===
          stored.winnerOptionId,
      )!.text;
    const authorNotice =
      (
        h.createNotification.mock
          .calls as unknown[][]
      ).find(
        (
          c,
        ) =>
          (
            c[0] as {
              userId: string;
            }
          )
            .userId ===
          'author',
      )?.[0] as unknown as {
        preview: string;
      };
    expect(
      authorNotice.preview,
    ).toContain(
      winnerText,
    );
    expect(
      authorNotice.preview,
    ).toContain(
      'ranked poll',
    );
  });
});

describe('what an open poll shows', () => {
  it('carries first preferences only: no result, whatever the row holds', () => {
    const row =
      {
        ranked: true,
        resultJson:
          {
            winnerOptionId:
              'a',
            rounds:
              [],
            exhausted: 0,
            ballots: 3,
            byElimination: false,
          },
        options:
          [
            {
              id: 'a',
              votes:
                [
                  {
                    optionId:
                      'a',
                    rank: 1,
                  },
                ],
            },
            {
              id: 'b',
              votes:
                [
                  {
                    optionId:
                      'b',
                    rank: 2,
                  },
                ],
            },
          ],
      };
    const open =
      rankedPollFields(
        row,
        {
          ended: false,
          countsHidden: false,
        },
      );
    expect(
      open.result,
    ).toBeUndefined();
    expect(
      open.myRanking,
    ).toEqual(
      [
        'a',
        'b',
      ],
    );
    expect(
      rankedPollFields(
        row,
        {
          ended: true,
          countsHidden: false,
        },
      )
        .result
        ?.winnerOptionId,
    ).toBe(
      'a',
    );
  });
  it('counts an option by its first preferences, and a plain option by its vote rows', () => {
    expect(
      pollOptionCount(
        {
          ranked: true,
        },
        {
          voteCount: 4,
          _count:
            {
              votes: 9,
            },
        },
      ),
    ).toBe(
      4,
    );
    expect(
      pollOptionCount(
        {
          ranked: false,
        },
        {
          voteCount: 4,
          _count:
            {
              votes: 9,
            },
        },
      ),
    ).toBe(
      9,
    );
  });
  it('adds nothing to a plain poll', () => {
    expect(
      rankedPollFields(
        {
          ranked: false,
          options:
            [],
        },
        {
          ended: true,
          countsHidden: false,
        },
      ),
    ).toEqual(
      {},
    );
  });
});
