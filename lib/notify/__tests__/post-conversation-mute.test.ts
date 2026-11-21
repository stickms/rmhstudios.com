import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Muting a post's conversation: a `post:<rootId>` ConversationPref row that createNotification reads through
// `conversationKey`. These hold the rule the member sees: a muted (None) thread produces no reply or like notification,
// Mentions only still lets a direct reply and an @mention through, muting from any reply mutes the root, a timed mute
// ends by itself, and a post the member cannot read cannot be muted.

interface PrefRow {
  userId: string;
  scopeKey: string;
  muteUntil: Date | null;
  mentionsOnly: boolean;
  pinned: boolean;
  updatedAt: Date;
}
const prefs =
  vi.hoisted(
    () => ({
      rows: new Map<
        string,
        unknown
      >(),
    }),
  );
const created =
  vi.hoisted(
    () =>
      [] as {
        userId: string;
        type: string;
      }[],
  );
const findManyPrefs =
  vi.hoisted(
    () =>
      vi.fn(),
  );
/** Posts, and which viewers may read each. */
const posts =
  vi.hoisted(
    () =>
      new Map<
        string,
        {
          id: string;
          threadRootId:
            | string
            | null;
          readers: string[];
        }
      >(),
  );

const key =
  (
    userId: string,
    scopeKey: string,
  ) =>
    `${userId}|${scopeKey}`;

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        notificationPreference:
          {
            findUnique:
              vi.fn(
                async () =>
                  null,
              ),
          },
        notification:
          {
            findFirst:
              vi.fn(
                async () =>
                  null,
              ),
            create:
              vi.fn(
                async ({
                  data,
                }: {
                  data: {
                    userId: string;
                    type: string;
                  };
                }) => {
                  created.push(
                    {
                      userId:
                        data.userId,
                      type: data.type,
                    },
                  );
                  return {
                    id: `n${created.length}`,
                  };
                },
              ),
          },
        conversationPref:
          {
            findUnique:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    userId_scopeKey: {
                      userId: string;
                      scopeKey: string;
                    };
                  };
                }) =>
                  (prefs.rows.get(
                    key(
                      where
                        .userId_scopeKey
                        .userId,
                      where
                        .userId_scopeKey
                        .scopeKey,
                    ),
                  ) as
                    | PrefRow
                    | undefined) ??
                  null,
              ),
            findMany:
              findManyPrefs,
            upsert:
              vi.fn(
                async (args: {
                  where: {
                    userId_scopeKey: {
                      userId: string;
                      scopeKey: string;
                    };
                  };
                  create: Partial<PrefRow>;
                  update: Partial<PrefRow>;
                }) => {
                  const {
                    userId,
                    scopeKey,
                  } =
                    args
                      .where
                      .userId_scopeKey;
                  const row =
                    {
                      muteUntil:
                        null,
                      mentionsOnly: false,
                      pinned: false,
                      ...(prefs.rows.get(
                        key(
                          userId,
                          scopeKey,
                        ),
                      ) as
                        | object
                        | undefined),
                      ...args.create,
                      ...args.update,
                      userId,
                      scopeKey,
                      updatedAt:
                        new Date(),
                    };
                  prefs.rows.set(
                    key(
                      userId,
                      scopeKey,
                    ),
                    row,
                  );
                  return row;
                },
              ),
            deleteMany:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    userId: string;
                    scopeKey: string;
                  };
                }) => {
                  prefs.rows.delete(
                    key(
                      where.userId,
                      where.scopeKey,
                    ),
                  );
                  return {
                    count: 1,
                  };
                },
              ),
          },
        rMHark:
          {
            findFirst:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    id: string;
                    visibleTo: string;
                  };
                }) => {
                  const p =
                    posts.get(
                      where.id,
                    );
                  return p &&
                    p.readers.includes(
                      where.visibleTo,
                    )
                    ? {
                        id: p.id,
                        threadRootId:
                          p.threadRootId,
                      }
                    : null;
                },
              ),
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
                    posts.get(
                      where.id,
                    );
                  return p
                    ? {
                        id: p.id,
                        threadRootId:
                          p.threadRootId,
                        userId:
                          'bob',
                        audience:
                          'PUBLIC',
                        communityId:
                          null,
                      }
                    : null;
                },
              ),
          },
      },
  }),
);
vi.mock(
  '@/lib/feed/audience.server',
  () => ({
    viewerVisiblePostWhere:
      async (
        viewerId: string,
      ) => ({
        visibleTo:
          viewerId,
      }),
    canViewPost:
      vi.fn(
        async () =>
          true,
      ),
  }),
);
vi.mock(
  '@/lib/cached.server',
  () => ({
    cachedNullable:
      (
        _key: string,
        _ttl: number,
        load: () => Promise<unknown>,
      ) =>
        load(),
    invalidateCached:
      vi.fn(),
  }),
);
vi.mock(
  '@/lib/redis.server',
  () => ({
    redisEnabled:
      () =>
        false,
    redisGetJSON:
      vi.fn(),
    redisSetJSON:
      vi.fn(),
    redisIncrBy:
      vi.fn(),
  }),
);
vi.mock(
  '@/lib/push/send.server',
  () => ({
    sendPushToUser:
      vi.fn(),
    pushTitleFor:
      () =>
        'title',
    pushActionsFor:
      () =>
        undefined,
  }),
);
vi.mock(
  '@/lib/notify/held.server',
  () => ({
    holdNotification:
      vi.fn(
        async () => {},
      ),
  }),
);
vi.mock(
  '@/lib/handles/lookup.server',
  () => ({
    findUsersByHandles:
      vi.fn(
        async () => [
          {
            id: 'muted',
          },
          {
            id: 'open',
          },
          {
            id: 'quiet',
          },
        ],
      ),
  }),
);
vi.mock(
  '@/lib/feed-sse',
  () => ({
    feedEventBus:
      {
        publish:
          vi.fn(),
      },
  }),
);

