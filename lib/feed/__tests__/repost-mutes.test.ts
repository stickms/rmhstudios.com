/**
 * "Turn off reposts from X" (sprint 05 #07): the list, its cap and its lock, the two timeline repost queries, the
 * cached-page reconcile, the block that clears a row and the endpoint's refusals. Prisma is an in-memory fake; nothing
 * here touches a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

interface MuteRow {
  id: string;
  userId: string;
  targetId: string;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  mutes: [] as {
    id: string;
    userId: string;
    targetId: string;
    createdAt: Date;
  }[],
  users: new Set<string>(),
  blocks: [] as {
    blockerId: string;
    blockedId: string;
  }[],
  calls: [] as string[],
  invalidated: [] as string[],
  nextId: 1,
  /** Extra rows `count` reports, to stand in for a member who already holds 1,000. */
  countOverride: null as number | null,
  hidden: [] as string[],
  following: ['friend'],
  seeded: false,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: {
          id: 'viewer',
        },
        session: {},
      }),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({
  withRateLimitAsync: async () => null,
}));
vi.mock('@/lib/cached.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cached.server')>()),
  cached: (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: async (key: string) => {
    h.invalidated.push(key);
  },
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    h.calls.push(`lock:${key}`);
  },
}));
vi.mock('@/lib/feed/timeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feed/timeline')>()),
  invalidateViewerFeedPages: async (id: string) => {
    h.calls.push(`feedPages:${id}`);
  },
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => h.hidden,
  getBlockedAuthorIds: async () => [],
  invalidateHiddenAuthors: () => {},
}));
vi.mock('@/lib/social/follow-graph.server', () => ({
  getFollowingIds: async () => h.following,
  invalidateFollowingIds: () => {},
}));
vi.mock('@/lib/social/follow-events.server', () => ({
  invalidateAudience: () => {},
  recordFollowEvent: async () => {},
}));
vi.mock('@/lib/feed/signals.server', () => ({
  getSignals: async () => ({
    lessAuthors: [],
    mutedTags: [],
    followedTags: [],
  }),
}));
vi.mock('@/lib/feed/personalize.server', () => ({
  buildInterestProfile: async () => null,
}));
vi.mock('@/lib/user-display.server', () => ({
  getUserDisplayMap: async () => new Map(),
}));
vi.mock('@/lib/blog', () => ({
  getAllPosts: async () => [],
}));
vi.mock('@/lib/feed/audience.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feed/audience.server')>()),
  circleOwnerIds: async () => [],
}));

vi.mock('@/lib/prisma.server', () => {
  const prisma = {
    repostMute: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
          };
        }) =>
          h.mutes
            .filter((m) => m.userId === where.userId)
            .map((m) => ({
              targetId: m.targetId,
            })),
      ),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId_targetId: {
              userId: string;
              targetId: string;
            };
          };
        }) => {
          const w = where.userId_targetId;
          return h.mutes.find((m) => m.userId === w.userId && m.targetId === w.targetId) ?? null;
        },
      ),
      count: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
          };
        }) => {
          h.calls.push('count');
          return h.countOverride ?? h.mutes.filter((m) => m.userId === where.userId).length;
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            userId: string;
            targetId: string;
          };
        }) => {
          h.calls.push('create');
          h.mutes.push({
            id: `m${h.nextId++}`,
            createdAt: new Date(),
            ...data,
          });
          return {};
        },
      ),
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
            targetId: string;
          };
        }) => {
          const before = h.mutes.length;
          h.mutes = h.mutes.filter((m) => !(m.userId === where.userId && m.targetId === where.targetId));
          return {
            count: before - h.mutes.length,
          };
        },
      ),
    },
    user: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
          };
        }) =>
          h.users.has(where.id)
            ? {
                id: where.id,
                isAdmin: false,
              }
            : null,
      ),
    },
    userBlock: {
      findFirst: vi.fn(
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
          h.blocks.find((b) => where.OR.some((o) => o.blockerId === b.blockerId && o.blockedId === b.blockedId)) ??
          null,
      ),
      findUnique: vi.fn(async () => null),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            blockerId: string;
            blockedId: string;
          };
        }) => {
          h.blocks.push(data);
          return {};
        },
      ),
    },
    deckEditor: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    customFeed: { findMany: vi.fn(async () => []) },
    customFeedMember: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    follow: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({
        count: 0,
      })),
    },
    rMHark: {
      findMany: vi.fn(async () => []),
    },
    rMHarkRepost: {
      findMany: vi.fn(async () => []),
    },
    rMHarkReaction: {
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async () => []),
    },
    savedItem: {
      findMany: vi.fn(async () => []),
    },
    userProfile: {
      findUnique: vi.fn(async () => ({
        mutedWords: [],
      })),
    },
    closeFriend: {
      findMany: vi.fn(async () => []),
    },
    $queryRaw: vi.fn(async () => []),
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (t: unknown) => unknown)(prisma) : arg),
  };
  return {
    prisma,
  };
});

