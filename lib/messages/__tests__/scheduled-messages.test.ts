import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Scheduled messages (s03-12): ownership, the 20-pending cap, delivery that
 * re-runs every check, and a cron that cannot send twice. Prisma is a small
 * in-memory fake; the send functions are mocked so the tests see exactly what
 * the cron hands them.
 */

interface Row {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  gifUrl:
    | string
    | null;
  imageUrls: string[];
  imageAlts?: string[];
  sendAt: Date;
  status: string;
  failCode:
    | string
    | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const state =
  vi.hoisted(
    () => ({
      rows: [] as Row[],
      blocks:
        [] as {
          blockerId: string;
          blockedId: string;
        }[],
      seq: 0,
      dms: new Map<
        string,
        {
          participantOneId: string;
          participantTwoId: string;
        }
      >(),
      groups:
        new Map<
          string,
          Set<string>
        >(),
      restricted: false,
      sendDirect:
        vi.fn(),
      sendGroup:
        vi.fn(),
      notifyUser:
        vi.fn(),
      publishGroup:
        vi.fn(),
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
  return Object.entries(
    where,
  ).every(
    ([
      key,
      cond,
    ]) => {
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
        cond &&
        typeof cond ===
          'object' &&
        !(
          cond instanceof
          Date
        )
      ) {
        const c =
          cond as Record<
            string,
            unknown
          >;
        if (
          'in' in
          c
        )
          return (
            c.in as unknown[]
          ).includes(
            value,
          );
        if (
          'lt' in
          c
        )
          return (
            (value as
              | Date
              | number) <
            (c.lt as
              | Date
              | number)
          );
        if (
          'lte' in
          c
        )
          return (
            (value as
              | Date
              | number) <=
            (c.lte as
              | Date
              | number)
          );
        if (
          'gte' in
          c
        )
          return (
            (value as number) >=
            (c.gte as number)
          );
      }
      return (
        value ===
        cond
      );
    },
  );
}

// s04-16: the message-request gate has its own tests; these files are about scheduling and alt text.
vi.mock(
  '@/lib/messages/requests.server',
  () => ({
    requestGate:
      async () => ({
        outcome:
          'allowed',
      }),
  }),
);

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        $transaction: async (cb: (tx: unknown) => unknown) =>
          cb((await import('@/lib/prisma.server')).prisma),
        $executeRaw: async () => 1,
        userBlock:
          {
            findFirst:
              async ({
                where,
              }: {
                where: {
                  OR: {
                    blockerId: string;
                    blockedId: string;
                  }[];
                };
              }) =>
                state.blocks.find(
                  (
                    b,
                  ) =>
                    where.OR.some(
                      (
                        c,
                      ) =>
                        c.blockerId ===
                          b.blockerId &&
                        c.blockedId ===
                          b.blockedId,
                    ),
                )
                  ? {
                      id: 'b1',
                    }
                  : null,
          },
        scheduledChatMessage:
          {
            count:
              async ({
                where,
              }: {
                where: Where;
              }) =>
                state.rows.filter(
                  (
                    r,
                  ) =>
                    matches(
                      r,
                      where,
                    ),
                )
                  .length,
            create:
              async ({
                data,
              }: {
                data: Partial<Row>;
              }) => {
                const now =
                  new Date();
                const row =
                  {
                    id: `s${++state.seq}`,
                    gifUrl:
                      null,
                    imageUrls:
                      [],
                    status:
                      'pending',
                    failCode:
                      null,
                    attempts: 0,
                    createdAt:
                      now,
                    updatedAt:
                      now,
                    ...data,
                  } as Row;
                state.rows.push(
                  row,
                );
                return row;
              },
            findFirst:
              async ({
                where,
              }: {
                where: Where;
              }) =>
                state.rows.find(
                  (
                    r,
                  ) =>
                    matches(
                      r,
                      where,
                    ),
                ) ??
                null,
            findUnique:
              async ({
                where,
              }: {
                where: {
                  id: string;
                };
              }) =>
                state.rows.find(
                  (
                    r,
                  ) =>
                    r.id ===
                    where.id,
                ) ??
                null,
            findMany:
              async ({
                where,
                orderBy,
                take,
              }: {
                where: Where;
                orderBy?: unknown;
                take?: number;
              }) => {
                const found =
                  state.rows.filter(
                    (
                      r,
                    ) =>
                      matches(
                        r,
                        where,
                      ),
                  );
                if (
                  orderBy
                )
                  found.sort(
                    (
                      a,
                      b,
                    ) =>
                      a.sendAt.getTime() -
                      b.sendAt.getTime(),
                  );
                return found.slice(
                  0,
                  take ??
                    1000,
                );
              },
            updateMany:
              async ({
                where,
                data,
              }: {
                where: Where;
                data: Record<
                  string,
                  unknown
                >;
              }) => {
                const hit =
                  state.rows.filter(
                    (
                      r,
                    ) =>
                      matches(
                        r,
                        where,
                      ),
                  );
                for (const r of hit) {
                  for (const [
                    k,
                    v,
                  ] of Object.entries(
                    data,
                  )) {
                    if (
                      v &&
                      typeof v ===
                        'object' &&
                      'increment' in
                        (v as object)
                    ) {
                      (
                        r as unknown as Record<
                          string,
                          number
                        >
                      )[
                        k
                      ] +=
                        (
                          v as {
                            increment: number;
                          }
                        ).increment;
                    } else
                      (
                        r as unknown as Record<
                          string,
                          unknown
                        >
                      )[
                        k
                      ] =
                        v;
                  }
                  r.updatedAt =
                    new Date();
                }
                return {
                  count:
                    hit.length,
                };
              },
            deleteMany:
              async ({
                where,
              }: {
                where: Where;
              }) => {
                const hit =
                  state.rows.filter(
                    (
                      r,
                    ) =>
                      matches(
                        r,
                        where,
                      ),
                  );
                state.rows =
                  state.rows.filter(
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
          },
      },
  }),
);
vi.mock(
  '@/lib/chat/chat.server',
  () => ({
    findDm:
      async (
        id: string,
      ) => {
        const dm =
          state.dms.get(
            id,
          );
        return dm
          ? {
              id,
              ...dm,
            }
          : null;
      },
    findGroupMembership:
      async (
        id: string,
        userId: string,
      ) =>
        state.groups
          .get(
            id,
          )
          ?.has(
            userId,
          )
          ? {
              id: 'm1',
            }
          : null,
  }),
);
vi.mock(
  '@/lib/moderation/restrictions.server',
  () => ({
    restrictionResponse:
      async () =>
        state.restricted
          ? Response.json(
              {},
              {
                status: 403,
              },
            )
          : null,
  }),
);
vi.mock(
  '@/lib/storage/keys',
  () => ({
    ownsFeedImageUrl:
      (
        url: string,
        userId: string,
      ) =>
        url.includes(
          `${userId}-`,
        ),
  }),
);
vi.mock(
  '@/lib/messages/send.server',
  () => {
    // Mirrors the real module: `isBlockedPair` is the shared check, and
    // `sendDirectMessage` (through `guardDirect`) refuses a blocked pair before
    // it writes anything, so the cron's delivery relies on it, not its own copy.
    const isBlockedPair = async (a: string, b: string) =>
      state.blocks.some(
        (x) =>
          (x.blockerId === a && x.blockedId === b) ||
          (x.blockerId === b && x.blockedId === a),
      );
    return {
    isBlockedPair,
    sendDirectMessage: async (o: {
      userId: string;
      conversationId: string;
    }) => {
      const dm = state.dms.get(o.conversationId);
      const other = dm
        ? dm.participantOneId === o.userId
          ? dm.participantTwoId
          : dm.participantOneId
        : null;
      if (other && (await isBlockedPair(o.userId, other)))
        return { ok: false, code: 'blocked' };
      return state.sendDirect(o);
    },
    sendGroupMessage:
      state.sendGroup,
    };
  },
);
vi.mock(
  '@/lib/message-events',
  () => ({
    notifyUser:
      state.notifyUser,
  }),
);
vi.mock(
  '@/lib/group-events',
  () => ({
    publishGroupMessage:
      state.publishGroup,
  }),
);

