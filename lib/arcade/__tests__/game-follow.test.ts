import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Following a game and its updates (s03-10): a follow writes only the caller's row, the fan-out notifies a follower
 * once however often it runs, members with system notifications off are skipped, a guide's author is not told about
 * their own guide, and only an admin can edit or delete a patch note. Prisma is a small in-memory stand-in.
 */

interface Follow {
  userId: string;
  gameId: string;
  createdAt: Date;
}
interface Note {
  id: string;
  gameId: string;
  version: string;
  title: string;
  body: string;
  createdAt: Date;
}
interface Guide {
  id: string;
  gameId: string;
  title: string;
  published: boolean;
  authorId: string;
}
interface Notif {
  userId: string;
  type: string;
  entityType: string;
  entityId: string;
  preview: string;
  link: string;
}

const h =
  vi.hoisted(
    () => ({
      follows:
        [] as Follow[],
      notes:
        [] as Note[],
      guides:
        [] as Guide[],
      notifs:
        [] as Notif[],
      systemOff:
        new Set<string>(),
      session:
        null as {
          user: {
            id: string;
            isAdmin: boolean;
          };
        } | null,
      audits:
        [] as {
          adminId: string;
          action: string;
          targetId?: string;
        }[],
      upserts:
        [] as unknown[],
      sends:
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
    logAdminAction:
      vi.fn(
        async (
          adminId: string,
          action: string,
          opts: {
            targetId?: string;
          },
        ) => {
          h.audits.push(
            {
              adminId,
              action,
              ...(opts.targetId
                ? {
                    targetId:
                      opts.targetId,
                  }
                : {}),
            },
          );
        },
      ),
  }),
);
vi.mock(
  '@/lib/notifications.server',
  () => ({
    adjustNotifUnread:
      vi.fn(
        async () =>
          undefined,
      ),
  }),
);
vi.mock(
  '@/lib/cached.server',
  async (
    importOriginal,
  ) => ({
    ...(await importOriginal<
      typeof import('@/lib/cached.server')
    >()),
    cached:
      vi.fn(
        async (
          _k: string,
          _t: number,
          f: () => unknown,
        ) =>
          f(),
      ),
    invalidateCached:
      vi.fn(
        async () =>
          undefined,
      ),
  }),
);
vi.mock(
  '@/lib/jobs/boss.server',
  () => ({
    getBoss:
      vi.fn(
        async () => ({
          send: vi.fn(
            async (
              ...args: unknown[]
            ) => {
              h.sends.push(
                args,
              );
              return 'job';
            },
          ),
        }),
      ),
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => {
    const prisma =
      {
        gameFollow:
          {
            count:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    gameId: string;
                  };
                }) =>
                  h.follows.filter(
                    (
                      f,
                    ) =>
                      f.gameId ===
                      where.gameId,
                  )
                    .length,
              ),
            findUnique:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    userId_gameId: {
                      userId: string;
                      gameId: string;
                    };
                  };
                }) => {
                  const k =
                    where.userId_gameId;
                  return (
                    h.follows.find(
                      (
                        f,
                      ) =>
                        f.userId ===
                          k.userId &&
                        f.gameId ===
                          k.gameId,
                    ) ??
                    null
                  );
                },
              ),
            upsert:
              vi.fn(
                async (args: {
                  where: {
                    userId_gameId: Follow;
                  };
                  create: Follow;
                }) => {
                  h.upserts.push(
                    args,
                  );
                  const k =
                    args
                      .where
                      .userId_gameId;
                  if (
                    !h.follows.some(
                      (
                        f,
                      ) =>
                        f.userId ===
                          k.userId &&
                        f.gameId ===
                          k.gameId,
                    )
                  ) {
                    h.follows.push(
                      {
                        ...args.create,
                        createdAt:
                          new Date(),
                      },
                    );
                  }
                },
              ),
            deleteMany:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    userId: string;
                    gameId: string;
                  };
                }) => {
                  h.follows =
                    h.follows.filter(
                      (
                        f,
                      ) =>
                        !(
                          f.userId ===
                            where.userId &&
                          f.gameId ===
                            where.gameId
                        ),
                    );
                },
              ),
            findMany:
              vi.fn(
                async ({
                  where,
                  take,
                }: {
                  where: {
                    gameId?: string;
                    userId?:
                      | string
                      | {
                          gt: string;
                        };
                  };
                  take?: number;
                }) => {
                  let rows =
                    h.follows.filter(
                      (
                        f,
                      ) =>
                        where.gameId
                          ? f.gameId ===
                            where.gameId
                          : true,
                    );
                  if (
                    typeof where.userId ===
                    'string'
                  )
                    rows =
                      rows.filter(
                        (
                          f,
                        ) =>
                          f.userId ===
                          where.userId,
                      );
                  if (
                    where.userId &&
                    typeof where.userId ===
                      'object'
                  ) {
                    const gt =
                      where
                        .userId
                        .gt;
                    rows =
                      rows.filter(
                        (
                          f,
                        ) =>
                          f.userId >
                          gt,
                      );
                  }
                  rows =
                    [
                      ...rows,
                    ].sort(
                      (
                        a,
                        b,
                      ) =>
                        a.userId <
                        b.userId
                          ? -1
                          : 1,
                    );
                  return take
                    ? rows.slice(
                        0,
                        take,
                      )
                    : rows;
                },
              ),
          },
        gamePatchNote:
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
                  h.notes.find(
                    (
                      n,
                    ) =>
                      n.id ===
                      where.id,
                  ) ??
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
                  data: Partial<Note>;
                }) => {
                  const n =
                    h.notes.find(
                      (
                        x,
                      ) =>
                        x.id ===
                        where.id,
                    )!;
                  Object.assign(
                    n,
                    data,
                  );
                  return n;
                },
              ),
            deleteMany:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    id: string;
                  };
                }) => {
                  h.notes =
                    h.notes.filter(
                      (
                        n,
                      ) =>
                        n.id !==
                        where.id,
                    );
                },
              ),
          },
        gameGuide:
          {
            // A row read is a snapshot: a later write must not change what was read.
            findFirst:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    id: string;
                    authorId: string;
                  };
                }) => {
                  const g =
                    h.guides.find(
                      (
                        x,
                      ) =>
                        x.id ===
                          where.id &&
                        x.authorId ===
                          where.authorId,
                    );
                  return g
                    ? {
                        ...g,
                      }
                    : null;
                },
              ),
            updateMany:
              vi.fn(
                async ({
                  where,
                  data,
                }: {
                  where: {
                    id: string;
                    authorId: string;
                  };
                  data: {
                    published: boolean;
                  };
                }) => {
                  const g =
                    h.guides.find(
                      (
                        x,
                      ) =>
                        x.id ===
                          where.id &&
                        x.authorId ===
                          where.authorId,
                    );
                  if (
                    g
                  )
                    g.published =
                      data.published;
                  return {
                    count:
                      g
                        ? 1
                        : 0,
                  };
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
                }) =>
                  h.guides.find(
                    (
                      g,
                    ) =>
                      g.id ===
                      where.id,
                  ) ??
                  null,
              ),
          },
        notificationPreference:
          {
            findMany:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    userId: {
                      in: string[];
                    };
                  };
                }) =>
                  where.userId.in
                    .filter(
                      (
                        id,
                      ) =>
                        h.systemOff.has(
                          id,
                        ),
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
        notification:
          {
            findMany:
              vi.fn(
                async ({
                  where,
                }: {
                  where: {
                    userId: {
                      in: string[];
                    };
                    entityType: string;
                    entityId: string;
                  };
                }) =>
                  h.notifs
                    .filter(
                      (
                        n,
                      ) =>
                        where.userId.in.includes(
                          n.userId,
                        ) &&
                        n.entityType ===
                          where.entityType &&
                        n.entityId ===
                          where.entityId,
                    )
                    .map(
                      (
                        n,
                      ) => ({
                        userId:
                          n.userId,
                      }),
                    ),
              ),
            createMany:
              vi.fn(
                async ({
                  data,
                }: {
                  data: Notif[];
                }) => {
                  h.notifs.push(
                    ...data,
                  );
                },
              ),
          },
      };
    return {
      prisma,
    };
  },
);