import { prisma } from '@/lib/prisma.server';
import { getTimeline } from '@/lib/feed/timeline';
import { encodeCursor } from '@/lib/feed/cursor';
import { reconcileCachedPage } from '@/lib/feed/page-reconcile.server';
import type { FeedItem } from '@/lib/feed-types';
import { REPOST_MUTE_LIMIT } from '@/lib/feed/repost-mutes';
import {
  RepostMuteError,
  clearRepostMuteForBlock,
  exportRepostMutes,
  getRepostMutedIds,
  repostMuteErasureOps,
  toggleRepostMute,
} from '@/lib/feed/repost-mutes.server';
import { route as repostMutesRoute } from '@/lib/feed/api/feed.repost-mutes.server';
import { route as blockRoute } from '@/lib/moderation/api/moderation.block.server';

const db = prisma as unknown as {
  repostMute: Record<string, ReturnType<typeof vi.fn>>;
  rMHark: {
    findMany: ReturnType<typeof vi.fn>;
  };
  rMHarkRepost: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  h.mutes = [];
  h.users = new Set(['viewer', 'a', 'b']);
  h.blocks = [];
  h.calls = [];
  h.invalidated = [];
  h.countOverride = null;
  h.hidden = [];
  h.following = ['friend'];
  vi.clearAllMocks();
});

const ids = () => h.mutes.map((m: MuteRow) => m.targetId);

describe('toggleRepostMute', () => {
  it('adds a person, is idempotent, and removes them again', async () => {
    expect(await toggleRepostMute('viewer', 'a', true)).toEqual({
      off: true,
      changed: true,
    });
    expect(ids()).toEqual(['a']);
    expect(await toggleRepostMute('viewer', 'a', true)).toEqual({
      off: true,
      changed: false,
    });
    expect(ids()).toEqual(['a']);
    expect(await toggleRepostMute('viewer', 'a', false)).toEqual({
      off: false,
      changed: true,
    });
    expect(ids()).toEqual([]);
    expect(await toggleRepostMute('viewer', 'a', false)).toEqual({
      off: false,
      changed: false,
    });
  });

  it('drops the cached list on every change', async () => {
    await toggleRepostMute('viewer', 'a', true);
    await toggleRepostMute('viewer', 'a', false);
    expect(h.invalidated.filter((k) => k === 'repost-mutes:viewer')).toHaveLength(2);
  });

  it('refuses yourself, an unknown person and a person in a block either way', async () => {
    await expect(toggleRepostMute('viewer', 'viewer', true)).rejects.toMatchObject({
      code: 'self',
    });
    await expect(toggleRepostMute('viewer', 'ghost', true)).rejects.toMatchObject({
      code: 'not-found',
    });
    // The shared "Deleted user" sentinel is never a target.
    await expect(toggleRepostMute('viewer', 'deleted-user', true)).rejects.toMatchObject({
      code: 'not-found',
    });
    h.blocks.push({
      blockerId: 'a',
      blockedId: 'viewer',
    });
    await expect(toggleRepostMute('viewer', 'a', true)).rejects.toMatchObject({
      code: 'not-found',
    });
    h.blocks = [
      {
        blockerId: 'viewer',
        blockedId: 'b',
      },
    ];
    await expect(toggleRepostMute('viewer', 'b', true)).rejects.toBeInstanceOf(RepostMuteError);
    expect(ids()).toEqual([]);
  });

  it('refuses the 1,001st person, and checks the cap only after taking the member lock', async () => {
    h.countOverride = REPOST_MUTE_LIMIT;
    await expect(toggleRepostMute('viewer', 'a', true)).rejects.toMatchObject({
      code: 'limit',
    });
    expect(h.calls).toEqual(['lock:repost-mutes:viewer', 'count']);
    expect(ids()).toEqual([]);

    h.calls = [];
    h.countOverride = REPOST_MUTE_LIMIT - 1;
    expect(await toggleRepostMute('viewer', 'a', true)).toEqual({
      off: true,
      changed: true,
    });
    expect(h.calls).toEqual(['lock:repost-mutes:viewer', 'count', 'create']);
  });

  it('turning a person back on is never refused by the cap', async () => {
    h.mutes.push({
      id: 'm0',
      userId: 'viewer',
      targetId: 'a',
      createdAt: new Date(),
    });
    h.countOverride = REPOST_MUTE_LIMIT;
    expect(await toggleRepostMute('viewer', 'a', false)).toEqual({
      off: false,
      changed: true,
    });
  });
});

