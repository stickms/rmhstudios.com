/**
 * `GET /api/v1/search/posts` and `GET /api/v1/search/people` (s08-14), driven through the real developer-API wrapper
 * with the site's search functions and Prisma mocked: scope, the 3-unit cost, the site's operators passed through,
 * private communities and blocks both ways excluded, banned / deleted accounts left out, a stable cursor, and the
 * shared serialiser (quiet counts) applied.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  key: {
    current: null as Record<string, unknown> | null,
  },
  searchPosts: vi.fn(),
  searchPeople: vi.fn(),
  resolveCommunityId: vi.fn(),
  hidden: vi.fn(),
  blocked: vi.fn(),
  postFindMany: vi.fn(),
  userFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock('@/lib/search/posts.server', () => ({
  searchPostsScored: h.searchPosts,
  resolveCommunityId: h.resolveCommunityId,
}));
vi.mock('@/lib/search/people.server', () => ({
  searchPeopleScored: h.searchPeople,
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: h.hidden,
  getBlockedAuthorIds: h.blocked,
}));
vi.mock('@/lib/prisma.server', () => {
  const p = {
    developerApiKey: {
      findUnique: vi.fn(async () => h.key.current),
      update: vi.fn(async () => ({})),
    },
    apiKeyRefusalDaily: {
      upsert: vi.fn(async () => ({})),
    },
    apiIdempotencyKey: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    rMHark: {
      findMany: h.postFindMany,
    },
    user: {
      findMany: h.userFindMany,
      findFirst: h.userFindFirst,
    },
  };
  return {
    prisma: p,
    prismaRead: p,
  };
});
vi.mock('@/lib/entitlements', () => ({
  getUserTier: vi.fn(async () => 'starter'),
  hasApiAccess: () => true,
}));
vi.mock('@/lib/admin-audit.server', () => ({
  getActiveBan: vi.fn(async () => null),
}));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: vi.fn(async () => null),
  redisIncrBy: vi.fn(async () => null),
}));
vi.mock('@/lib/api/usage.server', () => ({
  recordUsage: h.recordUsage,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
  }),
}));

const load = async (path: string) =>
  handlersOf<TestHandler>(
    (
      (await import(/* @vite-ignore */ path)) as {
        Route: unknown;
      }
    ).Route,
  );
const posts = await load('../../../app/routes/api/v1/search/posts');
const people = await load('../../../app/routes/api/v1/search/people');

const ME = 'user_me';

function keyRecord(scopes: string[]) {
  return {
    id: 'key_1',
    userId: ME,
    revokedAt: null,
    expiresAt: null,
    scopes,
    testMode: false,
    allowedCidrs: [] as string[],
    rateLimitPerMinute: null,
  };
}