const {
  createNotification,
} =
  await import('@/lib/notifications.server');
const {
  notifyMentions,
} =
  await import('@/lib/feed/notify-mentions.server');
const {
  prisma,
} =
  await import('@/lib/prisma.server');
const {
  postConversationKey,
  setConversationMute,
  clearConversationMute,
  getConversationMute,
} =
  await import('@/lib/feed/conversation-controls.server');
const {
  feedEventBus,
} =
  await import('@/lib/feed-sse');

const ROOT =
  'root1';
const KEY = `post:${ROOT}`;
const HOUR = 3_600_000;

function setPref(
  userId: string,
  patch: Partial<PrefRow>,
) {
  prefs.rows.set(
    key(
      userId,
      KEY,
    ),
    {
      userId,
      scopeKey:
        KEY,
      muteUntil:
        null,
      mentionsOnly: false,
      pinned: false,
      updatedAt:
        new Date(),
      ...patch,
    },
  );
}

beforeEach(
  () => {
    prefs.rows.clear();
    created.length = 0;
    posts.clear();
    posts.set(
      ROOT,
      {
        id: ROOT,
        threadRootId:
          null,
        readers:
          [
            'alice',
            'bob',
          ],
      },
    );
    posts.set(
      'reply-post',
      {
        id: 'reply-post',
        threadRootId:
          ROOT,
        readers:
          [
            'alice',
            'bob',
          ],
      },
    );
    posts.set(
      'private',
      {
        id: 'private',
        threadRootId:
          null,
        readers:
          [
            'bob',
          ],
      },
    );
    findManyPrefs.mockReset();
    findManyPrefs.mockImplementation(
      async ({
        where,
      }: {
        where: {
          scopeKey: string;
          userId: {
            in: string[];
          };
        };
      }) =>
        where.userId.in
          .map(
            (
              u,
            ) =>
              prefs.rows.get(
                key(
                  u,
                  where.scopeKey,
                ),
              ) as
                | PrefRow
                | undefined,
          )
          .filter(
            (
              r,
            ): r is PrefRow =>
              !!r,
          ),
    );
    vi.mocked(
      feedEventBus.publish,
    ).mockClear();
  },
);