describe('getRepostMutedIds', () => {
  it('is the viewer’s own ids, and empty when signed out', async () => {
    h.mutes.push(
      {
        id: 'm1',
        userId: 'viewer',
        targetId: 'a',
        createdAt: new Date(),
      },
      {
        id: 'm2',
        userId: 'someone-else',
        targetId: 'b',
        createdAt: new Date(),
      },
    );
    expect(await getRepostMutedIds('viewer')).toEqual(['a']);
    expect(await getRepostMutedIds(null)).toEqual([]);
  });

  it('fails open: a failed read serves the timeline unfiltered', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.repostMute.findMany!.mockRejectedValueOnce(new Error('db down'));
    expect(await getRepostMutedIds('viewer')).toEqual([]);
    spy.mockRestore();
  });
});

describe('the timeline repost queries', () => {
  const cursor = () => encodeCursor(new Date(Date.now() + 60_000).toISOString(), 'zzzz');
  const run = (surface: 'following' | 'foryou') =>
    getTimeline({
      userId: 'viewer',
      surface,
      filter: 'all',
      cursor: cursor(),
      limit: 20,
      search: null,
    });

  it('Following: the repost query excludes the muted person, and the posts query is untouched', async () => {
    h.mutes.push({
      id: 'm1',
      userId: 'viewer',
      targetId: 'a',
      createdAt: new Date(),
    });
    h.following = ['friend', 'a'];
    await run('following');
    const repostWhere = db.rMHarkRepost.findMany.mock.calls[0]![0].where;
    expect(repostWhere.userId).toEqual({
      in: ['friend', 'a'],
      notIn: ['a'],
    });
    // Their own posts are still queried: the posts where has no exclusion of them.
    const postWhere = JSON.stringify(db.rMHark.findMany.mock.calls[0]![0].where);
    expect(postWhere).not.toContain('"notIn":["a"]');
    expect(db.rMHark.findMany.mock.calls[0]![0].where.userId).toEqual({
      in: ['friend', 'a'],
    });
  });

  it('For You: the repost query excludes the muted person next to hidden authors, the posts query does not', async () => {
    h.mutes.push({
      id: 'm1',
      userId: 'viewer',
      targetId: 'a',
      createdAt: new Date(),
    });
    h.hidden = ['muted-author'];
    await run('foryou');
    const repostWhere = db.rMHarkRepost.findMany.mock.calls[0]![0].where;
    expect(repostWhere.userId).toEqual({
      notIn: ['muted-author', 'a'],
    });
    expect(db.rMHark.findMany.mock.calls[0]![0].where.userId).toEqual({
      notIn: ['muted-author'],
    });
  });

  it('adds nothing to either query when the list is empty', async () => {
    await run('following');
    await run('foryou');
    const [following, forYou] = db.rMHarkRepost.findMany.mock.calls.map((c) => c[0].where);
    expect(following.userId).toEqual({
      in: ['friend'],
    });
    expect(forYou.userId).toBeUndefined();
  });
});