import {
  followGame,
  unfollowGame,
  fanOutGameUpdate,
  getFollowState,
} from '@/lib/arcade/updates.server';
import { publishGuide } from '@/lib/games/meta.server';
import { route as followRoute } from '@/lib/arcade/api/games.$gameId.follow.server';
import { route as noteRoute } from '@/lib/arcade/api/arcade.patch-notes.$id.server';

const GAME =
  'hearthworks';

beforeEach(
  () => {
    h.follows =
      [];
    h.notes =
      [
        {
          id: 'n1',
          gameId:
            GAME,
          version:
            '1.2',
          title:
            'Fire sale',
          body: 'Cheaper fires',
          createdAt:
            new Date(),
        },
      ];
    h.guides =
      [];
    h.notifs =
      [];
    h.systemOff =
      new Set();
    h.session =
      null;
    h.audits =
      [];
    h.upserts =
      [];
    h.sends =
      [];
  },
);

const call =
  (
    r: {
      handlers: Record<
        string,
        unknown
      >;
    },
    method: string,
    url: string,
    params: Record<
      string,
      string
    >,
    body?: unknown,
  ) =>
    (
      r
        .handlers[
        method
      ] as (a: {
        request: Request;
        params: Record<
          string,
          string
        >;
      }) => Promise<Response>
    )(
      {
        request:
          new Request(
            `https://rmhstudios.com${url}`,
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
              ...(body ===
              undefined
                ? {}
                : {
                    body: JSON.stringify(
                      body,
                    ),
                  }),
            },
          ),
        params,
      },
    );

