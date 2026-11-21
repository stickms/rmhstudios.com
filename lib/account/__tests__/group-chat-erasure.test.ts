import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a member's `ChatMember` rows and the groups they own
 * never cascade away. The pre-erasure step makes them leave every group through the same function the Leave
 * button uses, so ownership passes on and a group they were alone in is removed.
 */

const h =
  vi.hoisted(
    () => {
      const state =
        {
          chats:
            [] as {
              id: string;
              kind: string;
              ownerId:
                | string
                | null;
            }[],
          members:
            [] as {
              id: string;
              chatId: string;
              userId: string;
              joinedAt: Date;
            }[],
        };
      const sweepOps: unknown[] =
        [];
      return {
        state,
        sweepOps,
      };
    },
  );

vi.mock(
  '@/lib/prisma.server',
  () => {
    const {
      state,
    } =
      h;
    const tx =
      {
        $executeRaw:
          async () => {},
        // s06-09: a leaving owner's invite links are revoked; this suite does not look at them.
        chatInvite: { updateMany: async () => ({ count: 0 }) },
        chat: {
          findFirst:
            async ({
              where,
            }: {
              where: {
                id: string;
              };
            }) =>
              state.chats.find(
                (
                  c,
                ) =>
                  c.id ===
                  where.id,
              ) ??
              null,
          update:
            async ({
              where,
              data,
            }: {
              where: {
                id: string;
              };
              data: {
                ownerId: string;
              };
            }) => {
              Object.assign(
                state.chats.find(
                  (
                    c,
                  ) =>
                    c.id ===
                    where.id,
                )!,
                data,
              );
            },
          delete:
            async ({
              where,
            }: {
              where: {
                id: string;
              };
            }) => {
              state.chats =
                state.chats.filter(
                  (
                    c,
                  ) =>
                    c.id !==
                    where.id,
                );
              state.members =
                state.members.filter(
                  (
                    m,
                  ) =>
                    m.chatId !==
                    where.id,
                );
            },
        },
        chatMember:
          {
            findUnique:
              async ({
                where,
              }: {
                where: {
                  chatId_userId: {
                    chatId: string;
                    userId: string;
                  };
                };
              }) =>
                state.members.find(
                  (
                    m,
                  ) =>
                    m.chatId ===
                      where
                        .chatId_userId
                        .chatId &&
                    m.userId ===
                      where
                        .chatId_userId
                        .userId,
                ) ??
                null,
            findMany:
              async ({
                where,
              }: {
                where: {
                  chatId?: string;
                  userId?: string;
                };
              }) =>
                state.members
                  .filter(
                    (
                      m,
                    ) =>
                      where.chatId
                        ? m.chatId ===
                          where.chatId
                        : m.userId ===
                          where.userId,
                  )
                  .map(
                    (
                      m,
                    ) => ({
                      ...m,
                    }),
                  ),
            findFirst:
              async ({
                where,
              }: {
                where: {
                  chatId: string;
                };
              }) =>
                state.members.find(
                  (
                    m,
                  ) =>
                    m.chatId ===
                    where.chatId,
                ) ??
                null,
            delete:
              async ({
                where,
              }: {
                where: {
                  id: string;
                };
              }) => {
                state.members =
                  state.members.filter(
                    (
                      m,
                    ) =>
                      m.id !==
                      where.id,
                  );
              },
          },
        user: {
          findUnique:
            async ({
              where,
            }: {
              where: {
                id: string;
              };
            }) => ({
              id: where.id,
              name: null,
              handle:
                null,
            }),
        },
      };
    const model =
      (
        name: string,
      ) =>
        new Proxy(
          {},
          {
            get:
              (
                _t,
                method: string,
              ) =>
              (
                args: unknown,
              ) => ({
                model:
                  name,
                method,
                args,
              }),
          },
        );
    return {
      prisma:
        new Proxy(
          {
            $transaction:
              vi.fn(
                async (
                  arg: unknown,
                ) => {
                  if (
                    typeof arg ===
                    'function'
                  )
                    return (
                      arg as (
                        t: unknown,
                      ) => Promise<unknown>
                    )(
                      tx,
                    );
                  h.sweepOps.push(
                    arg,
                  );
                  return arg;
                },
              ),
            // The sweep transaction also records `chat.deleteMany` (message requests, feature 16).
            chat: new Proxy(tx.chat as Record<string, unknown>, {
              get: (t, m: string) => (m in t ? t[m] : model('chat')[m as never]),
            }),
            chatMember:
              tx.chatMember,
            user: new Proxy(
              tx.user as Record<
                string,
                unknown
              >,
              {
                get: (
                  t,
                  m: string,
                ) =>
                  m in
                  t
                    ? t[
                        m
                      ]
                    : model(
                        'user',
                      )[
                        m as never
                      ],
              },
            ),
          } as Record<
            string,
            unknown
          >,
          {
            get: (
              t,
              key: string,
            ) =>
              key in
              t
                ? t[
                    key
                  ]
                : model(
                    key,
                  ),
          },
        ),
    };
  },
);
vi.mock(
  '@/lib/chat-plus/access.server',
  () => ({
    getChatAccess:
      async () =>
        null,
    publishChatUpdate:
      () => {},
  }),
);
vi.mock(
  '@/lib/chat-plus/post.server',
  () => ({
    postSystemLine:
      vi.fn(),
  }),
);
vi.mock(
  '@/lib/notify/dispatch.server',
  () => ({
    dispatch:
      vi.fn(),
  }),
);

