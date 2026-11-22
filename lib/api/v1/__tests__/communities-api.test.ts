/**
 * `/api/v1/communities*`, `/api/v1/me/communities` and `POST /api/v1/posts` with a `communityId`, driven through the
 * real developer-API wrapper, the real `prepareCommunityPost` and the real v1 adapters. The site's community reads
 * (`getCommunity`, `getCommunityFeed`) and the gate's outcome are stand-ins here (their own suites test them), so what
 * this file holds is the wiring: scopes, the 404 for a private community, membership, the gate's outcomes mapped to
 * 202 / 422 / the gate's status and code, what is written, and that a request without `communityId` is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { denyCode } from '@/lib/communities/bans';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

type Gate =
  | {
      kind: 'allow';
      flag?: {
        ruleName: string;
      };
    }
  | {
      kind: 'deny';
      status: 400 | 403 | 404;
      code: string;
      error: string;
      endsAt?: string | null;
    }
  | {
      kind: 'hold';
      ruleName: string;
    }
  | {
      kind: 'remove';
      ruleName: string;
    };

const h = vi.hoisted(() => ({
  scopes: [] as string[],
  members: [] as {
    communityId: string;
    userId: string;
    role: string;
    joinedAt: Date;
    id: string;
  }[],
  communities: [] as {
    id: string;
    slug: string;
    isPrivate: boolean;
  }[],
  posts: [] as {
    id: string;
    communityId: string;
    deletedAt: Date | null;
    likeCount?: number | null;
  }[],
  gate: {
    kind: 'allow',
  } as Gate,
  sanction: null as null | {
    kind: 'ban' | 'timeout';
    endsAt: Date | null;
  },
  gateCalls: [] as unknown[],
  created: [] as Record<string, unknown>[],
  flairRows: [] as Record<string, unknown>[],
  userUpdates: 0,
  communityUpdates: 0,
  modItems: [] as Record<string, unknown>[],
  removedLogs: [] as Record<string, unknown>[],
  feedCalls: [] as unknown[],
  createPost: vi.fn(),
}));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'owner_1',
    tier: 'starter',
    keyId: 'key_1',
    scopes: h.scopes,
    testMode: false,
    allowedCidrs: [],
    rateLimitPerMinute: null,
  }),
  touchApiKeyLastUsed: () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: async () => null,
  redisIncrBy: async () => null,
}));
vi.mock('@/lib/api/usage.server', () => ({
  recordUsage: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
  }),
}));

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    rMHark: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `post_${h.created.length + 1}`,
          createdAt: new Date('2026-11-20T10:00:00Z'),
          ...data,
        };
        h.created.push(row);
        return row;
      }),
      update: vi.fn(async () => ({})),
    },
    user: {
      update: vi.fn(async () => {
        h.userUpdates += 1;
        return {};
      }),
    },
    community: {
      update: vi.fn(async () => {
        h.communityUpdates += 1;
        return {};
      }),
    },
    communityPostFlair: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        h.flairRows.push(data);
        return data;
      }),
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      communityMember: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              communityId_userId: {
                communityId: string;
                userId: string;
              };
            };
          }) =>
            h.members.find(
              (m) =>
                m.communityId === where.communityId_userId.communityId && m.userId === where.communityId_userId.userId,
            ) ?? null,
        ),
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: string;
            };
          }) =>
            h.members
              .filter((m) => m.userId === where.userId)
              .map((m) => ({
                id: m.id,
                role: m.role,
                joinedAt: m.joinedAt,
                community: {
                  id: m.communityId,
                  slug: h.communities.find((c) => c.id === m.communityId)?.slug ?? 'x',
                  name: 'Retro Gamers',
                  icon: null,
                  isPrivate: false,
                  memberCount: 3,
                },
              })),
        ),
      },
    },
  };
});

vi.mock('@/lib/communities/bans.server', () => ({
  activeSanction: async () => h.sanction,
}));
vi.mock('@/lib/communities/gate.server', () => ({
  gateCommunityContent: async (a: unknown) => {
    h.gateCalls.push(a);
    return h.gate;
  },
  logRemoved: async (a: Record<string, unknown>) => {
    h.removedLogs.push(a);
  },
}));
vi.mock('@/lib/communities/challenge.server', () => ({
  challengeEntryError: async () => null,
}));
vi.mock('@/lib/communities/automod.server', () => ({
  HELD_BY: 'automod_hold',
  recordModItem: async (a: Record<string, unknown>) => {
    h.modItems.push(a);
  },
}));
vi.mock('@/lib/communities/post-alerts.server', () => ({
  enqueuePostAlert: vi.fn(async () => undefined),
}));
vi.mock('@/lib/tags-extract.server', () => ({
  linkPostHashtags: vi.fn(async () => undefined),
}));
vi.mock('@/lib/social/engagement-effects.server', () => ({
  enqueueProgression: vi.fn(async () => undefined),
}));
vi.mock('@/lib/social/engagement.server', () => ({
  createPost: h.createPost,
}));
vi.mock('@/lib/feed/profile-pins.server', () => ({
  pinnedOrderFor: async () => new Map(),
}));
vi.mock('@/lib/communities/flairs.server', () => ({
  listFlairs: async () => [
    {
      id: 'flair_1',
      name: 'Discussion',
      color: 'accent',
    },
  ],
}));
vi.mock('@/lib/communities/settings.server', () => ({
  getCommunitySettings: async () => ({
    verification: {
      level: 'none',
      value: 0,
    },
    flairRequired: false,
    starThreshold: 5,
    requireImageAlt: true,
  }),
}));
vi.mock('@/lib/communities/rules.server', () => ({
  listRules: async () => [
    {
      id: 'rule_1',
      position: 1,
      title: 'Be kind',
      description: null,
    },
  ],
}));
vi.mock('@/lib/communities/detail.server', () => ({
  getCommunity: async (slug: string, viewerId: string | null) => {
    const c = h.communities.find((x) => x.slug === slug);
    if (!c) return null;
    const member = h.members.find((m) => m.communityId === c.id && m.userId === viewerId);
    const base = {
      id: c.id,
      slug,
      name: 'Retro Gamers',
      description: 'Old games',
      icon: null,
      color: null,
      isPrivate: c.isPrivate,
      memberCount: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    // The site's own rule: a private community's non-member gets the locked preview, never the content.
    if (c.isPrivate && !member)
      return {
        ...base,
        locked: true,
        joined: false,
        role: null,
      };
    return {
      ...base,
      locked: false,
      joined: !!member,
      role: member?.role ?? null,
    };
  },
  getCommunityFeed: async (slug: string, viewerId: string | null, opts: unknown) => {
    h.feedCalls.push({
      slug,
      viewerId,
      opts,
    });
    const c = h.communities.find((x) => x.slug === slug);
    if (!c) return null;
    if (c.isPrivate && !h.members.some((m) => m.communityId === c.id && m.userId === viewerId)) return null;
    // Held (AutoMod) and removed posts are soft-deleted: the site's feed query never returns them.
    const items = h.posts
      .filter((p) => p.communityId === c.id && !p.deletedAt)
      .map((p) => ({
        id: p.id,
        type: 'rmhark',
        createdAt: '2026-11-20T10:00:00.000Z',
        content: `text of ${p.id}`,
        user: {
          id: 'author_1',
          name: 'Ada',
          handle: 'ada',
          image: null,
          hideCounts: p.likeCount === null,
        },
        likeCount: p.likeCount === undefined ? 3 : p.likeCount,
        commentCount: p.likeCount === null ? null : 1,
        repostCount: p.likeCount === null ? null : 0,
        viewCount: p.likeCount === null ? null : 9,
      }));
    return {
      items,
      nextCursor: null,
      hasMore: false,
    };
  },
}));

const routes = {
  mine: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/communities')).Route),
  one: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/communities/$slug')).Route),
  rules: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/communities/$slug/rules')).Route),
  posts: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/communities/$slug/posts')).Route),
  create: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/posts')).Route),
};

const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;

const get = (handler: TestHandler, path: string, params: Record<string, string> = {}) =>
  handler({
    request: new Request(`https://x.test${path}`, {
      headers: {
        authorization: BEARER,
      },
    }),
    params,
  });
const post = (body: unknown, extra: Record<string, string> = {}) =>
  routes.create.POST!({
    request: new Request('https://x.test/api/v1/posts', {
      method: 'POST',
      headers: {
        authorization: BEARER,
        'content-type': 'application/json',
        ...extra,
      },
      body: JSON.stringify(body),
    }),
    params: {},
  });

beforeEach(() => {
  h.scopes = ['read:communities', 'write:communities', 'write:posts'];
  h.communities = [
    {
      id: 'c_open',
      slug: 'retro-gamers',
      isPrivate: false,
    },
    {
      id: 'c_secret',
      slug: 'secret-club',
      isPrivate: true,
    },
  ];
  h.members = [
    {
      id: 'm1',
      communityId: 'c_open',
      userId: 'owner_1',
      role: 'MEMBER',
      joinedAt: new Date('2026-10-01'),
    },
  ];
  h.posts = [
    {
      id: 'p_visible',
      communityId: 'c_open',
      deletedAt: null,
    },
    {
      id: 'p_held',
      communityId: 'c_open',
      deletedAt: new Date(),
    },
  ];
  h.gate = {
    kind: 'allow',
  };
  h.sanction = null;
  for (const k of ['gateCalls', 'created', 'flairRows', 'modItems', 'removedLogs', 'feedCalls'] as const)
    h[k].length = 0;
  h.userUpdates = 0;
  h.communityUpdates = 0;
  h.createPost.mockReset();
  h.createPost.mockResolvedValue({
    ok: true,
    post: {
      id: 'plain_1',
      content: 'hi',
      audience: 'PUBLIC',
      createdAt: new Date('2026-11-20T10:00:00Z'),
    },
  });
});

describe('scopes', () => {
  it.each([
    ['me/communities', () => get(routes.mine.GET!, '/api/v1/me/communities')],
    [
      'communities/$slug',
      () =>
        get(routes.one.GET!, '/api/v1/communities/retro-gamers', {
          slug: 'retro-gamers',
        }),
    ],
    [
      'rules',
      () =>
        get(routes.rules.GET!, '/api/v1/communities/retro-gamers/rules', {
          slug: 'retro-gamers',
        }),
    ],
    [
      'posts',
      () =>
        get(routes.posts.GET!, '/api/v1/communities/retro-gamers/posts', {
          slug: 'retro-gamers',
        }),
    ],
  ])('%s needs read:communities', async (_n, call) => {
    h.scopes = ['read:posts', 'write:communities'];
    const res = await call();
    expect(res.status).toBe(403);
    expect(
      (
        (await res.json()) as {
          error: {
            code: string;
          };
        }
      ).error.code,
    ).toBe('insufficient_scope');
    expect(h.feedCalls).toHaveLength(0);
  });

  it('a read:* key reads', async () => {
    h.scopes = ['read:*'];
    expect(
      (
        await get(routes.one.GET!, '/api/v1/communities/retro-gamers', {
          slug: 'retro-gamers',
        })
      ).status,
    ).toBe(200);
  });
});

describe('reads', () => {
  it('a member sees the community, its flairs and posting requirements', async () => {
    const body = (await (
      await get(routes.one.GET!, '/api/v1/communities/retro-gamers', {
        slug: 'retro-gamers',
      })
    ).json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      slug: 'retro-gamers',
      isMember: true,
      role: 'MEMBER',
      flairs: [
        {
          id: 'flair_1',
          name: 'Discussion',
          color: 'accent',
        },
      ],
      posting: {
        flairRequired: false,
        requireImageAlt: true,
      },
    });
    expect(Object.keys(body)).not.toContain('members');
  });

  it('a private community is a 404 for a non-member on every read', async () => {
    for (const [handler, suffix] of [
      [routes.one.GET!, ''],
      [routes.rules.GET!, '/rules'],
      [routes.posts.GET!, '/posts'],
    ] as const) {
      const res = await get(handler, `/api/v1/communities/secret-club${suffix}`, {
        slug: 'secret-club',
      });
      expect(res.status, suffix).toBe(404);
    }
  });

  it('a private community is readable by its member', async () => {
    h.members.push({
      id: 'm2',
      communityId: 'c_secret',
      userId: 'owner_1',
      role: 'MOD',
      joinedAt: new Date(),
    });
    expect(
      (
        await get(routes.one.GET!, '/api/v1/communities/secret-club', {
          slug: 'secret-club',
        })
      ).status,
    ).toBe(200);
  });

  it('the rules come back in order', async () => {
    const body = (await (
      await get(routes.rules.GET!, '/api/v1/communities/retro-gamers/rules', {
        slug: 'retro-gamers',
      })
    ).json()) as {
      data: {
        title: string;
      }[];
    };
    expect(body.data.map((r) => r.title)).toEqual(['Be kind']);
  });

  it('the posts come from the site feed query as the key owner, held and removed ones left out', async () => {
    const res = await get(routes.posts.GET!, '/api/v1/communities/retro-gamers/posts?flair=flair_1&limit=5', {
      slug: 'retro-gamers',
    });
    const body = (await res.json()) as {
      data: {
        id: string;
        metrics: {
          likes: number | null;
        };
        flair: unknown;
      }[];
      nextCursor: string | null;
    };
    expect(body.data.map((p) => p.id)).toEqual(['p_visible']);
    expect(body.data[0]!.metrics.likes).toBe(3);
    expect(h.feedCalls).toEqual([
      {
        slug: 'retro-gamers',
        viewerId: 'owner_1',
        opts: {
          cursor: null,
          limit: 5,
          flairId: 'flair_1',
        },
      },
    ]);
  });

  it('keeps quiet counts quiet', async () => {
    h.posts = [
      {
        id: 'p_quiet',
        communityId: 'c_open',
        deletedAt: null,
        likeCount: null,
      },
    ];
    const body = (await (
      await get(routes.posts.GET!, '/api/v1/communities/retro-gamers/posts', {
        slug: 'retro-gamers',
      })
    ).json()) as {
      data: {
        metrics: unknown;
      }[];
    };
    expect(body.data[0]!.metrics).toEqual({
      likes: null,
      comments: null,
      reposts: null,
      views: null,
    });
  });

  it('refuses a malformed slug and query with 400', async () => {
    expect(
      (
        await get(routes.one.GET!, '/api/v1/communities/x', {
          slug: '../x',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await get(routes.posts.GET!, '/api/v1/communities/retro-gamers/posts?limit=900', {
          slug: 'retro-gamers',
        })
      ).status,
    ).toBe(400);
  });

  it("lists only the owner's memberships", async () => {
    h.members.push({
      id: 'm9',
      communityId: 'c_open',
      userId: 'someone_else',
      role: 'ADMIN',
      joinedAt: new Date(),
    });
    const body = (await (await get(routes.mine.GET!, '/api/v1/me/communities')).json()) as {
      data: {
        role: string;
        slug: string;
      }[];
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      slug: 'retro-gamers',
      role: 'MEMBER',
    });
  });
});

describe('POST /api/v1/posts with a communityId', () => {
  const into = {
    content: 'What are you playing?',
    communityId: 'c_open',
  };

  it('allow: 201, the post is stored in the community and counted', async () => {
    const res = await post({
      ...into,
      flairId: 'flair_1',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      communityId: 'c_open',
      flairId: 'flair_1',
      audience: 'PUBLIC',
      content: 'What are you playing?',
    });
    expect(h.created[0]).toMatchObject({
      userId: 'owner_1',
      communityId: 'c_open',
    });
    expect(h.created[0]).not.toHaveProperty('deletedAt');
    expect(h.communityUpdates).toBe(1);
    expect(h.userUpdates).toBe(1);
    expect(h.flairRows).toEqual([
      {
        postId: 'post_1',
        flairId: 'flair_1',
      },
    ]);
    expect(h.createPost).not.toHaveBeenCalled();
  });

  it('refuses without membership: 403 and nothing written', async () => {
    const res = await post({
      ...into,
      communityId: 'c_secret',
    });
    expect(res.status).toBe(403);
    expect(h.created).toHaveLength(0);
    expect(h.gateCalls).toHaveLength(0);
  });

  it("a timed-out member gets the gate's code and endsAt", async () => {
    h.sanction = {
      kind: 'timeout',
      endsAt: new Date('2026-12-01T10:00:00Z'),
    };
    const res = await post(into);
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: {
        code: string;
        endsAt: string;
        message: string;
        type: string;
      };
    };
    expect(body.error.code).toBe(denyCode('timeout'));
    expect(body.error.endsAt).toBe('2026-12-01T10:00:00.000Z');
    expect(body.error.type).toBe('authorization_error');
    expect(body.error.message).toContain('timed out');
    expect(h.created).toHaveLength(0);
  });

  it('passes a gate refusal through with its status and code', async () => {
    h.gate = {
      kind: 'deny',
      status: 400,
      code: 'flair_required',
      error: 'Choose a flair for your post — this community requires one.',
    };
    const res = await post(into);
    expect(res.status).toBe(400);
    expect(
      (
        (await res.json()) as {
          error: {
            code: string;
          };
        }
      ).error.code,
    ).toBe('flair_required');
    expect(h.created).toHaveLength(0);
  });

  it('hold: 202 held, stored as the AutoMod marker, queued for the mods, not counted', async () => {
    h.gate = {
      kind: 'hold',
      ruleName: 'No links',
    };
    const res = await post(into);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      status: 'held',
      id: 'post_1',
    });
    expect(h.created[0]).toMatchObject({
      deletedBy: 'automod_hold',
    });
    expect(h.created[0]!.deletedAt).toBeInstanceOf(Date);
    expect(h.modItems).toEqual([
      expect.objectContaining({
        action: 'hold',
        ruleName: 'No links',
        postId: 'post_1',
        communityId: 'c_open',
        authorId: 'owner_1',
      }),
    ]);
    expect(h.communityUpdates).toBe(0);
    expect(h.userUpdates).toBe(0);
  });

  it('remove: 422 with the rule name, logged, nothing stored', async () => {
    h.gate = {
      kind: 'remove',
      ruleName: 'No spoilers',
    };
    const res = await post(into);
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: {
        code: string;
        message: string;
      };
    };
    expect(body.error.code).toBe('automod_removed');
    expect(body.error.message).toContain('No spoilers');
    expect(h.removedLogs).toHaveLength(1);
    expect(h.created).toHaveLength(0);
  });

  it('passes the images and their descriptions to the gate (a requiring community can refuse them)', async () => {
    await post({
      ...into,
      media_ids: ['a', 'b'],
      media_alts: ['first ', 'second'],
    });
    expect(h.gateCalls[0]).toMatchObject({
      imageUrls: ['a', 'b'],
      imageAlts: ['first', 'second'],
      target: 'post',
    });
  });

  it('a write:posts-only key is refused before any gate runs and nothing is written', async () => {
    h.scopes = ['write:posts'];
    const res = await post(into);
    expect(res.status).toBe(403);
    expect(
      (
        (await res.json()) as {
          error: {
            code: string;
          };
        }
      ).error.code,
    ).toBe('insufficient_scope');
    expect(h.gateCalls).toHaveLength(0);
    expect(h.created).toHaveLength(0);
    expect(h.createPost).not.toHaveBeenCalled();
  });

  it('a write:* key succeeds', async () => {
    h.scopes = ['write:*'];
    expect((await post(into)).status).toBe(201);
  });

  it('a stray flairId without a communityId is ignored, as before', async () => {
    h.scopes = ['write:posts'];
    const res = await post({ content: 'hi', flairId: 'flair_1' });
    expect(res.status).toBe(201);
    expect(h.createPost).toHaveBeenCalledWith({ userId: 'owner_1', content: 'hi', audience: 'PUBLIC', mediaIds: [] });
    expect(h.gateCalls).toHaveLength(0);
  });
});

describe('a post without a communityId', () => {
  it('is the unchanged own-timeline create, and needs only write:posts', async () => {
    h.scopes = ['write:posts'];
    const res = await post({
      content: 'hi',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: 'plain_1',
      content: 'hi',
      audience: 'PUBLIC',
      createdAt: '2026-11-20T10:00:00.000Z',
    });
    expect(h.createPost).toHaveBeenCalledWith({
      userId: 'owner_1',
      content: 'hi',
      audience: 'PUBLIC',
      mediaIds: [],
    });
    expect(h.gateCalls).toHaveLength(0);
  });
});