describe('a muted conversation (None)', () => {
  beforeEach(
    () =>
      setPref(
        'alice',
        {
          muteUntil:
            new Date(
              Date.now() +
                7 *
                  24 *
                  HOUR,
            ),
        },
      ),
  );

  it('creates no reply, comment, like or repost notification', async () => {
    for (const type of [
      'REPLY',
      'COMMENT',
      'LIKE',
      'REPOST',
    ] as const) {
      await createNotification(
        {
          userId:
            'alice',
          actorId:
            'bob',
          type,
          conversationKey:
            KEY,
          addressed:
            type ===
            'REPLY',
        },
      );
    }
    expect(
      created,
    ).toEqual(
      [],
    );
  });

  it('stays silent for an @mention too: a mute outranks mentions', async () => {
    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'MENTION',
        conversationKey:
          KEY,
      },
    );
    expect(
      created,
    ).toEqual(
      [],
    );
  });

  it('does not touch another member, or a call that names no conversation', async () => {
    await createNotification(
      {
        userId:
          'bob',
        actorId:
          'alice',
        type: 'LIKE',
        conversationKey:
          KEY,
      },
    );
    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'LIKE',
      },
    );
    expect(
      created.map(
        (
          c,
        ) =>
          c.userId,
      ),
    ).toEqual(
      [
        'bob',
        'alice',
      ],
    );
  });

  it('delivers again once the mute has expired', async () => {
    setPref(
      'alice',
      {
        muteUntil:
          new Date(
            Date.now() -
              HOUR,
          ),
      },
    );
    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'LIKE',
        conversationKey:
          KEY,
      },
    );
    expect(
      created,
    ).toHaveLength(
      1,
    );
  });

  it('delivers again after the member unmutes', async () => {
    await clearConversationMute(
      'alice',
      ROOT,
    );
    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'LIKE',
        conversationKey:
          KEY,
      },
    );
    expect(
      created,
    ).toHaveLength(
      1,
    );
  });
});

describe('Mentions only', () => {
  beforeEach(
    () =>
      setPref(
        'alice',
        {
          mentionsOnly: true,
        },
      ),
  );

  it('still delivers a direct reply and an @mention', async () => {
    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'REPLY',
        conversationKey:
          KEY,
        addressed: true,
      },
    );
    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'MENTION',
        conversationKey:
          KEY,
      },
    );
    expect(
      created.map(
        (
          c,
        ) =>
          c.type,
      ),
    ).toEqual(
      [
        'REPLY',
        'MENTION',
      ],
    );
  });

  it('drops what does not address the member: likes, reposts, replies under the post', async () => {
    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'LIKE',
        conversationKey:
          KEY,
      },
    );
    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'REPOST',
        conversationKey:
          KEY,
      },
    );
    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'COMMENT',
        conversationKey:
          KEY,
      },
    );
    expect(
      created,
    ).toEqual(
      [],
    );
  });
});