describe('following a game', () => {
  it('writes only the caller’s row and counts followers', async () => {
    const state =
      await followGame(
        'u1',
        GAME,
      );
    expect(
      h.upserts,
    ).toHaveLength(
      1,
    );
    expect(
      h
        .upserts[0],
    ).toMatchObject(
      {
        where:
          {
            userId_gameId:
              {
                userId:
                  'u1',
                gameId:
                  GAME,
              },
          },
      },
    );
    expect(
      h.follows,
    ).toHaveLength(
      1,
    );
    expect(
      state,
    ).toEqual(
      {
        following: true,
        followers: 1,
      },
    );
    // Following twice is still one row.
    await followGame(
      'u1',
      GAME,
    );
    expect(
      h.follows,
    ).toHaveLength(
      1,
    );
  });

  it('unfollowing removes the caller’s follow and no one else’s', async () => {
    await followGame(
      'u1',
      GAME,
    );
    await followGame(
      'u2',
      GAME,
    );
    const state =
      await unfollowGame(
        'u1',
        GAME,
      );
    expect(
      state,
    ).toEqual(
      {
        following: false,
        followers: 1,
      },
    );
    expect(
      h.follows.map(
        (
          f,
        ) =>
          f.userId,
      ),
    ).toEqual(
      [
        'u2',
      ],
    );
  });

  it('the endpoint follows as the session member, whatever the request names', async () => {
    h.session =
      {
        user: {
          id: 'me',
          isAdmin: false,
        },
      };
    const res =
      await call(
        followRoute,
        'PUT',
        `/api/games/${GAME}/follow?userId=other`,
        {
          gameId:
            GAME,
        },
        {
          userId:
            'other',
        },
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      h.follows.map(
        (
          f,
        ) =>
          f.userId,
      ),
    ).toEqual(
      [
        'me',
      ],
    );
  });

  it('refuses a signed-out follow and a title with no updates page', async () => {
    expect(
      (
        await call(
          followRoute,
          'PUT',
          `/api/games/${GAME}/follow`,
          {
            gameId:
              GAME,
          },
        )
      )
        .status,
    ).toBe(
      401,
    );
    h.session =
      {
        user: {
          id: 'me',
          isAdmin: false,
        },
      };
    expect(
      (
        await call(
          followRoute,
          'PUT',
          '/api/games/no-such-game/follow',
          {
            gameId:
              'no-such-game',
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
    expect(
      h.follows,
    ).toHaveLength(
      0,
    );
  });

  it('shows the count and nothing personal to a signed-out visitor', async () => {
    await followGame(
      'u1',
      GAME,
    );
    expect(
      await getFollowState(
        null,
        GAME,
      ),
    ).toEqual(
      {
        following: false,
        followers: 1,
      },
    );
  });
});

describe('fanOutGameUpdate', () => {
  it('notifies each follower once, even when the job runs twice', async () => {
    await followGame(
      'u1',
      GAME,
    );
    await followGame(
      'u2',
      GAME,
    );
    const job =
      {
        kind: 'update',
        gameId:
          GAME,
        noteId:
          'n1',
      } as const;
    expect(
      await fanOutGameUpdate(
        job,
      ),
    ).toBe(
      2,
    );
    expect(
      await fanOutGameUpdate(
        job,
      ),
    ).toBe(
      0,
    );
    expect(
      h.notifs,
    ).toHaveLength(
      2,
    );
    expect(
      h
        .notifs[0],
    ).toMatchObject(
      {
        type: 'SYSTEM',
        entityType:
          'game_update',
        entityId:
          'n1',
        link: `/games/${GAME}/updates`,
      },
    );
    expect(
      h
        .notifs[0]!
        .preview,
    ).toMatch(
      /updated to 1\.2: Fire sale$/,
    );
  });

  it('skips members whose system notifications are off', async () => {
    await followGame(
      'u1',
      GAME,
    );
    await followGame(
      'u2',
      GAME,
    );
    h.systemOff.add(
      'u2',
    );
    await fanOutGameUpdate(
      {
        kind: 'update',
        gameId:
          GAME,
        noteId:
          'n1',
      },
    );
    expect(
      h.notifs.map(
        (
          n,
        ) =>
          n.userId,
      ),
    ).toEqual(
      [
        'u1',
      ],
    );
  });

  it('tells followers of a newly published guide but not its author', async () => {
    h.guides =
      [
        {
          id: 'g1',
          gameId:
            GAME,
          title:
            'Boss tips',
          published: true,
          authorId:
            'u1',
        },
      ];
    await followGame(
      'u1',
      GAME,
    );
    await followGame(
      'u2',
      GAME,
    );
    await fanOutGameUpdate(
      {
        kind: 'guide',
        gameId:
          GAME,
        guideId:
          'g1',
      },
    );
    expect(
      h.notifs.map(
        (
          n,
        ) =>
          n.userId,
      ),
    ).toEqual(
      [
        'u2',
      ],
    );
    expect(
      h
        .notifs[0],
    ).toMatchObject(
      {
        entityType:
          'game_guide',
        entityId:
          'g1',
        link: `/games/${GAME}/guides/g1`,
      },
    );
    expect(
      h
        .notifs[0]!
        .preview,
    ).toMatch(
      /^New guide for .+: Boss tips$/,
    );
  });

  it('writes nothing for a note deleted or a guide unpublished before the job ran', async () => {
    await followGame(
      'u1',
      GAME,
    );
    h.guides =
      [
        {
          id: 'g1',
          gameId:
            GAME,
          title:
            'Draft',
          published: false,
          authorId:
            'a',
        },
      ];
    expect(
      await fanOutGameUpdate(
        {
          kind: 'guide',
          gameId:
            GAME,
          guideId:
            'g1',
        },
      ),
    ).toBe(
      0,
    );
    expect(
      await fanOutGameUpdate(
        {
          kind: 'update',
          gameId:
            GAME,
          noteId:
            'gone',
        },
      ),
    ).toBe(
      0,
    );
    expect(
      h.notifs,
    ).toHaveLength(
      0,
    );
  });

  it('pages through more followers than one batch', async () => {
    for (
      let i = 0;
      i <
      1500;
      i++
    )
      h.follows.push(
        {
          userId: `u${String(i).padStart(5, '0')}`,
          gameId:
            GAME,
          createdAt:
            new Date(),
        },
      );
    expect(
      await fanOutGameUpdate(
        {
          kind: 'update',
          gameId:
            GAME,
          noteId:
            'n1',
        },
      ),
    ).toBe(
      1500,
    );
    expect(
      new Set(
        h.notifs.map(
          (
            n,
          ) =>
            n.userId,
        ),
      )
        .size,
    ).toBe(
      1500,
    );
  });
});

describe('editing and deleting a patch note', () => {
  it('lets an admin edit the text and leaves the version alone', async () => {
    h.session =
      {
        user: {
          id: 'admin',
          isAdmin: true,
        },
      };
    const res =
      await call(
        noteRoute,
        'PATCH',
        '/api/arcade/patch-notes/n1',
        {
          id: 'n1',
        },
        {
          title:
            'New title',
          body: 'New body',
          version:
            '9.9',
        },
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      h
        .notes[0],
    ).toMatchObject(
      {
        title:
          'New title',
        body: 'New body',
        version:
          '1.2',
      },
    );
    expect(
      h.audits,
    ).toEqual(
      [
        {
          adminId:
            'admin',
          action:
            'game_patch_note.edit',
          targetId:
            'n1',
        },
      ],
    );
  });

  it('lets an admin delete a note, and audits it', async () => {
    h.session =
      {
        user: {
          id: 'admin',
          isAdmin: true,
        },
      };
    expect(
      (
        await call(
          noteRoute,
          'DELETE',
          '/api/arcade/patch-notes/n1',
          {
            id: 'n1',
          },
        )
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      h.notes,
    ).toHaveLength(
      0,
    );
    expect(
      h
        .audits[0],
    ).toMatchObject(
      {
        action:
          'game_patch_note.delete',
        targetId:
          'n1',
      },
    );
    expect(
      (
        await call(
          noteRoute,
          'DELETE',
          '/api/arcade/patch-notes/n1',
          {
            id: 'n1',
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
  });

  it('refuses a member who is not an admin, and a signed-out caller', async () => {
    h.session =
      {
        user: {
          id: 'member',
          isAdmin: false,
        },
      };
    expect(
      (
        await call(
          noteRoute,
          'PATCH',
          '/api/arcade/patch-notes/n1',
          {
            id: 'n1',
          },
          {
            title:
              'x',
            body: 'y',
          },
        )
      )
        .status,
    ).toBe(
      403,
    );
    expect(
      (
        await call(
          noteRoute,
          'DELETE',
          '/api/arcade/patch-notes/n1',
          {
            id: 'n1',
          },
        )
      )
        .status,
    ).toBe(
      403,
    );
    h.session =
      null;
    expect(
      (
        await call(
          noteRoute,
          'DELETE',
          '/api/arcade/patch-notes/n1',
          {
            id: 'n1',
          },
        )
      )
        .status,
    ).toBe(
      401,
    );
    expect(
      h.notes,
    ).toHaveLength(
      1,
    );
    expect(
      h
        .notes[0]!
        .title,
    ).toBe(
      'Fire sale',
    );
    expect(
      h.audits,
    ).toHaveLength(
      0,
    );
  });
});

describe('publishing a guide', () => {
  it('queues the fan-out when a draft becomes public, once per change, and never for a draft or an unpublish', async () => {
    h.guides =
      [
        {
          id: 'g1',
          gameId:
            GAME,
          title:
            'Boss tips',
          published: false,
          authorId:
            'a',
        },
      ];
    await publishGuide(
      'a',
      'g1',
      true,
    );
    expect(
      h.sends,
    ).toHaveLength(
      1,
    );
    expect(
      h
        .sends[0],
    ).toMatchObject(
      [
        'games.update-fanout',
        {
          kind: 'guide',
          gameId:
            GAME,
          guideId:
            'g1',
        },
        {
          singletonKey:
            'guide:g1',
        },
      ],
    );
    await publishGuide(
      'a',
      'g1',
      true,
    ); // already public: not news again
    await publishGuide(
      'a',
      'g1',
      false,
    );
    expect(
      h.sends,
    ).toHaveLength(
      1,
    );
    await expect(
      publishGuide(
        'someone-else',
        'g1',
        true,
      ),
    ).rejects.toThrow();
    expect(
      h.sends,
    ).toHaveLength(
      1,
    );
  });
});