const {
  scheduleMessage,
  editScheduledMessage,
  cancelScheduledMessage,
  listScheduledMessages,
  sendScheduledNow,
  runDueScheduledMessages,
  exportScheduledMessages,
} =
  await import('@/lib/messages/scheduled.server');

const NOW =
  Date.UTC(
    2026,
    10,
    23,
    8,
    0,
    0,
  );
const inMinutes =
  (
    m: number,
  ) =>
    new Date(
      NOW +
        m *
          60_000,
    ).toISOString();

function seed(
  over: Partial<Row> = {},
): Row {
  const row: Row =
    {
      id: `s${++state.seq}`,
      chatId:
        'dm1',
      senderId:
        'me',
      content:
        'hello',
      gifUrl:
        null,
      imageUrls:
        [],
      sendAt:
        new Date(
          NOW -
            60_000,
        ),
      status:
        'pending',
      failCode:
        null,
      attempts: 0,
      createdAt:
        new Date(
          NOW -
            3_600_000,
        ),
      updatedAt:
        new Date(
          NOW -
            3_600_000,
        ),
      ...over,
    };
  state.rows.push(
    row,
  );
  return row;
}

beforeEach(
  () => {
    state.rows =
      [];
    state.blocks =
      [];
    state.seq = 0;
    state.restricted = false;
    state.dms =
      new Map(
        [
          [
            'dm1',
            {
              participantOneId:
                'me',
              participantTwoId:
                'ana',
            },
          ],
        ],
      );
    state.groups =
      new Map(
        [
          [
            'g1',
            new Set(
              [
                'me',
                'ana',
              ],
            ),
          ],
        ],
      );
    state.sendDirect
      .mockReset()
      .mockResolvedValue(
        {
          ok: true,
          value:
            {
              message:
                {
                  id: 'msg',
                },
            },
        },
      );
    state.sendGroup
      .mockReset()
      .mockResolvedValue(
        {
          ok: true,
          value:
            {
              message:
                {
                  id: 'msg',
                },
            },
        },
      );
    state.notifyUser.mockReset();
    state.publishGroup.mockReset();
  },
);

