/**
 * The profile's posts tab with pins (sprint 05 #19): the first page leads with every pin in the member's order, later
 * pages repeat none of them, and a pin never shows a post the viewer could not otherwise see (followers-only, deleted or
 * moderated, expired, in a private community, or the whole profile of a blocked author). Prisma is an in-memory fake.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  evalWhere,
  type Row,
} from '@/lib/feed/__tests__/where-eval';

const h =
  vi.hoisted(
    () => ({
      viewer:
        'viewer' as
          | string
          | null,
      blocked:
        [] as string[],
      follows: false,
      posts:
        [] as Array<
          Record<
            string,
            unknown
          >
        >,
    }),
  );

vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          async () =>
            h.viewer
              ? {
                  user: {
                    id: h.viewer,
                  },
                  session:
                    {},
                }
              : null,
      },
    },
  }),
);
vi.mock(
  '@/lib/rate-limit.server',
  () => ({
    withRateLimitAsync:
      async () =>
        null,
  }),
);
vi.mock(
  '@/lib/moderation.server',
  () => ({
    getHiddenAuthorIds:
      async () =>
        h.blocked,
    getBlockedAuthorIds:
      async () =>
        h.blocked,
  }),
);
vi.mock(
  '@/lib/social/follow-graph.server',
  () => ({
    getFollowingIds:
      async () => [],
  }),
);
vi.mock(
  '@/lib/feed/map-feed-item.server',
  async (
    orig,
  ) => ({
    ...(await orig<
      typeof import('@/lib/feed/map-feed-item.server')
    >()),
    loadBoundedReactionSummaries:
      async () =>
        new Map(),
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => {
    const prisma =
      {
        user: {
          findUnique:
            async () =>
              null,
        },
        follow:
          {
            findUnique:
              async () =>
                h.follows
                  ? {
                      id: 'f',
                    }
                  : null,
          },
        closeFriend:
          {
            findMany:
              async () => [],
          },
        rMHarkRepost:
          {
            findMany:
              async () => [],
          },
        rMHark:
          {
            findMany:
              async ({
                where,
                orderBy,
                take,
              }: {
                where: Row;
                orderBy:
                  | Array<
                      Record<
                        string,
                        | 'asc'
                        | 'desc'
                      >
                    >
                  | Record<
                      string,
                      | 'asc'
                      | 'desc'
                    >;
                take: number;
              }) => {
                const keys =
                  Array.isArray(
                    orderBy,
                  )
                    ? orderBy
                    : [
                        orderBy,
                      ];
                const byPin =
                  'pinnedAt' in
                  keys[0]!;
                return (
                  h.posts as unknown as Row[]
                )
                  .filter(
                    (
                      p,
                    ) =>
                      evalWhere(
                        p,
                        where,
                      ),
                  )
                  .sort(
                    (
                      a,
                      b,
                    ) =>
                      byPin
                        ? (
                            a.pinnedAt as Date
                          ).getTime() -
                          (
                            b.pinnedAt as Date
                          ).getTime()
                        : (
                            b.createdAt as Date
                          ).getTime() -
                          (
                            a.createdAt as Date
                          ).getTime(),
                  )
                  .slice(
                    0,
                    take,
                  );
              },
          },
      };
    return {
      prisma,
      default:
        prisma,
    };
  },
);

import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { route as Route } from '@/lib/profile/api/profile.$id.rmharks.server';

const GET =
  handlersOf(
    Route,
  ).GET!;

interface Page {
  items: Array<{
    id: string;
    pinned?: boolean;
    pinnedOrder?: number;
  }>;
  nextCursor:
    | string
    | null;
}

async function load(
  cursor?: string,
  limit = 20,
): Promise<Page> {
  const url =
    new URL(
      'https://x.test/api/profile/author/rmharks',
    );
  url.searchParams.set(
    'limit',
    String(
      limit,
    ),
  );
  if (
    cursor
  )
    url.searchParams.set(
      'cursor',
      cursor,
    );
  const res =
    await GET(
      {
        request:
          new Request(
            url,
            {
              headers:
                {
                  'cf-connecting-ip':
                    String(
                      Math.random(),
                    ),
                  cookie:
                    'better-auth.session_token=t',
                },
            },
          ),
        params:
          {
            id: 'author',
          },
      },
    );
  return (await res.json()) as Page;
}

const user =
  {
    id: 'author',
    name: 'A',
    image:
      null,
    handle:
      'a',
    username:
      'a',
  };
let n = 0;
const post =
  (
    id: string,
    over: Record<
      string,
      unknown
    > = {},
  ) => ({
    id,
    userId:
      'author',
    content: `post ${id}`,
    createdAt:
      new Date(
        Date.UTC(
          2026,
          0,
          1,
          0,
          0,
          ++n,
        ),
      ),
    audience:
      'PUBLIC',
    deletedAt:
      null,
    expiresAt:
      null,
    pinnedAt:
      null,
    communityId:
      null,
    community:
      null,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    unlockPrice: 0,
    imageUrls:
      [],
    imageAlts:
      [],
    user,
    likes:
      [],
    reposts:
      [],
    unlocks:
      [],
    poll: null,
    original:
      null,
    ...over,
  });
const pin =
  (
    rank: number,
  ) =>
    new Date(
      Date.UTC(
        2026,
        5,
        1,
        0,
        rank,
      ),
    );

beforeEach(
  () => {
    n = 0;
    h.viewer =
      'viewer';
    h.blocked =
      [];
    h.follows = false;
    h.posts =
      [
        post(
          'old',
        ),
        post(
          'mid',
        ),
        post(
          'new',
        ),
        post(
          'p1',
          {
            pinnedAt:
              pin(
                3,
              ),
          },
        ),
        post(
          'p2',
          {
            pinnedAt:
              pin(
                1,
              ),
          },
        ),
        post(
          'p3',
          {
            pinnedAt:
              pin(
                2,
              ),
          },
        ),
      ];
  },
);

describe('GET /api/profile/:id/rmharks with pins', () => {
  it('leads with every pin in the member’s order, each numbered, then the timeline without them', async () => {
    const {
      items,
    } =
      await load();
    expect(
      items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'p2',
        'p3',
        'p1',
        'new',
        'mid',
        'old',
      ],
    );
    expect(
      items
        .slice(
          0,
          3,
        )
        .map(
          (
            i,
          ) => [
            i.pinned,
            i.pinnedOrder,
          ],
        ),
    ).toEqual(
      [
        [
          true,
          1,
        ],
        [
          true,
          2,
        ],
        [
          true,
          3,
        ],
      ],
    );
    expect(
      items
        .slice(
          3,
        )
        .every(
          (
            i,
          ) =>
            !i.pinned &&
            i.pinnedOrder ===
              undefined,
        ),
    ).toBe(
      true,
    );
  });

  it('later pages leave the pins out, so scrolling never repeats one', async () => {
    const first =
      await load(
        undefined,
        2,
      );
    expect(
      first.items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'p2',
        'p3',
        'p1',
        'new',
        'mid',
      ],
    );
    const second =
      await load(
        first.nextCursor!,
        2,
      );
    expect(
      second.items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'old',
      ],
    );
    const seen =
      [
        ...first.items,
        ...second.items,
      ].map(
        (
          i,
        ) =>
          i.id,
      );
    expect(
      new Set(
        seen,
      )
        .size,
    ).toBe(
      seen.length,
    );
  });

  it('a pinned post that is deleted, removed by moderation or expired does not show', async () => {
    h.posts.find(
      (
        p,
      ) =>
        p.id ===
        'p2',
    )!.deletedAt =
      new Date();
    h.posts.find(
      (
        p,
      ) =>
        p.id ===
        'p3',
    )!.expiresAt =
      new Date(
        Date.now() -
          60_000,
      );
    const {
      items,
    } =
      await load();
    expect(
      items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'p1',
        'new',
        'mid',
        'old',
      ],
    );
    expect(
      items[0],
    ).toMatchObject(
      {
        pinned: true,
        pinnedOrder: 1,
      },
    );
  });

  it('a followers-only pin shows to the author and to a follower, never to anyone else', async () => {
    h.posts.find(
      (
        p,
      ) =>
        p.id ===
        'p1',
    )!.audience =
      'FOLLOWERS';
    expect(
      (
        await load()
      ).items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'p2',
        'p3',
        'new',
        'mid',
        'old',
      ],
    );
    h.follows = true;
    expect(
      (
        await load()
      ).items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'p2',
        'p3',
        'p1',
        'new',
        'mid',
        'old',
      ],
    );
    h.follows = false;
    h.viewer =
      'author';
    expect(
      (
        await load()
      ).items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'p2',
        'p3',
        'p1',
        'new',
        'mid',
        'old',
      ],
    );
    h.viewer =
      null;
    expect(
      (
        await load()
      ).items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'p2',
        'p3',
        'new',
        'mid',
        'old',
      ],
    );
  });

  it('a pin in a private community the viewer has not joined does not show', async () => {
    h.posts.find(
      (
        p,
      ) =>
        p.id ===
        'p2',
    )!.community =
      {
        isPrivate: true,
      };
    h.posts.find(
      (
        p,
      ) =>
        p.id ===
        'p2',
    )!.communityId =
      'c';
    expect(
      (
        await load()
      ).items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'p3',
        'p1',
        'new',
        'mid',
        'old',
      ],
    );
  });

  it('a blocked author’s profile shows nothing, pins included', async () => {
    h.blocked =
      [
        'author',
      ];
    expect(
      (
        await load()
      )
        .items,
    ).toEqual(
      [],
    );
  });

  it('a locked paid pin keeps its body from a viewer who has not unlocked it', async () => {
    Object.assign(
      h.posts.find(
        (
          p,
        ) =>
          p.id ===
          'p2',
      )!,
      {
        unlockPrice: 50,
      },
    );
    const {
      items,
    } =
      await load();
    const locked =
      items.find(
        (
          i,
        ) =>
          i.id ===
          'p2',
      ) as unknown as {
        content: string;
        locked?: boolean;
      };
    expect(
      locked.locked,
    ).toBe(
      true,
    );
    expect(
      locked.content,
    ).toBe(
      '',
    );
  });
});
