/**
 * Quiet counts (sprint 04 #14) on the timeline: both surfaces return `null` counts for another viewer's post whose
 * author hides them, the author still gets their own numbers, and the For-You ranking still sees the real ones
 * (redaction is the last step). The Prisma double evaluates the `where` fragments the timeline builds, as in
 * timeline-audience.test.ts.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';

const store =
  vi.hoisted(
    () => ({
      posts:
        [] as Record<
          string,
          unknown
        >[],
      reposts:
        [] as Record<
          string,
          unknown
        >[],
      following:
        [] as string[],
      circleOwners:
        [] as string[],
      /** Authors whose "hide counts on my posts" switch is on. */
      hiding:
        new Set<string>(),
    }),
  );

const db =
  vi.hoisted(
    () => ({
      rMHark:
        {
          findMany:
            vi.fn(),
        },
      rMHarkRepost:
        {
          findMany:
            vi.fn(),
        },
      rMHarkReaction:
        {
          groupBy:
            vi.fn(
              async () => [],
            ),
          findMany:
            vi.fn(
              async () => [],
            ),
        },
      savedItem:
        {
          findMany:
            vi.fn(
              async () => [],
            ),
        },
      userProfile:
        {
          findUnique:
            vi.fn(
              async () => ({
                mutedWords:
                  [],
              }),
            ),
        },
      $queryRaw:
        vi.fn(
          async () => [],
        ),
    }),
  );

/** `findMany` over fixture rows: filter by `where`, order newest-first, `take`. */
function fakeFindMany(
  rows: () => Row[],
) {
  return async (args: {
    where?: Row;
    take?: number;
  }) => {
    const hits =
      rows().filter(
        (
          r,
        ) =>
          evalWhere(
            r,
            args.where,
          ),
      );
    const at =
      (
        r: Row,
      ) =>
        (
          r.createdAt as Date
        ).getTime();
    const id =
      (
        r: Row,
      ) =>
        r.id as string;
    hits.sort(
      (
        a,
        b,
      ) =>
        at(
          b,
        ) -
          at(
            a,
          ) ||
        (id(
          a,
        ) <
        id(
          b,
        )
          ? 1
          : id(
                a,
              ) >
              id(
                b,
              )
            ? -1
            : 0),
    );
    return hits.slice(
      0,
      args.take ??
        hits.length,
    );
  };
}

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      db,
  }),
);
vi.mock(
  '../../prisma.server',
  () => ({
    prisma:
      db,
  }),
);
vi.mock(
  '../../social/follow-graph.server',
  () => ({
    getFollowingIds:
      vi.fn(
        async () =>
          store.following,
      ),
  }),
);
vi.mock(
  '../../moderation.server',
  () => ({
    getHiddenAuthorIds:
      vi.fn(
        async () => [],
      ),
    getBlockedAuthorIds:
      vi.fn(
        async () => [],
      ),
  }),
);
vi.mock(
  '../signals.server',
  () => ({
    getSignals:
      vi.fn(
        async () => ({
          lessAuthors:
            [],
          mutedTags:
            [],
          followedTags:
            [],
        }),
      ),
  }),
);
vi.mock(
  '../personalize.server',
  () => ({
    buildInterestProfile:
      vi.fn(
        async () =>
          null,
      ),
  }),
);
vi.mock(
  '../../user-display.server',
  () => ({
    getUserDisplayMap:
      vi.fn(
        async (
          ids: string[],
        ) =>
          new Map(
            ids.map(
              (
                id,
              ) => [
                id,
                {
                  id,
                  name:
                    id,
                  image:
                    null,
                  username:
                    id,
                  handle:
                    id,
                  isVerified: false,
                  isAdmin: false,
                  ...(store.hiding.has(
                    id,
                  )
                    ? {
                        hideCounts:
                          true as const,
                      }
                    : {}),
                },
              ],
            ),
          ),
      ),
  }),
);
vi.mock(
  '../../blog',
  () => ({
    getAllPosts:
      vi.fn(
        async () => [],
      ),
  }),
);
vi.mock(
  '../audience.server',
  async () => {
    const actual =
      await vi.importActual<
        typeof import('../audience.server')
      >(
        '../audience.server',
      );
    return {
      ...actual,
      circleOwnerIds:
        vi.fn(
          async () =>
            store.circleOwners,
        ),
    };
  },
);