describe('the scope is the thread root', () => {
  it('names the root for any post in the thread', () => {
    expect(
      postConversationKey(
        {
          id: 'reply-post',
          threadRootId:
            ROOT,
        },
      ),
    ).toBe(
      KEY,
    );
    expect(
      postConversationKey(
        {
          id: ROOT,
          threadRootId:
            null,
        },
      ),
    ).toBe(
      KEY,
    );
  });

  it('muting from a reply mutes the root, and a notification about another reply is dropped', async () => {
    const state =
      await setConversationMute(
        'alice',
        'reply-post',
        '24h',
      );
    expect(
      state?.mode,
    ).toBe(
      'none',
    );
    expect(
      prefs.rows.has(
        key(
          'alice',
          KEY,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      prefs.rows.has(
        key(
          'alice',
          'post:reply-post',
        ),
      ),
    ).toBe(
      false,
    );

    await createNotification(
      {
        userId:
          'alice',
        actorId:
          'bob',
        type: 'LIKE',
        conversationKey:
          postConversationKey(
            {
              id: 'another-reply',
              threadRootId:
                ROOT,
            },
          ),
      },
    );
    expect(
      created,
    ).toEqual(
      [],
    );
  });
});

describe('setting the choice', () => {
  it('a 7 day mute ends in about 7 days; an open-ended one reports itself as indefinite', async () => {
    const week =
      await setConversationMute(
        'alice',
        ROOT,
        '7d',
      );
    const ms =
      Date.parse(
        week!
          .muteUntil!,
      ) -
      Date.now();
    expect(
      ms,
    ).toBeGreaterThan(
      7 *
        24 *
        HOUR -
        5000,
    );
    expect(
      ms,
    ).toBeLessThanOrEqual(
      7 *
        24 *
        HOUR,
    );

    const forever =
      await setConversationMute(
        'alice',
        ROOT,
        'forever',
      );
    expect(
      forever,
    ).toEqual(
      {
        mode: 'none',
        muteUntil:
          null,
        indefinite: true,
      },
    );
    expect(
      (
        await getConversationMute(
          'alice',
          ROOT,
        )
      )
        ?.indefinite,
    ).toBe(
      true,
    );
  });

  it('Mentions only is stored as mentionsOnly with no mute date', async () => {
    const state =
      await setConversationMute(
        'alice',
        ROOT,
        'mentions',
      );
    expect(
      state,
    ).toEqual(
      {
        mode: 'mentions',
        muteUntil:
          null,
        indefinite: false,
      },
    );
  });

  it('refuses a post the member cannot read, and writes nothing', async () => {
    expect(
      await setConversationMute(
        'alice',
        'private',
        '24h',
      ),
    ).toBeNull();
    expect(
      await getConversationMute(
        'alice',
        'private',
      ),
    ).toBeNull();
    expect(
      prisma
        .conversationPref
        .upsert,
    ).not.toHaveBeenCalled();
    expect(
      prefs
        .rows
        .size,
    ).toBe(
      0,
    );
  });

  it('writes only the caller’s own row', async () => {
    await setConversationMute(
      'bob',
      ROOT,
      '24h',
    );
    expect(
      [
        ...prefs.rows.keys(),
      ],
    ).toEqual(
      [
        key(
          'bob',
          KEY,
        ),
      ],
    );
  });
});

describe('@mentions fan out with one preference lookup', () => {
  it('skips a member who muted the conversation and keeps Mentions only members', async () => {
    posts.set(
      'p',
      {
        id: 'p',
        threadRootId:
          ROOT,
        readers:
          [],
      },
    );
    setPref(
      'muted',
      {
        muteUntil:
          new Date(
            Date.now() +
              HOUR,
          ),
      },
    );
    setPref(
      'quiet',
      {
        mentionsOnly: true,
      },
    );

    await notifyMentions(
      {
        content:
          'hi @muted @open @quiet',
        author:
          {
            id: 'bob',
            name: null,
            image:
              null,
            handle:
              'bob',
          },
        postId:
          'p',
        entityType:
          'comment',
        entityId:
          'c1',
        link: '/x',
        timestamp:
          new Date().toISOString(),
      },
    );

    expect(
      findManyPrefs,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      created
        .map(
          (
            c,
          ) =>
            c.userId,
        )
        .sort(),
    ).toEqual(
      [
        'open',
        'quiet',
      ],
    );
    const toast =
      vi.mocked(
        feedEventBus.publish,
      )
        .mock
        .calls[0]?.[0] as {
        targetUserIds: string[];
      };
    expect(
      toast.targetUserIds.sort(),
    ).toEqual(
      [
        'open',
        'quiet',
      ],
    );
  });
});
