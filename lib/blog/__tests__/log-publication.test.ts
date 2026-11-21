/**
 * Log drafts and scheduled publishing (s03-05): a draft is absent from every public reader, only admins reach the
 * editor's writes, the publish job publishes a Log once however often it runs, and the revision history is capped.
 * Prisma is stood in for; no database.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

interface Post {
  id: string;
  slug: string;
  status: string;
  publishAt: Date | null;
  publishedAt: Date | null;
  date: string;
  announcement: boolean;
  announcedAt: Date | null;
}
interface Revision {
  id: bigint;
  postId: string;
  authorId:
    | string
    | null;
  title: string;
  content: string;
  createdAt: Date;
}

const m =
  vi.hoisted(
    () => ({
      session:
        vi.fn(),
      posts:
        [] as unknown[],
      revisions:
        [] as unknown[],
      seenDeletes:
        [] as string[],
      locked: true,
      blogFindMany:
        vi.fn(),
      blogFindFirst:
        vi.fn(),
      blogFindUnique:
        vi.fn(),
      blogCount:
        vi.fn(),
      blogCreate:
        vi.fn(),
      blogUpdate:
        vi.fn(),
      userFindMany:
        vi.fn(),
      audit:
        vi.fn(),
      ping: vi.fn(),
      invalidate:
        vi.fn(),
      queryRaw:
        vi.fn(),
    }),
  );

function posts() {
  return m.posts as Post[];
}
function revisions() {
  return m.revisions as Revision[];
}

/** The in-memory client the publish job and the revision store run against. */
function tx() {
  return {
    $queryRaw:
      async () => [
        {
          locked:
            m.locked,
        },
      ],
    blogPost:
      {
        create:
          m.blogCreate,
        update:
          m.blogUpdate,
        findMany:
          async (a: {
            where: {
              status: string;
              publishAt: {
                lte: Date;
              };
            };
          }) =>
            posts()
              .filter(
                (
                  p,
                ) =>
                  p.status ===
                    a
                      .where
                      .status &&
                  p.publishAt !==
                    null &&
                  p.publishAt <=
                    a
                      .where
                      .publishAt
                      .lte,
              )
              .map(
                (
                  p,
                ) => ({
                  id: p.id,
                  slug: p.slug,
                  announcement:
                    p.announcement,
                }),
              ),
        updateMany:
          async (a: {
            where: {
              id: string;
              status?: string;
              publishAt?: {
                lte: Date;
              };
              date?: string;
            };
            data: Partial<Post>;
          }) => {
            const hit =
              posts().filter(
                (
                  p,
                ) =>
                  p.id ===
                    a
                      .where
                      .id &&
                  (a
                    .where
                    .status ===
                    undefined ||
                    p.status ===
                      a
                        .where
                        .status) &&
                  (a
                    .where
                    .publishAt ===
                    undefined ||
                    (p.publishAt !==
                      null &&
                      p.publishAt <=
                        a
                          .where
                          .publishAt
                          .lte)) &&
                  (a
                    .where
                    .date ===
                    undefined ||
                    p.date ===
                      a
                        .where
                        .date),
              );
            for (const p of hit)
              Object.assign(
                p,
                a.data,
              );
            return {
              count:
                hit.length,
            };
          },
      },
    blogAnnouncementSeen:
      {
        deleteMany:
          async (a: {
            where: {
              postId: string;
            };
          }) => {
            m.seenDeletes.push(
              a
                .where
                .postId,
            );
            return {
              count: 1,
            };
          },
      },
    blogPostRevision:
      {
        create:
          async (a: {
            data: Omit<
              Revision,
              | 'id'
              | 'createdAt'
            >;
          }) => {
            // ids keep rising even after pruning, as an autoincrement does
            const row =
              {
                ...a.data,
                id: nextRevisionId++,
                createdAt:
                  new Date(),
              };
            revisions().push(
              row,
            );
            return row;
          },
        findMany:
          async (a: {
            where: {
              postId: string;
            };
            skip?: number;
            take?: number;
            orderBy: {
              id: 'desc';
            };
          }) =>
            revisions()
              .filter(
                (
                  r,
                ) =>
                  r.postId ===
                  a
                    .where
                    .postId,
              )
              .sort(
                (
                  x,
                  y,
                ) =>
                  Number(
                    y.id -
                      x.id,
                  ),
              )
              .slice(
                a.skip ??
                  0,
                a.take ===
                  undefined
                  ? undefined
                  : (a.skip ??
                      0) +
                      a.take,
              ),
        deleteMany:
          async (a: {
            where: {
              id: {
                in: bigint[];
              };
            };
          }) => {
            const gone =
              new Set(
                a
                  .where
                  .id
                  .in,
              );
            m.revisions =
              revisions().filter(
                (
                  r,
                ) =>
                  !gone.has(
                    r.id,
                  ),
              );
            return {
              count:
                gone.size,
            };
          },
        findFirst:
          async (a: {
            where: {
              id: bigint;
              postId: string;
            };
          }) =>
            revisions().find(
              (
                r,
              ) =>
                r.id ===
                  a
                    .where
                    .id &&
                r.postId ===
                  a
                    .where
                    .postId,
            ) ??
            null,
      },
  };
}
let nextRevisionId =
  1n;