import { getTimeline } from '../timeline';
import { invalidateCachedPrefix } from '../../cached.server';
import {
  evalWhere,
  type Row,
} from './where-eval';

const NOW =
  Date.now();
let seq = 0;
function post(
  over: Row,
): Row {
  seq += 1;
  return {
    id: `p${String(seq).padStart(4, '0')}`,
    userId:
      'author',
    content: `post ${seq}`,
    createdAt:
      new Date(
        NOW -
          seq *
            1000,
      ),
    audience:
      'PUBLIC',
    deletedAt:
      null,
    communityId:
      null,
    threadRootId:
      null,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    imageUrls:
      [],
    imageAlts:
      [],
    original:
      null,
    poll: null,
    likes:
      [],
    reposts:
      [],
    unlocks:
      [],
    ...over,
  };
}

const VIEWER =
  'viewer';

beforeEach(
  () => {
    // The signed-in first page is cached per viewer; start every case cold.
    void invalidateCachedPrefix(
      '',
    );
    db.rMHark.findMany.mockImplementation(
      fakeFindMany(
        () =>
          store.posts,
      ),
    );
    db.rMHarkRepost.findMany.mockImplementation(
      fakeFindMany(
        () =>
          store.reposts,
      ),
    );
    seq = 0;
    store.posts =
      [];
    store.reposts =
      [];
    store.following =
      [
        'friend',
      ];
    store.circleOwners =
      [];
  },
);

const FRIEND =
  'friend';

beforeEach(
  () => {
    store.hiding =
      new Set([
        FRIEND,
      ]);
    store.posts =
      [
        post(
          {
            userId:
              FRIEND,
            content:
              'hidden author',
            likeCount: 11,
            commentCount: 12,
            repostCount: 13,
            viewCount: 14,
          },
        ),
      ];
  },
);

async function counts(
  surface:
    | 'foryou'
    | 'following',
  viewer:
    | string
    | null,
) {
  const page =
    await getTimeline(
      {
        userId:
          viewer,
        surface,
        filter:
          'all',
        cursor:
          null,
        limit: 50,
        search:
          null,
      },
    );
  const item =
    page.items.find(
      (
        i,
      ) =>
        i.content ===
        'hidden author',
    )!;
  return [
    item.likeCount,
    item.commentCount,
    item.repostCount,
    item.viewCount,
  ];
}

describe.each(
  [
    'foryou',
    'following',
  ] as const,
)(
  'timeline, %s surface',
  (
    surface,
  ) => {
    it('withholds the four counts of a hiding author from another viewer', async () => {
      expect(
        await counts(
          surface,
          VIEWER,
        ),
      ).toEqual(
        [
          null,
          null,
          null,
          null,
        ],
      );
    });

    it('shows the author their own counts', async () => {
      expect(
        await counts(
          surface,
          FRIEND,
        ),
      ).toEqual(
        [
          11,
          12,
          13,
          14,
        ],
      );
    });

    it('shows the counts again once the author switches it off', async () => {
      store.hiding =
        new Set();
      expect(
        await counts(
          surface,
          VIEWER,
        ),
      ).toEqual(
        [
          11,
          12,
          13,
          14,
        ],
      );
    });
  },
);

describe('timeline, signed out', () => {
  it('withholds the counts from the anonymous first page', async () => {
    expect(
      await counts(
        'foryou',
        null,
      ),
    ).toEqual(
      [
        null,
        null,
        null,
        null,
      ],
    );
  });
});

describe('For-You ranking', () => {
  it('still orders on the real numbers of a hiding author', async () => {
    store.posts =
      [
        post(
          {
            userId:
              'stranger',
            content:
              'quiet but newer',
          },
        ),
        post(
          {
            userId:
              FRIEND,
            content:
              'hidden author',
            likeCount: 5000,
            repostCount: 800,
          },
        ),
      ];
    const page =
      await getTimeline(
        {
          userId:
            VIEWER,
          surface:
            'foryou',
          filter:
            'all',
          cursor:
            null,
          limit: 50,
          search:
            null,
        },
      );
    const order =
      page.items
        .filter(
          (
            i,
          ) =>
            i.type ===
            'rmhark',
        )
        .map(
          (
            i,
          ) =>
            i.content,
        );
    expect(
      order[0],
    ).toBe(
      'hidden author',
    );
    expect(
      page.items.find(
        (
          i,
        ) =>
          i.content ===
          'hidden author',
      )!
        .likeCount,
    ).toBeNull();
  });
});