import { anonymizeAccount } from '@/lib/account/deletion.server';

const at =
  (
    s: number,
  ) =>
    new Date(
      2026,
      0,
      1,
      0,
      0,
      s,
    );

describe('anonymizeAccount (group chats)', () => {
  it('leaves every group, passing ownership on and removing a group the member was alone in', async () => {
    h.state.chats =
      [
        {
          id: 'owned',
          kind: 'group',
          ownerId:
            'leaver',
        },
        {
          id: 'joined',
          kind: 'group',
          ownerId:
            'other',
        },
        {
          id: 'alone',
          kind: 'group',
          ownerId:
            'leaver',
        },
      ];
    h.state.members =
      [
        {
          id: '1',
          chatId:
            'owned',
          userId:
            'leaver',
          joinedAt:
            at(
              0,
            ),
        },
        {
          id: '2',
          chatId:
            'owned',
          userId:
            'late',
          joinedAt:
            at(
              9,
            ),
        },
        {
          id: '3',
          chatId:
            'owned',
          userId:
            'early',
          joinedAt:
            at(
              1,
            ),
        },
        {
          id: '4',
          chatId:
            'joined',
          userId:
            'other',
          joinedAt:
            at(
              0,
            ),
        },
        {
          id: '5',
          chatId:
            'joined',
          userId:
            'leaver',
          joinedAt:
            at(
              2,
            ),
        },
        {
          id: '6',
          chatId:
            'alone',
          userId:
            'leaver',
          joinedAt:
            at(
              0,
            ),
        },
      ];

    await anonymizeAccount(
      'leaver',
    );

    expect(
      h.state.members.some(
        (
          m,
        ) =>
          m.userId ===
          'leaver',
      ),
    ).toBe(
      false,
    );
    expect(
      h.state.chats.find(
        (
          c,
        ) =>
          c.id ===
          'owned',
      )
        ?.ownerId,
    ).toBe(
      'early',
    );
    expect(
      h.state.chats.find(
        (
          c,
        ) =>
          c.id ===
          'joined',
      )
        ?.ownerId,
    ).toBe(
      'other',
    );
    expect(
      h.state.chats.some(
        (
          c,
        ) =>
          c.id ===
          'alone',
      ),
    ).toBe(
      false,
    );
  });

  it('is safe to run again', async () => {
    h.state.chats =
      [
        {
          id: 'g',
          kind: 'group',
          ownerId:
            'someone',
        },
      ];
    h.state.members =
      [
        {
          id: '1',
          chatId:
            'g',
          userId:
            'someone',
          joinedAt:
            at(
              0,
            ),
        },
      ];
    await anonymizeAccount(
      'leaver',
    );
    await anonymizeAccount(
      'leaver',
    );
    expect(
      h
        .state
        .members,
    ).toHaveLength(
      1,
    );
  });
});