const author = (id: string, handle: string, over: Record<string, unknown> = {}) => ({
  id,
  name: handle,
  image: null,
  username: handle,
  handle,
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: {
    displayName: handle,
    customImage: null,
    hideCountsOnMine: false,
    bio: 'bio',
    location: null,
    website: null,
  },
  inventory: [],
  bannedUntil: null,
  banReason: null,
  deletionScheduledAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const row = (id: string, user: ReturnType<typeof author>) => ({
  id,
  content: `post ${id}`,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  likeCount: 7,
  commentCount: 1,
  repostCount: 0,
  viewCount: 9,
  imageUrls: [],
  imageAlts: [],
  gifUrl: null,
  gifAlt: null,
  isSensitive: false,
  contentWarning: null,
  pinnedCommentId: null,
  user,
});

const hit = (id: string, score: number, createdAt = '2026-11-01T10:00:00.000Z') => ({
  post: {
    id,
    createdAt,
  },
  score,
  reason: 'exact',
});

const get = (handler: TestHandler, qs: string) =>
  handler({
    request: new Request(`https://x.test/api/v1/search/x?${qs}`, {
      headers: {
        authorization: 'Bearer rmh_live_test-key-1',
      },
    }),
    params: {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.key.current = keyRecord(['read:search']);
  h.hidden.mockResolvedValue([]);
  h.blocked.mockResolvedValue([]);
  h.resolveCommunityId.mockResolvedValue('c1');
  h.userFindFirst.mockResolvedValue({
    id: 'ada_id',
  });
  h.searchPosts.mockResolvedValue([]);
  h.postFindMany.mockResolvedValue([]);
  h.searchPeople.mockResolvedValue([]);
  h.userFindMany.mockResolvedValue([]);
});

describe('scope and cost', () => {
  it('needs read:search', async () => {
    h.key.current = keyRecord(['read:feed']);
    expect((await get(posts.GET!, 'q=hello')).status).toBe(403);
    expect((await get(people.GET!, 'q=hello')).status).toBe(403);
    expect(h.searchPosts).not.toHaveBeenCalled();
  });

  it('counts 3 units a call on both endpoints', async () => {
    await get(posts.GET!, 'q=hello');
    await get(people.GET!, 'q=hello');
    expect(h.recordUsage).toHaveBeenNthCalledWith(1, 'key_1', 3, 200);
    expect(h.recordUsage).toHaveBeenNthCalledWith(2, 'key_1', 3, 200);
  });
});

describe('validation', () => {
  it.each([
    ['posts', 'q='],
    ['posts', `q=${'a'.repeat(201)}`],
    ['posts', 'q=x&limit=51'],
    ['posts', 'q=x&limit=0'],
    ['posts', 'q=x&cursor=not-a-cursor'],
    ['people', 'q='],
    ['people', `q=${'a'.repeat(101)}`],
    ['people', 'q=x&limit=26'],
  ])('%s %s is 400', async (which, qs) => {
    const res = await get(which === 'posts' ? posts.GET! : people.GET!, qs);
    expect(res.status).toBe(400);
  });
});

describe('posts', () => {
  it('passes the site operators through to the search', async () => {
    await get(posts.GET!, `q=${encodeURIComponent('from:@ada in:pixel-art has:media after:2026-01-01 jam')}`);
    expect(h.userFindFirst).toHaveBeenCalledWith({
      where: {
        handle: 'ada',
      },
      select: {
        id: true,
      },
    });
    expect(h.resolveCommunityId).toHaveBeenCalledWith('pixel-art');
    const [terms, opts] = h.searchPosts.mock.calls[0]!;
    expect(terms.q).toBe('jam');
    expect(opts).toMatchObject({
      authorId: 'ada_id',
      communityId: 'c1',
      hasMedia: true,
      after: '2026-01-01',
    });
  });

  it('an unknown author or community matches nothing instead of everything', async () => {
    h.userFindFirst.mockResolvedValue(null);
    await get(posts.GET!, `q=${encodeURIComponent('from:@nobody')}`);
    expect(h.searchPosts.mock.calls[0]![1]).toMatchObject({
      authorId: '__none__',
    });
  });

  it("hands the key owner's blocks and mutes to the search and drops hidden authors again after hydration", async () => {
    h.hidden.mockResolvedValue(['blocker']);
    h.searchPosts.mockResolvedValue([hit('p1', 0.9), hit('p2', 0.8)]);
    h.postFindMany.mockResolvedValue([row('p1', author('blocker', 'blocker')), row('p2', author('ada_id', 'ada'))]);
    const res = await get(posts.GET!, 'q=hello');
    expect(h.searchPosts.mock.calls[0]![1]).toMatchObject({
      hiddenAuthorIds: ['blocker'],
    });
    const body = (await res.json()) as {
      data: {
        id: string;
      }[];
    };
    expect(body.data.map((p) => p.id)).toEqual(['p2']);
  });

  it('re-checks public, free and not-private-community on the hydrating read', async () => {
    h.searchPosts.mockResolvedValue([hit('p1', 0.9)]);
    await get(posts.GET!, 'q=hello');
    expect(h.postFindMany.mock.calls[0]![0].where).toMatchObject({
      deletedAt: null,
      audience: 'PUBLIC',
      unlockPrice: null,
      OR: [
        {
          communityId: null,
        },
        {
          community: {
            isPrivate: false,
          },
        },
      ],
    });
  });

  it('leaves out posts by banned, deleted and deletion-scheduled authors', async () => {
    h.searchPosts.mockResolvedValue([hit('p1', 0.9), hit('p2', 0.8), hit('p3', 0.7), hit('p4', 0.6)]);
    h.postFindMany.mockResolvedValue([
      row(
        'p1',
        author('u1', 'a', {
          bannedUntil: new Date(Date.now() + 86_400_000),
        }),
      ),
      row(
        'p2',
        author('u2', 'b', {
          banReason: 'account_deleted',
        }),
      ),
      row(
        'p3',
        author('u3', 'c', {
          deletionScheduledAt: new Date(),
        }),
      ),
      row(
        'p4',
        author('u4', 'd', {
          bannedUntil: new Date(Date.now() - 86_400_000),
        }),
      ),
    ]);
    const body = (await (await get(posts.GET!, 'q=hello')).json()) as {
      data: {
        id: string;
      }[];
    };
    expect(body.data.map((p) => p.id)).toEqual(['p4']);
  });

  it('uses the shared serialiser: quiet counts are null for an author who hides them', async () => {
    h.searchPosts.mockResolvedValue([hit('p1', 0.9), hit('p2', 0.8)]);
    h.postFindMany.mockResolvedValue([
      row(
        'p1',
        author('u1', 'quiet', {
          profile: {
            displayName: 'q',
            customImage: null,
            hideCountsOnMine: true,
          },
        }),
      ),
      row('p2', author('u2', 'loud')),
    ]);
    const body = (await (await get(posts.GET!, 'q=hello')).json()) as {
      data: {
        id: string;
        metrics: {
          likes: number | null;
        };
      }[];
    };
    expect(body.data[0]!.metrics.likes).toBeNull();
    expect(body.data[1]!.metrics.likes).toBe(7);
    expect(Object.keys(body.data[0]!)).toEqual(
      expect.arrayContaining(['sensitive', 'contentWarning', 'gifAlt', 'imageAlts', 'author', 'metrics']),
    );
  });

  it('pages a ranked search with a stable cursor and no repeats', async () => {
    const pool = [hit('p5', 0.5), hit('p4', 0.6), hit('p3', 0.7), hit('p2', 0.7), hit('p1', 0.9)];
    h.searchPosts.mockResolvedValue(pool);
    h.postFindMany.mockImplementation(
      async ({
        where,
      }: {
        where: {
          id: {
            in: string[];
          };
        };
      }) => where.id.in.map((id) => row(id, author(`u_${id}`, `h${id}`))),
    );
    const first = (await (await get(posts.GET!, 'q=hello&limit=2')).json()) as {
      data: {
        id: string;
      }[];
      nextCursor: string | null;
    };
    expect(first.data.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(first.nextCursor).toBeTruthy();
    const second = (await (await get(posts.GET!, `q=hello&limit=2&cursor=${first.nextCursor}`)).json()) as {
      data: {
        id: string;
      }[];
      nextCursor: string | null;
    };
    expect(second.data.map((p) => p.id)).toEqual(['p2', 'p4']);
    const third = (await (await get(posts.GET!, `q=hello&limit=2&cursor=${second.nextCursor}`)).json()) as {
      data: {
        id: string;
      }[];
      nextCursor: string | null;
    };
    expect(third.data.map((p) => p.id)).toEqual(['p5']);
    expect(third.nextCursor).toBeNull();
  });

  it('operators alone page newest first by time', async () => {
    h.searchPosts.mockResolvedValue([
      hit('p3', 0.5, '2026-11-03T00:00:00.000Z'),
      hit('p2', 0.5, '2026-11-02T00:00:00.000Z'),
    ]);
    h.postFindMany.mockImplementation(
      async ({
        where,
      }: {
        where: {
          id: {
            in: string[];
          };
        };
      }) => where.id.in.map((id) => row(id, author(`u_${id}`, `h${id}`))),
    );
    const res = (await (await get(posts.GET!, `q=${encodeURIComponent('from:@ada has:media')}&limit=1`)).json()) as {
      data: {
        id: string;
      }[];
      nextCursor: string;
    };
    expect(h.searchPosts.mock.calls[0]![0].q).toBe('');
    expect(h.searchPosts.mock.calls[0]![1]).toMatchObject({
      limit: 2,
      hasMedia: true,
    });
    expect(res.data.map((p) => p.id)).toEqual(['p3']);
    await get(posts.GET!, `q=${encodeURIComponent('from:@ada has:media')}&limit=1&cursor=${res.nextCursor}`);
    expect(h.searchPosts.mock.calls[1]![1]).toMatchObject({
      before: '2026-11-03T00:00:00.000Z',
    });
  });

  it('never reaches the semantic path', async () => {
    await get(posts.GET!, 'q=hello&semantic=1');
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../v1/search.server.ts', import.meta.url), 'utf8'),
    );
    expect(src).not.toMatch(/embeddings|hybrid|nearest\(/);
    expect(src).toMatch(/lexicalOnly:\s*true/);
  });
});

describe('people', () => {
  const found = (id: string) => ({
    user: {
      id,
    },
    score: 1,
    reason: 'exact',
  });

  it('returns public profile fields only', async () => {
    h.searchPeople.mockResolvedValue([found('u1')]);
    h.userFindMany.mockResolvedValue([author('u1', 'ada')]);
    const body = (await (await get(people.GET!, 'q=ada')).json()) as {
      data: Record<string, unknown>[];
      nextCursor: null;
    };
    expect(Object.keys(body.data[0]!).sort()).toEqual([
      'bio',
      'createdAt',
      'handle',
      'id',
      'image',
      'location',
      'name',
      'website',
    ]);
    expect(body.nextCursor).toBeNull();
  });

  it('drops people blocked either way, banned, deleted and deletion-scheduled', async () => {
    h.blocked.mockResolvedValue(['u2']);
    h.searchPeople.mockResolvedValue(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map(found));
    h.userFindMany.mockResolvedValue([
      author('u1', 'ok'),
      author('u3', 'banned', {
        bannedUntil: new Date(Date.now() + 86_400_000),
      }),
      author('u4', 'gone', {
        banReason: 'account_deleted',
      }),
      author('u5', 'leaving', {
        deletionScheduledAt: new Date(),
      }),
      author('u6', 'expired', {
        bannedUntil: new Date(Date.now() - 1000),
      }),
    ]);
    const body = (await (await get(people.GET!, 'q=x&limit=5')).json()) as {
      data: {
        id: string;
      }[];
    };
    expect(body.data.map((p) => p.id)).toEqual(['u1', 'u6']);
    expect(h.userFindMany.mock.calls[0]![0].where.id.in).not.toContain('u2');
  });
});