describe('scheduling', () => {
  it('refuses a chat the caller is not in, and stores nothing', async () => {
    const dm =
      await scheduleMessage(
        'mallory',
        {
          chatId:
            'dm1',
          content:
            'hi',
          sendAt:
            inMinutes(
              60,
            ),
        },
        NOW,
      );
    const group =
      await scheduleMessage(
        'mallory',
        {
          chatId:
            'g1',
          content:
            'hi',
          sendAt:
            inMinutes(
              60,
            ),
        },
        NOW,
      );
    const missing =
      await scheduleMessage(
        'me',
        {
          chatId:
            'nope',
          content:
            'hi',
          sendAt:
            inMinutes(
              60,
            ),
        },
        NOW,
      );
    for (const r of [
      dm,
      group,
      missing,
    ])
      expect(
        r,
      ).toMatchObject(
        {
          ok: false,
          status: 404,
        },
      );
    expect(
      state.rows,
    ).toHaveLength(
      0,
    );
  });

  it('stores a DM and a group message for the sender and publishes nothing', async () => {
    const dm =
      await scheduleMessage(
        'me',
        {
          chatId:
            'dm1',
          content:
            'hi',
          sendAt:
            inMinutes(
              60,
            ),
        },
        NOW,
      );
    const group =
      await scheduleMessage(
        'me',
        {
          chatId:
            'g1',
          content:
            'yo',
          sendAt:
            inMinutes(
              90,
            ),
        },
        NOW,
      );
    expect(
      dm.ok &&
        group.ok,
    ).toBe(
      true,
    );
    expect(
      state.rows.map(
        (
          r,
        ) => [
          r.chatId,
          r.senderId,
          r.status,
        ],
      ),
    ).toEqual(
      [
        [
          'dm1',
          'me',
          'pending',
        ],
        [
          'g1',
          'me',
          'pending',
        ],
      ],
    );
    expect(
      state.notifyUser,
    ).not.toHaveBeenCalled();
    expect(
      state.publishGroup,
    ).not.toHaveBeenCalled();
    expect(
      state.sendDirect,
    ).not.toHaveBeenCalled();
  });

  it('enforces the window: at least a minute, at most 30 days', async () => {
    const soon =
      await scheduleMessage(
        'me',
        {
          chatId:
            'dm1',
          content:
            'hi',
          sendAt:
            inMinutes(
              0.5,
            ),
        },
        NOW,
      );
    const far =
      await scheduleMessage(
        'me',
        {
          chatId:
            'dm1',
          content:
            'hi',
          sendAt:
            inMinutes(
              31 *
                24 *
                60,
            ),
        },
        NOW,
      );
    const edge =
      await scheduleMessage(
        'me',
        {
          chatId:
            'dm1',
          content:
            'hi',
          sendAt:
            inMinutes(
              1,
            ),
        },
        NOW,
      );
    expect(
      soon,
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    expect(
      far,
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    expect(
      edge.ok,
    ).toBe(
      true,
    );
  });

  it('refuses the 21st pending message but not after a failed row', async () => {
    for (
      let i = 0;
      i <
      20;
      i++
    )
      seed(
        {
          sendAt:
            new Date(
              NOW +
                3_600_000,
            ),
        },
      );
    const refused =
      await scheduleMessage(
        'me',
        {
          chatId:
            'dm1',
          content:
            'one more',
          sendAt:
            inMinutes(
              120,
            ),
        },
        NOW,
      );
    expect(
      refused,
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
    expect(
      state.rows,
    ).toHaveLength(
      20,
    );

    // Another member's rows do not count against this one.
    const other =
      await scheduleMessage(
        'ana',
        {
          chatId:
            'dm1',
          content:
            'mine',
          sendAt:
            inMinutes(
              120,
            ),
        },
        NOW,
      );
    expect(
      other.ok,
    ).toBe(
      true,
    );

    state.rows =
      [];
    for (
      let i = 0;
      i <
      20;
      i++
    )
      seed(
        {
          status:
            'failed',
          failCode:
            'blocked',
        },
      );
    const afterFailed =
      await scheduleMessage(
        'me',
        {
          chatId:
            'dm1',
          content:
            'ok',
          sendAt:
            inMinutes(
              120,
            ),
        },
        NOW,
      );
    expect(
      afterFailed.ok,
    ).toBe(
      true,
    );
  });

  it('refuses a blocked pair, a restricted sender and an image that is not theirs', async () => {
    state.blocks.push(
      {
        blockerId:
          'ana',
        blockedId:
          'me',
      },
    );
    expect(
      await scheduleMessage(
        'me',
        {
          chatId:
            'dm1',
          content:
            'hi',
          sendAt:
            inMinutes(
              60,
            ),
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 403,
      },
    );
    state.blocks =
      [];
    state.restricted = true;
    expect(
      await scheduleMessage(
        'me',
        {
          chatId:
            'dm1',
          content:
            'hi',
          sendAt:
            inMinutes(
              60,
            ),
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 403,
      },
    );
    state.restricted = false;
    expect(
      await scheduleMessage(
        'me',
        {
          chatId:
            'dm1',
          content:
            '',
          imageUrls:
            [
              '/uploads/feed/ana-1.png',
            ],
          sendAt:
            inMinutes(
              60,
            ),
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    expect(
      state.rows,
    ).toHaveLength(
      0,
    );
  });
});

describe('ownership', () => {
  it('lists only the caller’s rows and edits, cancels and sends only those', async () => {
    const mine =
      seed(
        {
          senderId:
            'me',
          sendAt:
            new Date(
              NOW +
                3_600_000,
            ),
        },
      );
    const theirs =
      seed(
        {
          senderId:
            'ana',
          sendAt:
            new Date(
              NOW +
                3_600_000,
            ),
        },
      );

    expect(
      (
        await listScheduledMessages(
          'me',
        )
      ).map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        mine.id,
      ],
    );
    expect(
      await listScheduledMessages(
        'mallory',
      ),
    ).toEqual(
      [],
    );

    expect(
      await editScheduledMessage(
        'me',
        theirs.id,
        {
          content:
            'hijack',
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      await cancelScheduledMessage(
        'me',
        theirs.id,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      await sendScheduledNow(
        'me',
        theirs.id,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      theirs,
    ).toMatchObject(
      {
        content:
          'hello',
        status:
          'pending',
      },
    );
    expect(
      state.sendDirect,
    ).not.toHaveBeenCalled();
  });

  it('edits the text and the time of a pending row, but not a failed or sending one', async () => {
    const row =
      seed(
        {
          sendAt:
            new Date(
              NOW +
                3_600_000,
            ),
        },
      );
    const edited =
      await editScheduledMessage(
        'me',
        row.id,
        {
          content:
            'new',
          sendAt:
            inMinutes(
              300,
            ),
        },
        NOW,
      );
    expect(
      edited,
    ).toMatchObject(
      {
        ok: true,
        row: {
          content:
            'new',
          sendAt:
            inMinutes(
              300,
            ),
        },
      },
    );

    expect(
      await editScheduledMessage(
        'me',
        row.id,
        {
          sendAt:
            inMinutes(
              0,
            ),
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    expect(
      await editScheduledMessage(
        'me',
        row.id,
        {
          content:
            '   ',
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );

    const failed =
      seed(
        {
          status:
            'failed',
          failCode:
            'blocked',
        },
      );
    const sending =
      seed(
        {
          status:
            'sending',
        },
      );
    expect(
      await editScheduledMessage(
        'me',
        failed.id,
        {
          content:
            'x',
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
    expect(
      await editScheduledMessage(
        'me',
        sending.id,
        {
          content:
            'x',
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
  });

  it('cancels a pending row and dismisses a failed one, not one being sent', async () => {
    const pending =
      seed(
        {
          sendAt:
            new Date(
              NOW +
                3_600_000,
            ),
        },
      );
    const failed =
      seed(
        {
          status:
            'failed',
          failCode:
            'not-member',
        },
      );
    const sending =
      seed(
        {
          status:
            'sending',
        },
      );
    expect(
      await cancelScheduledMessage(
        'me',
        pending.id,
      ),
    ).toEqual(
      {
        ok: true,
      },
    );
    expect(
      await cancelScheduledMessage(
        'me',
        failed.id,
      ),
    ).toEqual(
      {
        ok: true,
      },
    );
    expect(
      await cancelScheduledMessage(
        'me',
        sending.id,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
    expect(
      state.rows.map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        sending.id,
      ],
    );
  });
});

describe('delivery', () => {
  it('sends a due DM through the send function and deletes the row', async () => {
    seed(
      {
        content:
          'good morning',
        gifUrl:
          'https://media.tenor.com/g.gif',
      },
    );
    const summary =
      await runDueScheduledMessages(
        new Date(
          NOW,
        ),
      );
    expect(
      summary,
    ).toEqual(
      {
        delivered: 1,
        failed: 0,
        skipped: 0,
      },
    );
    expect(
      state.sendDirect,
    ).toHaveBeenCalledWith(
      {
        userId:
          'me',
        conversationId:
          'dm1',
        input:
          {
            content:
              'good morning',
            gifUrl:
              'https://media.tenor.com/g.gif',
            imageUrls:
              [],
            imageAlts:
              [],
          },
        pairRateLimit: false,
      },
    );
    expect(
      state.rows,
    ).toHaveLength(
      0,
    );
  });

  it('carries the image descriptions of a scheduled message into the send', async () => {
    seed(
      {
        content:
          '',
        imageUrls:
          [
            '/api/feed/image/me-1-a.png',
            '/api/feed/image/me-2-b.png',
          ],
        imageAlts:
          [
            'a dog',
            '',
          ],
      },
    );
    await runDueScheduledMessages(
      new Date(
        NOW,
      ),
    );
    expect(
      state.sendDirect,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          input:
            expect.objectContaining(
              {
                imageAlts:
                  [
                    'a dog',
                    '',
                  ],
              },
            ),
        },
      ),
    );
  });

  it('sends a due group message through the group send function', async () => {
    seed(
      {
        chatId:
          'g1',
        content:
          'team',
      },
    );
    await runDueScheduledMessages(
      new Date(
        NOW,
      ),
    );
    expect(
      state.sendGroup,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          userId:
            'me',
          groupId:
            'g1',
          input:
            expect.objectContaining(
              {
                content:
                  'team',
              },
            ),
        },
      ),
    );
    expect(
      state.sendDirect,
    ).not.toHaveBeenCalled();
  });

  it('leaves a message that is not due yet alone', async () => {
    const later =
      seed(
        {
          sendAt:
            new Date(
              NOW +
                60_000,
            ),
        },
      );
    expect(
      await runDueScheduledMessages(
        new Date(
          NOW,
        ),
      ),
    ).toEqual(
      {
        delivered: 0,
        failed: 0,
        skipped: 0,
      },
    );
    expect(
      later.status,
    ).toBe(
      'pending',
    );
  });

  it('delivers in sendAt order', async () => {
    seed(
      {
        content:
          'third',
        sendAt:
          new Date(
            NOW -
              10_000,
          ),
      },
    );
    seed(
      {
        content:
          'first',
        sendAt:
          new Date(
            NOW -
              300_000,
          ),
      },
    );
    seed(
      {
        content:
          'second',
        sendAt:
          new Date(
            NOW -
              60_000,
          ),
      },
    );
    await runDueScheduledMessages(
      new Date(
        NOW,
      ),
    );
    expect(
      state.sendDirect.mock.calls.map(
        (
          c,
        ) =>
          c[0]
            .input
            .content,
      ),
    ).toEqual(
      [
        'first',
        'second',
        'third',
      ],
    );
  });

  it('fails with "blocked" when either side blocked the other since scheduling, and sends nothing', async () => {
    const a =
      seed(
        {
          content:
            'a',
        },
      );
    state.blocks.push(
      {
        blockerId:
          'ana',
        blockedId:
          'me',
      },
    );
    await runDueScheduledMessages(
      new Date(
        NOW,
      ),
    );
    expect(
      a,
    ).toMatchObject(
      {
        status:
          'failed',
        failCode:
          'blocked',
      },
    );
    expect(
      state.sendDirect,
    ).not.toHaveBeenCalled();

    state.blocks =
      [
        {
          blockerId:
            'me',
          blockedId:
            'ana',
        },
      ];
    const b =
      seed(
        {
          content:
            'b',
        },
      );
    await runDueScheduledMessages(
      new Date(
        NOW,
      ),
    );
    expect(
      b,
    ).toMatchObject(
      {
        status:
          'failed',
        failCode:
          'blocked',
      },
    );
  });

  it('fails with "not-member" once the sender left the group or the chat is gone', async () => {
    const group =
      seed(
        {
          chatId:
            'g1',
        },
      );
    const gone =
      seed(
        {
          chatId:
            'deleted',
        },
      );
    state.groups
      .get(
        'g1',
      )!
      .delete(
        'me',
      );
    await runDueScheduledMessages(
      new Date(
        NOW,
      ),
    );
    expect(
      group,
    ).toMatchObject(
      {
        status:
          'failed',
        failCode:
          'not-member',
      },
    );
    expect(
      gone,
    ).toMatchObject(
      {
        status:
          'failed',
        failCode:
          'not-member',
      },
    );
    expect(
      state.sendGroup,
    ).not.toHaveBeenCalled();
  });

  it('maps the send function’s refusals to a reason code and keeps the row', async () => {
    const cases: [
      string,
      string,
    ][] =
      [
        [
          'cannot-message',
          'cannot-message',
        ],
        [
          'restricted',
          'restricted',
        ],
        [
          'invalid-image',
          'invalid-image',
        ],
        [
          'not-found',
          'not-member',
        ],
      ];
    for (const [
      sendCode,
      expected,
    ] of cases) {
      state.rows =
        [];
      state.sendDirect.mockResolvedValueOnce(
        {
          ok: false,
          code: sendCode,
          response:
            Response.json(
              {},
            ),
        },
      );
      const row =
        seed();
      await runDueScheduledMessages(
        new Date(
          NOW,
        ),
      );
      expect(
        row,
      ).toMatchObject(
        {
          status:
            'failed',
          failCode:
            expected,
        },
      );
      expect(
        state.rows,
      ).toHaveLength(
        1,
      );
    }
  });

  it('never sends twice when the cron runs twice at once', async () => {
    seed();
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          runDueScheduledMessages(
            new Date(
              NOW,
            ),
          ),
          runDueScheduledMessages(
            new Date(
              NOW,
            ),
          ),
        ],
      );
    expect(
      state.sendDirect,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      a.delivered +
        b.delivered,
    ).toBe(
      1,
    );
    await runDueScheduledMessages(
      new Date(
        NOW,
      ),
    );
    expect(
      state.sendDirect,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('retries a row stuck in "sending" for ten minutes once, then fails it', async () => {
    const stuck =
      seed(
        {
          status:
            'sending',
          attempts: 1,
          updatedAt:
            new Date(
              NOW -
                11 *
                  60_000,
            ),
        },
      );
    const fresh =
      seed(
        {
          status:
            'sending',
          attempts: 1,
          updatedAt:
            new Date(
              NOW -
                2 *
                  60_000,
            ),
        },
      );
    const spent =
      seed(
        {
          status:
            'sending',
          attempts: 2,
          updatedAt:
            new Date(
              NOW -
                11 *
                  60_000,
            ),
        },
      );
    await runDueScheduledMessages(
      new Date(
        NOW,
      ),
    );
    expect(
      state.sendDirect,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      state.rows.find(
        (
          r,
        ) =>
          r.id ===
          stuck.id,
      ),
    ).toBeUndefined();
    expect(
      fresh.status,
    ).toBe(
      'sending',
    );
    expect(
      spent,
    ).toMatchObject(
      {
        status:
          'failed',
        failCode:
          'error',
      },
    );
  });

  it('leaves a row in "sending" when delivery throws, for the sweep', async () => {
    const row =
      seed();
    state.sendDirect.mockRejectedValueOnce(
      new Error(
        'db down',
      ),
    );
    const error =
      vi
        .spyOn(
          console,
          'error',
        )
        .mockImplementation(
          () =>
            undefined,
        );
    const summary =
      await runDueScheduledMessages(
        new Date(
          NOW,
        ),
      );
    error.mockRestore();
    expect(
      summary.failed,
    ).toBe(
      1,
    );
    expect(
      row,
    ).toMatchObject(
      {
        status:
          'sending',
        attempts: 1,
      },
    );
  });

  it('removes failed rows after thirty days', async () => {
    const old =
      seed(
        {
          status:
            'failed',
          failCode:
            'blocked',
          updatedAt:
            new Date(
              NOW -
                31 *
                  86_400_000,
            ),
        },
      );
    const recent =
      seed(
        {
          status:
            'failed',
          failCode:
            'blocked',
          updatedAt:
            new Date(
              NOW -
                86_400_000,
            ),
        },
      );
    await runDueScheduledMessages(
      new Date(
        NOW,
      ),
    );
    expect(
      state.rows.map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        recent.id,
      ],
    );
    expect(
      state.rows.includes(
        old,
      ),
    ).toBe(
      false,
    );
  });
});

describe('send now', () => {
  it('delivers a pending row immediately through the same send function', async () => {
    const row =
      seed(
        {
          sendAt:
            new Date(
              NOW +
                3_600_000,
            ),
        },
      );
    expect(
      await sendScheduledNow(
        'me',
        row.id,
      ),
    ).toEqual(
      {
        ok: true,
        message:
          {
            id: 'msg',
          },
      },
    );
    expect(
      state.sendDirect,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      state.rows,
    ).toHaveLength(
      0,
    );
  });

  it('re-checks at send time and answers with the reason', async () => {
    const row =
      seed(
        {
          sendAt:
            new Date(
              NOW +
                3_600_000,
            ),
        },
      );
    state.blocks.push(
      {
        blockerId:
          'ana',
        blockedId:
          'me',
      },
    );
    expect(
      await sendScheduledNow(
        'me',
        row.id,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
        code: 'blocked',
      },
    );
    expect(
      row,
    ).toMatchObject(
      {
        status:
          'failed',
        failCode:
          'blocked',
      },
    );
    // A failed row cannot be sent again.
    expect(
      await sendScheduledNow(
        'me',
        row.id,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
    expect(
      state.sendDirect,
    ).not.toHaveBeenCalled();
  });
});

describe('export', () => {
  it('returns only the member’s own rows', async () => {
    seed(
      {
        senderId:
          'me',
        content:
          'mine',
      },
    );
    seed(
      {
        senderId:
          'ana',
        content:
          'hers',
      },
    );
    const out =
      await exportScheduledMessages(
        'me',
      );
    expect(
      out.map(
        (
          r,
        ) =>
          r.content,
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
        chatId:
          'dm1',
        status:
          'pending',
        failCode:
          null,
      },
    );
  });
});