describe('cached-page reconcile', () => {
  const card = (id: string, by?: string): FeedItem =>
    ({
      id,
      actualId: `post-${id}`,
      type: 'rmhark',
      user: {
        id: 'author',
      },
      ...(by
        ? {
            repostedBy: {
              id: by,
            },
          }
        : {}),
    }) as unknown as FeedItem;

  it('drops a cached repost by a person turned off since, and keeps the rest', async () => {
    h.mutes.push({
      id: 'm1',
      userId: 'viewer',
      targetId: 'a',
      createdAt: new Date(),
    });
    const rows = ['own', 'rp-a', 'rp-b'].map((id) => ({
      id: `post-${id}`,
      userId: 'author',
      audience: 'PUBLIC',
      deletedAt: null,
      communityId: null,
      hashtags: [],
      unlocks: [],
      user: {
        profile: null,
      },
    }));
    (prisma.rMHark.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
    const out = await reconcileCachedPage([card('own'), card('rp-a', 'a'), card('rp-b', 'b')], 'viewer', 'foryou');
    expect(out.items.map((i) => i.id)).toEqual(['own', 'rp-b']);
  });
});

describe('blocking', () => {
  it('clearRepostMuteForBlock deletes only the blocker’s row for that person', async () => {
    h.mutes.push(
      {
        id: 'm1',
        userId: 'viewer',
        targetId: 'a',
        createdAt: new Date(),
      },
      {
        id: 'm2',
        userId: 'viewer',
        targetId: 'b',
        createdAt: new Date(),
      },
    );
    await clearRepostMuteForBlock(prisma as never, 'viewer', 'a');
    expect(ids()).toEqual(['b']);
  });

  it('the block endpoint removes the blocker’s repost-mute row and the cached list', async () => {
    h.mutes.push({
      id: 'm1',
      userId: 'viewer',
      targetId: 'a',
      createdAt: new Date(),
    });
    const post = handlersOf<TestHandler>(blockRoute).POST!;
    const res = await post({
      request: new Request('http://x/api/moderation/block', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'better-auth.session_token=t',
        },
        body: JSON.stringify({
          targetUserId: 'a',
        }),
      }),
      params: {},
    });
    expect(res.status).toBe(200);
    expect(ids()).toEqual([]);
    expect(h.invalidated).toContain('repost-mutes:viewer');
  });
});

describe('/api/feed/repost-mutes', () => {
  const post = (body: unknown) =>
    handlersOf<TestHandler>(repostMutesRoute).POST!({
      request: new Request('http://x/api/feed/repost-mutes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'better-auth.session_token=t',
        },
        body: JSON.stringify(body),
      }),
      params: {},
    });

  it('turns a person off, then back on (and refreshes the cached first page on the way back)', async () => {
    expect(
      await (
        await post({
          targetUserId: 'a',
          off: true,
        })
      ).json(),
    ).toEqual({
      off: true,
    });
    expect(ids()).toEqual(['a']);
    expect(h.calls).not.toContain('feedPages:viewer');
    expect(
      await (
        await post({
          targetUserId: 'a',
          off: false,
        })
      ).json(),
    ).toEqual({
      off: false,
    });
    expect(ids()).toEqual([]);
    expect(h.calls).toContain('feedPages:viewer');
  });

  it('answers yourself with 400, an unknown person with 404, the 1,001st with 409 naming the limit', async () => {
    expect(
      (
        await post({
          targetUserId: 'viewer',
          off: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          targetUserId: 'ghost',
          off: true,
        })
      ).status,
    ).toBe(404);
    h.countOverride = REPOST_MUTE_LIMIT;
    const full = await post({
      targetUserId: 'a',
      off: true,
    });
    expect(full.status).toBe(409);
    expect(
      (
        (await full.json()) as {
          error: string;
        }
      ).error,
    ).toContain('1,000');
  });

  it('rejects a body that is not { targetUserId, off }', async () => {
    expect(
      (
        await post({
          targetUserId: 'a',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          off: true,
        })
      ).status,
    ).toBe(400);
  });
});

describe('erasure and export', () => {
  it('erases rows where the member is either side, with a Prisma operation', () => {
    repostMuteErasureOps('u1');
    expect(db.repostMute.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            userId: 'u1',
          },
          {
            targetId: 'u1',
          },
        ],
      },
    });
  });

  it('exports only the member’s own list', async () => {
    db.repostMute.findMany!.mockResolvedValueOnce([
      {
        targetId: 'a',
        createdAt: new Date('2026-11-01T00:00:00Z'),
        target: {
          handle: 'ada',
        },
      },
    ]);
    expect(await exportRepostMutes('u1')).toEqual([
      {
        userId: 'a',
        handle: 'ada',
        since: '2026-11-01T00:00:00.000Z',
      },
    ]);
    expect(db.repostMute.findMany!.mock.calls[0]![0].where).toEqual({
      userId: 'u1',
    });
  });
});
