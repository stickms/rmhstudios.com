import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * `sendDirectMessage` / `sendGroupMessage` were lifted out of the two send
 * endpoints. These pin the rules they carry (participation, image ownership,
 * DM privacy, the sender's own restriction) and the side effects of a send.
 */

const h =
  vi.hoisted(
    () => ({
      dm: null as null | {
        participantOneId: string;
        participantTwoId: string;
        disappearAfterSec:
          | number
          | null;
      },
      member:
        null as null | {
          id: string;
          chat: {
            disappearAfterSec:
              | number
              | null;
          };
        },
      privacy:
        'EVERYONE' as string,
      follows: true,
      blocks: [] as { blockerId: string; blockedId: string }[],
      restricted: false,
      banned: false,
      created:
        vi.fn(),
      notifyUser:
        vi.fn(),
      publishGroup:
        vi.fn(),
      adjust:
        vi.fn(),
    }),
  );

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        user: {
          findUnique:
            async () => ({
              profile:
                {
                  dmPrivacy:
                    h.privacy,
                },
            }),
        },
        userBlock: {
          findFirst: async (a: {
            where: { OR: { blockerId: string; blockedId: string }[] };
          }) =>
            h.blocks.some((b) =>
              a.where.OR.some(
                (c) => c.blockerId === b.blockerId && c.blockedId === b.blockedId,
              ),
            )
              ? { id: 'b1' }
              : null,
        },
        follow:
          {
            findUnique:
              async () =>
                h.follows
                  ? {
                      followerId:
                        'x',
                    }
                  : null,
          },
        chatMessage:
          {
            create:
              (
                a: unknown,
              ) =>
                a,
          },
        chat: {
          update:
            (
              a: unknown,
            ) =>
              a,
        },
        chatMember:
          {
            update:
              (
                a: unknown,
              ) =>
                a,
          },
        $transaction:
          async (
            ops: {
              data?: Record<
                string,
                unknown
              >;
            }[],
          ) => {
            h.created(
              ops[0],
            );
            const d =
              ops[0]!
                .data!;
            return [
              {
                id: 'm1',
                content:
                  d.content,
                senderId:
                  d.senderId,
                read:
                  d.read ??
                  false,
                createdAt:
                  new Date(
                    '2026-11-23T09:00:00Z',
                  ),
                gifUrl:
                  d.gifUrl ??
                  null,
                imageUrls:
                  d.imageUrls ??
                  [],
                expiresAt:
                  null,
              },
            ];
          },
      },
  }),
);
vi.mock(
  '@/lib/chat/chat.server',
  () => ({
    findDm:
      async () =>
        h.dm && {
          id: 'dm1',
          ...h.dm,
        },
    findGroupMembership:
      async () =>
        h.member,
  }),
);
vi.mock(
  '@/lib/moderation/restrictions.server',
  () => ({
    restrictionResponse:
      async () =>
        h.restricted
          ? Response.json(
              {
                error:
                  'restricted',
                code: 'feature_restricted',
              },
              {
                status: 403,
              },
            )
          : null,
  }),
);
vi.mock(
  '@/lib/admin-audit.server',
  () => ({
    getActiveBan:
      async () =>
        h.banned
          ? {
              reason:
                'x',
            }
          : null,
  }),
);
vi.mock(
  '@/lib/rate-limit.server',
  () => ({
    checkRateLimit:
      async () => ({
        allowed: false,
        retryAfter: 7,
      }),
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
  '@/lib/message-events',
  () => ({
    notifyUser:
      h.notifyUser,
  }),
);
vi.mock(
  '@/lib/group-events',
  () => ({
    publishGroupMessage:
      h.publishGroup,
  }),
);
vi.mock(
  '@/lib/chat-plus/unread.server',
  () => ({
    adjustDmUnread:
      h.adjust,
  }),
);
vi.mock(
  '@/lib/group-chat/serialize.server',
  () => ({
    groupMessageSelect:
      {},
    serializeGroupMessages:
      async (
        rows: {
          id: string;
        }[],
      ) =>
        rows.map(
          (
            r,
          ) => ({
            ...r,
            poll: null,
          }),
        ),
  }),
);

const {
  sendDirectMessage,
  sendGroupMessage,
} =
  await import('@/lib/messages/send.server');

const direct =
  (
    over: Partial<
      Parameters<
        typeof sendDirectMessage
      >[0]
    > = {},
  ) =>
    sendDirectMessage(
      {
        userId:
          'me',
        conversationId:
          'dm1',
        input:
          {
            content:
              'hi',
          },
        pairRateLimit: false,
        ...over,
      },
    );

beforeEach(
  () => {
    h.dm =
      {
        participantOneId:
          'me',
        participantTwoId:
          'ana',
        disappearAfterSec:
          null,
      };
    h.member =
      {
        id: 'm',
        chat: {
          disappearAfterSec:
            null,
        },
      };
    h.privacy =
      'EVERYONE';
    h.follows = true;
    h.blocks = [];
    h.restricted = false;
    h.banned = false;
    for (const f of [
      h.created,
      h.notifyUser,
      h.publishGroup,
      h.adjust,
    ])
      f.mockReset();
  },
);

describe('sendDirectMessage', () => {
  it('writes the message, notifies the recipient and nudges their unread count', async () => {
    const r =
      await direct();
    expect(
      r.ok,
    ).toBe(
      true,
    );
    if (
      !r.ok
    )
      return;
    expect(
      r
        .value
        .message,
    ).toMatchObject(
      {
        id: 'm1',
        conversationId:
          'dm1',
        senderId:
          'me',
        content:
          'hi',
        read: false,
      },
    );
    expect(
      h.notifyUser,
    ).toHaveBeenCalledWith(
      'ana',
      {
        type: 'new-message',
        message:
          r
            .value
            .message,
      },
    );
    expect(
      h.adjust,
    ).toHaveBeenCalledWith(
      'ana',
      1,
    );
  });

  it('keeps Saved Messages silent and already read', async () => {
    h.dm =
      {
        participantOneId:
          'me',
        participantTwoId:
          'me',
        disappearAfterSec:
          null,
      };
    const r =
      await direct();
    expect(
      r.ok &&
        r
          .value
          .message
          .read,
    ).toBe(
      true,
    );
    expect(
      h.notifyUser,
    ).not.toHaveBeenCalled();
  });

  it('refuses a chat that is missing or not the sender’s, with the endpoint’s statuses', async () => {
    h.dm =
      null;
    const missing =
      await direct();
    expect(
      missing,
    ).toMatchObject(
      {
        ok: false,
        code: 'not-found',
      },
    );
    h.dm =
      {
        participantOneId:
          'ana',
        participantTwoId:
          'bo',
        disappearAfterSec:
          null,
      };
    const stranger =
      await direct();
    expect(
      stranger,
    ).toMatchObject(
      {
        ok: false,
        code: 'not-member',
      },
    );
    if (
      !missing.ok &&
      !stranger.ok
    ) {
      expect(
        [
          missing
            .response
            .status,
          stranger
            .response
            .status,
        ],
      ).toEqual(
        [
          404,
          403,
        ],
      );
    }
    expect(
      h.created,
    ).not.toHaveBeenCalled();
  });

  it('refuses images that are not the sender’s', async () => {
    const r =
      await direct(
        {
          input:
            {
              content:
                '',
              imageUrls:
                [
                  '/uploads/feed/ana-1.png',
                ],
            },
        },
      );
    expect(
      r,
    ).toMatchObject(
      {
        ok: false,
        code: 'invalid-image',
      },
    );
  });

  it('applies the recipient’s DM privacy', async () => {
    h.privacy =
      'NONE';
    expect(
      await direct(),
    ).toMatchObject(
      {
        ok: false,
        code: 'cannot-message',
      },
    );
    h.privacy =
      'FOLLOWERS';
    h.follows = false;
    expect(
      await direct(),
    ).toMatchObject(
      {
        ok: false,
        code: 'cannot-message',
      },
    );
    h.follows = true;
    expect(
      (
        await direct()
      )
        .ok,
    ).toBe(
      true,
    );
  });

  it('surfaces the sender’s restriction as its own response', async () => {
    h.restricted = true;
    const r =
      await direct();
    expect(
      r,
    ).toMatchObject(
      {
        ok: false,
        code: 'restricted',
      },
    );
    if (
      !r.ok
    )
      expect(
        (
          await r.response.json()
        )
          .code,
      ).toBe(
        'feature_restricted',
      );
  });

  it('applies the per-recipient flood limit only when asked', async () => {
    const limited =
      await direct(
        {
          pairRateLimit: true,
        },
      );
    expect(
      limited,
    ).toMatchObject(
      {
        ok: false,
        code: 'rate-limited',
      },
    );
    if (
      !limited.ok
    ) {
      expect(
        limited
          .response
          .status,
      ).toBe(
        429,
      );
      expect(
        limited.response.headers.get(
          'Retry-After',
        ),
      ).toBe(
        '7',
      );
    }
    expect(
      (
        await direct(
          {
            pairRateLimit: false,
          },
        )
      )
        .ok,
    ).toBe(
      true,
    );
  });
});

describe('sendDirectMessage and blocks', () => {
  it('refuses a sender the recipient blocked, with 403 and nothing written', async () => {
    h.blocks = [{ blockerId: 'ana', blockedId: 'me' }];
    const r = await direct();
    expect(r).toMatchObject({ ok: false, code: 'blocked' });
    if (!r.ok) expect(r.response.status).toBe(403);
    expect(h.created).not.toHaveBeenCalled();
    expect(h.notifyUser).not.toHaveBeenCalled();
  });

  it('refuses a sender who blocked the recipient', async () => {
    h.blocks = [{ blockerId: 'me', blockedId: 'ana' }];
    const r = await direct();
    expect(r).toMatchObject({ ok: false, code: 'blocked' });
    expect(h.created).not.toHaveBeenCalled();
  });

  it('sends when nobody is blocked, and ignores blocks between other people', async () => {
    h.blocks = [{ blockerId: 'ana', blockedId: 'zed' }];
    expect(await direct()).toMatchObject({ ok: true });
    expect(h.created).toHaveBeenCalledTimes(1);
  });

  it('never blocks Saved Messages', async () => {
    h.dm = { participantOneId: 'me', participantTwoId: 'me', disappearAfterSec: null };
    h.blocks = [{ blockerId: 'me', blockedId: 'me' }];
    expect(await direct()).toMatchObject({ ok: true });
  });
});

describe('sendGroupMessage', () => {
  const group =
    (
      input: Parameters<
        typeof sendGroupMessage
      >[0]['input'] = {
        content:
          ' hello ',
      },
    ) =>
      sendGroupMessage(
        {
          userId:
            'me',
          groupId:
            'g1',
          input,
        },
      );

  it('trims, stores and publishes to the group', async () => {
    const r =
      await group();
    expect(
      r.ok,
    ).toBe(
      true,
    );
    expect(
      h
        .created
        .mock
        .calls[0]![0]
        .data,
    ).toMatchObject(
      {
        chatId:
          'g1',
        senderId:
          'me',
        content:
          'hello',
      },
    );
    expect(
      h.publishGroup,
    ).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining(
        {
          id: 'm1',
          poll: null,
        },
      ),
    );
  });

  it('refuses a non-member, an empty message, foreign images, a ban and a restriction', async () => {
    h.member =
      null;
    expect(
      await group(),
    ).toMatchObject(
      {
        ok: false,
        code: 'not-member',
      },
    );
    h.member =
      {
        id: 'm',
        chat: {
          disappearAfterSec:
            null,
        },
      };
    expect(
      await group(
        {
          content:
            '  ',
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        code: 'empty',
      },
    );
    expect(
      await group(
        {
          imageUrls:
            [
              '/uploads/feed/ana-1.png',
            ],
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        code: 'invalid-image',
      },
    );
    h.restricted = true;
    expect(
      await group(),
    ).toMatchObject(
      {
        ok: false,
        code: 'restricted',
      },
    );
    h.restricted = false;
    h.banned = true;
    expect(
      await group(),
    ).toMatchObject(
      {
        ok: false,
        code: 'restricted',
      },
    );
    expect(
      h.publishGroup,
    ).not.toHaveBeenCalled();
  });
});