vi.mock(
  '@/lib/prisma.server',
  () => {
    const client =
      {
        $transaction:
          async (
            arg: unknown,
          ) =>
            typeof arg ===
            'function'
              ? (
                  arg as (
                    t: unknown,
                  ) => unknown
                )(
                  tx(),
                )
              : arg,
        blogPost:
          {
            findMany:
              m.blogFindMany,
            findFirst:
              m.blogFindFirst,
            findUnique:
              m.blogFindUnique,
            count:
              m.blogCount,
            create:
              m.blogCreate,
            update:
              m.blogUpdate,
          },
        blogPostRevision:
          {
            findMany:
              (
                a: unknown,
              ) =>
                (
                  tx()
                    .blogPostRevision
                    .findMany as (
                    a: unknown,
                  ) => unknown
                )(
                  a,
                ),
            findFirst:
              (
                a: unknown,
              ) =>
                (
                  tx()
                    .blogPostRevision
                    .findFirst as (
                    a: unknown,
                  ) => unknown
                )(
                  a,
                ),
          },
        user: {
          findMany:
            m.userFindMany,
        },
        // The sitemap's other sources: empty.
        newsArticle:
          {
            count:
              async () =>
                0,
            findMany:
              async () => [],
          },
        libraryDocument:
          {
            count:
              async () =>
                0,
            findMany:
              async () => [],
          },
        album:
          {
            count:
              async () =>
                0,
            findMany:
              async () => [],
          },
        gameGuide:
          {
            count:
              async () =>
                0,
            findMany:
              async () => [],
          },
        backfillCheckpoint:
          {
            findUnique:
              async () =>
                null,
            upsert:
              async () => ({}),
          },
      };
    return {
      prisma:
        client,
      prismaRead:
        {
          $queryRaw:
            m.queryRaw,
        },
    };
  },
);
vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          m.session,
      },
    },
  }),
);
vi.mock(
  '@/lib/admin-audit.server',
  () => ({
    logAdminAction:
      m.audit,
  }),
);
vi.mock(
  '@/lib/seo/indexnow.server',
  () => ({
    pingIndexNow:
      m.ping,
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
  '@/lib/cached.server',
  async (
    importOriginal,
  ) => ({
    ...(await importOriginal<
      typeof import('@/lib/cached.server')
    >()),
    cached:
      async (
        _k: string,
        _ttl: number,
        load: () => Promise<unknown>,
      ) =>
        load(),
    invalidateCached:
      m.invalidate,
    invalidateCachedPrefix:
      async () => {},
  }),
);
vi.mock(
  '@/lib/search/embeddings.server',
  () => ({
    isEmbeddingStoreReady:
      async () =>
        true,
    upsertEmbedding:
      async () =>
        'written',
  }),
);

import {
  publishedLogWhere,
  MAX_REVISIONS_PER_LOG,
} from '@/lib/blog/publication';
import {
  getRevision,
  listRevisions,
  publishDueLogs,
  saveRevision,
} from '@/lib/blog/publication.server';
import {
  getAllPosts,
  getPostBySlug,
  getPostSlugs,
} from '@/lib/blog';
import { SITEMAP_SECTIONS } from '@/lib/sitemap.server';
import { getCurrentAnnouncement } from '@/lib/sitewide-announcement.server';
import { indexBatch } from '@/lib/search/indexer.server';
import { findAnnouncementPost } from '@/lib/blog/blog-comments.server';
import { searchDocs } from '@/lib/search/docs.server';
import { fuzzyTerms } from '@/lib/search/db.server';
import { route as saveRoute } from '@/lib/admin/api/admin.blog.server';
import { route as revisionsRoute } from '@/lib/admin/api/admin.blog.$slug.revisions.server';
import { route as revisionRoute } from '@/lib/admin/api/admin.blog.$slug.revisions.$id.server';

const NOW =
  new Date(
    '2026-11-23T10:00:30.000Z',
  );

function post(
  over: Partial<Post> & {
    id: string;
  },
): Post {
  return {
    slug: `slug-${over.id}`,
    status:
      'scheduled',
    publishAt:
      new Date(
        '2026-11-23T10:00:00.000Z',
      ),
    publishedAt:
      null,
    date: '2026-11-23',
    announcement: false,
    announcedAt:
      null,
    ...over,
  };
}

/** What `where` a reader sent: it must be (a superset of) the one the helper builds. */
const live =
  () =>
    expect.objectContaining(
      publishedLogWhere(
        NOW,
      ),
    );

beforeEach(
  () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(
      NOW,
    );
    m.posts =
      [];
    m.revisions =
      [];
    m.seenDeletes =
      [];
    m.locked = true;
    nextRevisionId =
      1n;
    m.blogFindMany.mockResolvedValue(
      [],
    );
    m.blogFindFirst.mockResolvedValue(
      null,
    );
    m.blogFindUnique.mockResolvedValue(
      null,
    );
    m.blogCount.mockResolvedValue(
      0,
    );
    m.queryRaw.mockResolvedValue(
      [],
    );
    m.session.mockResolvedValue(
      {
        user: {
          id: 'admin',
          isAdmin: true,
        },
      },
    );
  },
);

describe('a draft is absent from every public reader', () => {
  it('the Log list and slugs read only live Logs', async () => {
    await getAllPosts(
      [
        'slug',
      ],
    );
    await getPostSlugs();
    for (const call of m
      .blogFindMany
      .mock
      .calls) {
      expect(
        (
          call[0] as {
            where: unknown;
          }
        )
          .where,
      ).toEqual(
        live(),
      );
    }
    expect(
      m.blogFindMany,
    ).toHaveBeenCalledTimes(
      2,
    );
  });

  it('the Log page: a non-admin never reaches a draft (the route turns the throw into a 404)', async () => {
    m.blogFindFirst.mockResolvedValue(
      null,
    ); // the draft is excluded by the where clause
    await expect(
      getPostBySlug(
        'a-draft',
        [
          'title',
        ],
      ),
    ).rejects.toThrow(
      'Post not found',
    );
    const where =
      (
        m
          .blogFindFirst
          .mock
          .calls[0]![0] as {
          where: unknown;
        }
      )
        .where;
    expect(
      where,
    ).toEqual(
      expect.objectContaining(
        {
          slug: 'a-draft',
          ...publishedLogWhere(
            NOW,
          ),
        },
      ),
    );
    expect(
      m.blogFindUnique,
    ).not.toHaveBeenCalled();
  });

  it('the Log page: an admin reads any state, and the state comes back for the banner', async () => {
    m.blogFindUnique.mockResolvedValue(
      {
        slug: 'a-draft',
        title:
          'T',
        status:
          'draft',
        publishAt:
          null,
        announcedAt:
          null,
        announcementExpiresAt:
          null,
      },
    );
    const got =
      await getPostBySlug(
        'a-draft',
        [
          'title',
          'status',
          'publishAt',
        ],
        {
          admin: true,
        },
      );
    expect(
      got,
    ).toEqual(
      {
        title:
          'T',
        status:
          'draft',
        publishAt:
          null,
      },
    );
    expect(
      m.blogFindUnique,
    ).toHaveBeenCalledWith(
      {
        where:
          {
            slug: 'a-draft',
          },
      },
    );
  });

  it('the sitemap counts and lists live Logs only', async () => {
    await SITEMAP_SECTIONS.content.count();
    await SITEMAP_SECTIONS.content.page(
      0,
      10,
    );
    expect(
      (
        m
          .blogCount
          .mock
          .calls[0]![0] as {
          where: unknown;
        }
      )
        .where,
    ).toEqual(
      live(),
    );
    expect(
      (
        m
          .blogFindMany
          .mock
          .calls[0]![0] as {
          where: unknown;
        }
      )
        .where,
    ).toEqual(
      live(),
    );
  });

  it('announcement pop-ups read live announcements only', async () => {
    await getCurrentAnnouncement();
    const where =
      (
        m
          .blogFindMany
          .mock
          .calls[0]![0] as {
          where: unknown;
        }
      )
        .where;
    expect(
      where,
    ).toEqual(
      expect.objectContaining(
        {
          announcement: true,
          ...publishedLogWhere(
            NOW,
          ),
        },
      ),
    );
  });

  it('an announcement discussion exists only under a live Log', async () => {
    await findAnnouncementPost(
      'a-slug',
    );
    const where =
      (
        m
          .blogFindFirst
          .mock
          .calls[0]![0] as {
          where: unknown;
        }
      )
        .where;
    expect(
      where,
    ).toEqual(
      expect.objectContaining(
        {
          slug: 'a-slug',
          announcement: true,
          ...publishedLogWhere(
            NOW,
          ),
        },
      ),
    );
  });

  it('the search indexer embeds live Logs only', async () => {
    await indexBatch(
      'blog',
    );
    const where =
      (
        m
          .blogFindMany
          .mock
          .calls[0]![0] as {
          where: unknown;
        }
      )
        .where;
    expect(
      where,
    ).toEqual(
      expect.objectContaining(
        publishedLogWhere(
          NOW,
        ),
      ),
    );
  });

  it('keyword search matches and re-checks live Logs only, in the table’s real column names', async () => {
    const queries: string[] =
      [];
    m.queryRaw.mockImplementation(
      async (sql: {
        sql?: string;
        strings?: string[];
      }) => {
        queries.push(
          String(
            sql.sql ??
              sql.strings?.join(
                '?',
              ) ??
              '',
          ),
        );
        return [];
      },
    );
    await searchDocs(
      'blog',
      fuzzyTerms(
        'devlog',
      ),
    );
    expect(
      queries[0],
    ).toContain(
      `FROM "blog_post"`,
    );
    expect(
      queries[0],
    ).toContain(
      `status = 'published' AND "publishedAt" <= now()`,
    );
  });
});

describe('the editor’s save', () => {
  const save =
    handlersOf(
      saveRoute,
    ).POST!;
  const body =
    (
      over: Record<
        string,
        unknown
      > = {},
    ) => ({
      title:
        'A Log',
      slug: 'a-log',
      description:
        'About it',
      date: '2026-11-23',
      content:
        'one two three',
      ...over,
    });
  const call =
    (
      b: unknown,
    ) =>
      save(
        {
          request:
            new Request(
              'https://rmhstudios.com/api/admin/blog',
              {
                method:
                  'POST',
                headers:
                  {
                    cookie:
                      'better-auth.session_token=abc',
                    'content-type':
                      'application/json',
                  },
                body: JSON.stringify(
                  b,
                ),
              },
            ),
          params:
            {},
        },
      );

  beforeEach(
    () => {
      m.blogCreate.mockImplementation(
        async () => ({
          id: 'new-id',
        }),
      );
      m.blogUpdate.mockResolvedValue(
        {},
      );
    },
  );

  it('only an admin can write', async () => {
    m.session.mockResolvedValue(
      {
        user: {
          id: 'member',
          isAdmin: false,
        },
      },
    );
    expect(
      (
        await call(
          body(
            {
              status:
                'draft',
            },
          ),
        )
      )
        .status,
    ).toBe(
      403,
    );
    expect(
      m.blogCreate,
    ).not.toHaveBeenCalled();
  });

  it('saves a draft: no publication date, no index ping, and a first revision', async () => {
    const res =
      await call(
        body(
          {
            status:
              'draft',
          },
        ),
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      await res.json(),
    ).toMatchObject(
      {
        success: true,
        status:
          'draft',
      },
    );
    const data =
      (
        m
          .blogCreate
          .mock
          .calls[0]![0] as {
          data: Record<
            string,
            unknown
          >;
        }
      )
        .data;
    expect(
      data,
    ).toMatchObject(
      {
        status:
          'draft',
        publishAt:
          null,
        publishedAt:
          null,
        updatedById:
          'admin',
      },
    );
    expect(
      m.ping,
    ).not.toHaveBeenCalled();
    expect(
      revisions(),
    ).toHaveLength(
      1,
    );
    expect(
      revisions()[0],
    ).toMatchObject(
      {
        postId:
          'new-id',
        authorId:
          'admin',
        content:
          'one two three',
      },
    );
  });

  it('refuses a schedule under 5 minutes ahead, a missing time, and scheduling a live Log', async () => {
    const soon =
      new Date(
        NOW.getTime() +
          60_000,
      ).toISOString();
    expect(
      (
        await call(
          body(
            {
              status:
                'scheduled',
              publishAt:
                soon,
            },
          ),
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      (
        await call(
          body(
            {
              status:
                'scheduled',
            },
          ),
        )
      )
        .status,
    ).toBe(
      400,
    );
    m.blogFindUnique.mockResolvedValue(
      {
        id: 'p1',
        announcement: false,
        announcedAt:
          null,
        status:
          'published',
        publishedAt:
          new Date(
            '2026-01-01T00:00:00Z',
          ),
        title:
          'A Log',
        description:
          'About it',
        tags: [],
        content:
          'one two three',
      },
    );
    const later =
      new Date(
        NOW.getTime() +
          3_600_000,
      ).toISOString();
    expect(
      (
        await call(
          body(
            {
              status:
                'scheduled',
              publishAt:
                later,
              isEdit: true,
            },
          ),
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      m.blogCreate,
    ).not.toHaveBeenCalled();
    expect(
      m.blogUpdate,
    ).not.toHaveBeenCalled();
  });

  it('schedules a Log: stored as scheduled with its time, not yet published or pinged', async () => {
    const later =
      new Date(
        NOW.getTime() +
          3_600_000,
      ).toISOString();
    const res =
      await call(
        body(
          {
            status:
              'scheduled',
            publishAt:
              later,
          },
        ),
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    const data =
      (
        m
          .blogCreate
          .mock
          .calls[0]![0] as {
          data: Record<
            string,
            unknown
          >;
        }
      )
        .data;
    expect(
      data,
    ).toMatchObject(
      {
        status:
          'scheduled',
        publishAt:
          new Date(
            later,
          ),
        publishedAt:
          null,
      },
    );
    expect(
      m.ping,
    ).not.toHaveBeenCalled();
  });

  it('publishing stamps the publication date, fills an empty date, and pings the index', async () => {
    const res =
      await call(
        body(
          {
            status:
              'published',
            date: '',
          },
        ),
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    const data =
      (
        m
          .blogCreate
          .mock
          .calls[0]![0] as {
          data: Record<
            string,
            unknown
          >;
        }
      )
        .data;
    expect(
      data,
    ).toMatchObject(
      {
        status:
          'published',
        publishedAt:
          NOW,
        date: '2026-11-23',
      },
    );
    expect(
      m.ping,
    ).toHaveBeenCalledWith(
      [
        '/blog/a-log',
      ],
    );
  });

  it('an announcement goes live, and shows to everyone again, when the Log is published, not when it was saved', async () => {
    const savedAt =
      new Date(
        '2026-11-01T00:00:00Z',
      );
    m.blogFindUnique.mockResolvedValue(
      {
        id: 'p1',
        announcement: true,
        announcedAt:
          savedAt,
        status:
          'draft',
        publishedAt:
          null,
        title:
          'A Log',
        description:
          'About it',
        tags: [],
        content:
          'one two three',
      },
    );
    const res =
      await call(
        body(
          {
            status:
              'published',
            isEdit: true,
            announcement: true,
          },
        ),
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    const data =
      (
        m
          .blogUpdate
          .mock
          .calls[0]![0] as {
          data: Record<
            string,
            unknown
          >;
        }
      )
        .data;
    expect(
      data,
    ).toMatchObject(
      {
        status:
          'published',
        publishedAt:
          NOW,
        announcedAt:
          NOW,
      },
    );
    expect(
      m.seenDeletes,
    ).toEqual(
      [
        'p1',
      ],
    );
  });

  it('an edit that changes no text keeps no new revision; one that changes the text keeps one', async () => {
    m.blogFindUnique.mockResolvedValue(
      {
        id: 'p1',
        announcement: false,
        announcedAt:
          null,
        status:
          'draft',
        publishedAt:
          null,
        title:
          'A Log',
        description:
          'About it',
        tags: [],
        content:
          'one two three',
      },
    );
    await call(
      body(
        {
          status:
            'draft',
          isEdit: true,
        },
      ),
    );
    expect(
      revisions(),
    ).toHaveLength(
      0,
    );
    await call(
      body(
        {
          status:
            'draft',
          isEdit: true,
          content:
            'one two three four',
        },
      ),
    );
    expect(
      revisions(),
    ).toHaveLength(
      1,
    );
    expect(
      revisions()[0],
    ).toMatchObject(
      {
        postId:
          'p1',
        content:
          'one two three four',
      },
    );
  });
});

describe('publishDueLogs', () => {
  it('publishes a due Log once when the job runs twice, stamping publication and announcement at that moment', async () => {
    posts().push(
      post(
        {
          id: 'a',
          announcement: true,
          date: '',
        },
      ),
    );
    const first =
      await publishDueLogs(
        NOW,
      );
    const second =
      await publishDueLogs(
        new Date(
          NOW.getTime() +
            60_000,
        ),
      );
    expect(
      first,
    ).toEqual(
      [
        'slug-a',
      ],
    );
    expect(
      second,
    ).toEqual(
      [],
    );
    expect(
      posts()[0],
    ).toMatchObject(
      {
        status:
          'published',
        publishAt:
          null,
        publishedAt:
          NOW,
        announcedAt:
          NOW,
        date: '2026-11-23',
      },
    );
    expect(
      m.seenDeletes,
    ).toEqual(
      [
        'a',
      ],
    );
    // The announcement pop-up, the sidebar list and the RSS feed are dropped the moment a Log goes live.
    expect(
      m.invalidate,
    ).toHaveBeenCalledWith(
      'sidebar:blogPosts',
    );
    expect(
      m.invalidate,
    ).toHaveBeenCalledWith(
      'blog:rss',
    );
    expect(
      m.ping,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      m.ping,
    ).toHaveBeenCalledWith(
      [
        '/blog/slug-a',
      ],
    );
  });

  it('leaves a Log that is not due, a draft, and a live Log alone', async () => {
    posts().push(
      post(
        {
          id: 'later',
          publishAt:
            new Date(
              NOW.getTime() +
                60_000,
            ),
        },
      ),
      post(
        {
          id: 'draft',
          status:
            'draft',
          publishAt:
            null,
        },
      ),
      post(
        {
          id: 'live',
          status:
            'published',
          publishAt:
            null,
          publishedAt:
            new Date(
              '2026-01-01T00:00:00Z',
            ),
        },
      ),
    );
    expect(
      await publishDueLogs(
        NOW,
      ),
    ).toEqual(
      [],
    );
    expect(
      posts().map(
        (
          p,
        ) =>
          p.status,
      ),
    ).toEqual(
      [
        'scheduled',
        'draft',
        'published',
      ],
    );
    expect(
      m.invalidate,
    ).not.toHaveBeenCalled();
  });

  it('does nothing when another worker holds the lock', async () => {
    m.locked = false;
    posts().push(
      post(
        {
          id: 'a',
        },
      ),
    );
    expect(
      await publishDueLogs(
        NOW,
      ),
    ).toEqual(
      [],
    );
    expect(
      posts()[0]!
        .status,
    ).toBe(
      'scheduled',
    );
  });

  it('does not count a Log another worker claimed between the read and the write', async () => {
    const racing =
      post(
        {
          id: 'a',
        },
      );
    posts().push(
      racing,
    );
    const realTx =
      tx();
    const original =
      realTx
        .blogPost
        .findMany;
    // The row is read as due, then published by someone else before this run claims it.
    realTx.blogPost.findMany =
      async (
        a,
      ) => {
        const rows =
          await original(
            a,
          );
        Object.assign(
          racing,
          {
            status:
              'published',
            publishAt:
              null,
            publishedAt:
              NOW,
          },
        );
        return rows;
      };
    const {
      prisma,
    } =
      await import('@/lib/prisma.server');
    vi.spyOn(
      prisma,
      '$transaction',
    ).mockImplementationOnce(
      (async (
        fn: (
          t: unknown,
        ) => unknown,
      ) =>
        fn(
          realTx,
        )) as never,
    );
    expect(
      await publishDueLogs(
        NOW,
      ),
    ).toEqual(
      [],
    );
  });

  it('reads Logs by the real table’s status and publication columns (migration names)', () => {
    // publishedLogWhere is the Prisma spelling of: "status" = 'published' AND "publishedAt" <= now()
    expect(
      publishedLogWhere(
        NOW,
      ),
    ).toEqual(
      {
        status:
          'published',
        publishedAt:
          {
            lte: NOW,
          },
      },
    );
  });
});

describe('revisions', () => {
  const input =
    (
      n: number,
    ) => ({
      postId:
        'p1',
      authorId:
        'admin',
      title: `T${n}`,
      description:
        'D',
      tags: [],
      content:
        `${'word '.repeat(n)}`.trim(),
    });

  it('keeps at most 50 per Log, pruning the oldest', async () => {
    for (
      let i = 1;
      i <=
      55;
      i++
    )
      await saveRevision(
        tx() as never,
        input(
          i,
        ),
      );
    const kept =
      revisions().filter(
        (
          r,
        ) =>
          r.postId ===
          'p1',
      );
    expect(
      kept,
    ).toHaveLength(
      MAX_REVISIONS_PER_LOG,
    );
    expect(
      kept.map(
        (
          r,
        ) =>
          r.title,
      ),
    ).not.toContain(
      'T5',
    );
    expect(
      kept.map(
        (
          r,
        ) =>
          r.title,
      ),
    ).toContain(
      'T6',
    );
    expect(
      kept.map(
        (
          r,
        ) =>
          r.title,
      ),
    ).toContain(
      'T55',
    );
  });

  it('one Log’s history never prunes another’s', async () => {
    for (
      let i = 1;
      i <=
      52;
      i++
    )
      await saveRevision(
        tx() as never,
        input(
          i,
        ),
      );
    await saveRevision(
      tx() as never,
      {
        ...input(
          1,
        ),
        postId:
          'other',
      },
    );
    expect(
      revisions().filter(
        (
          r,
        ) =>
          r.postId ===
          'other',
      ),
    ).toHaveLength(
      1,
    );
    expect(
      revisions().filter(
        (
          r,
        ) =>
          r.postId ===
          'p1',
      ),
    ).toHaveLength(
      MAX_REVISIONS_PER_LOG,
    );
  });

  it('lists newest first with the word change against the version before, and the author’s name', async () => {
    m.blogFindUnique.mockResolvedValue(
      {
        id: 'p1',
      },
    );
    m.userFindMany.mockResolvedValue(
      [
        {
          id: 'admin',
          name: 'Ada',
        },
      ],
    );
    await saveRevision(
      tx() as never,
      input(
        3,
      ),
    );
    await saveRevision(
      tx() as never,
      input(
        10,
      ),
    );
    await saveRevision(
      tx() as never,
      {
        ...input(
          4,
        ),
        authorId:
          null,
      },
    );
    const list =
      await listRevisions(
        'a-slug',
      );
    expect(
      list?.map(
        (
          r,
        ) => [
          r.title,
          r.wordDelta,
          r.authorName,
        ],
      ),
    ).toEqual(
      [
        [
          'T4',
          -6,
          null,
        ],
        [
          'T10',
          7,
          'Ada',
        ],
        [
          'T3',
          3,
          'Ada',
        ],
      ],
    );
  });

  it('a revision is readable only through its own Log', async () => {
    m.blogFindUnique.mockResolvedValue(
      {
        id: 'p1',
      },
    );
    await saveRevision(
      tx() as never,
      input(
        3,
      ),
    );
    expect(
      await getRevision(
        'a-slug',
        1n,
      ),
    ).toMatchObject(
      {
        id: '1',
        title:
          'T3',
        content:
          'word word word',
      },
    );
    m.blogFindUnique.mockResolvedValue(
      {
        id: 'someone-else',
      },
    );
    expect(
      await getRevision(
        'a-slug',
        1n,
      ),
    ).toBeNull();
    m.blogFindUnique.mockResolvedValue(
      null,
    );
    expect(
      await listRevisions(
        'missing',
      ),
    ).toBeNull();
  });

  it('the history endpoints are admin-only and answer 404 for an unknown Log or a malformed id', async () => {
    const list =
      handlersOf(
        revisionsRoute,
      ).GET!;
    const one =
      handlersOf(
        revisionRoute,
      ).GET!;
    const req =
      () =>
        new Request(
          'https://rmhstudios.com/api/admin/blog/a-slug/revisions',
          {
            headers:
              {
                cookie:
                  'better-auth.session_token=abc',
              },
          },
        );
    m.session.mockResolvedValue(
      {
        user: {
          id: 'member',
          isAdmin: false,
        },
      },
    );
    expect(
      (
        await list(
          {
            request:
              req(),
            params:
              {
                slug: 'a-slug',
              },
          },
        )
      )
        .status,
    ).toBe(
      403,
    );
    expect(
      (
        await one(
          {
            request:
              req(),
            params:
              {
                slug: 'a-slug',
                id: '1',
              },
          },
        )
      )
        .status,
    ).toBe(
      403,
    );
    m.session.mockResolvedValue(
      {
        user: {
          id: 'admin',
          isAdmin: true,
        },
      },
    );
    expect(
      (
        await list(
          {
            request:
              req(),
            params:
              {
                slug: 'missing',
              },
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
    expect(
      (
        await one(
          {
            request:
              req(),
            params:
              {
                slug: 'a-slug',
                id: 'x1',
              },
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
    expect(
      (
        await one(
          {
            request:
              req(),
            params:
              {
                slug: 'a-slug',
                id: '99999999999999999999',
              },
          },
        )
      )
        .status,
    ).toBe(
      404,
    );
  });
});
