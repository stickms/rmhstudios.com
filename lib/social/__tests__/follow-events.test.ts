/**
 * The follow log is written in the same transaction as the Follow change, never names an
 * unfollower to the creator, and goes with the account. Prisma is an in-memory fake whose
 * queries are lazy (as Prisma's are), so a batch `$transaction([...])` really is atomic here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

interface Follow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
}
interface Event {
  followerId: string;
  followingId: string;
  kind: string;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  state: {
    follows: [] as Follow[],
    events: [] as Event[],
    deckEditorDeletes: [] as unknown[],
    blocks: [] as {
      id: string;
      blockerId: string;
      blockedId: string;
    }[],
    counts: {} as Record<
      string,
      {
        followerCount: number;
        followingCount: number;
      }
    >,
  },
  failUserUpdate: false,
  invalidated: [] as string[],
  nextId: 1,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: {
          id: 'creator',
        },
        session: {},
      }),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({
  withRateLimitAsync: async () => null,
}));
vi.mock('@/lib/feed-sse', () => ({
  feedEventBus: {
    publish: () => {},
    publishPostEngagement: () => {},
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async () => {},
  removeNotification: async () => {},
}));
vi.mock('@/lib/achievements/engine.server', () => ({
  progressAchievement: async () => {},
}));
vi.mock('@/lib/social/engagement-effects.server', () => ({
  enqueueProgression: async () => {},
}));
vi.mock('@/lib/feed/notify-mentions.server', () => ({
  notifyMentions: async () => {},
}));
vi.mock('@/lib/media/attach.server', () => ({
  resolveMediaForPost: async () => [],
}));
vi.mock('@/lib/feed/audience.server', () => ({
  canReadThread: async () => true,
}));
vi.mock('@/lib/social/follow-graph.server', () => ({
  invalidateFollowingIds: () => {},
}));
vi.mock('@/lib/moderation.server', () => ({
  invalidateHiddenAuthors: () => {},
}));
vi.mock('@/lib/cached.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cached.server')>()),
  cached: (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateTag: async (tag: string) => {
    h.invalidated.push(tag);
  },
}));

vi.mock('@/lib/prisma.server', () => {
  const { state } = h;
  /** A query that runs when awaited, once, like a PrismaPromise. */
  const lazy = <T>(run: () => T | Promise<T>): PromiseLike<T> => {
    let started: Promise<T> | undefined;
    return {
      then: (ok, bad) => {
        started ??= Promise.resolve().then(run);
        return started.then(ok, bad);
      },
    };
  };
  const clone = () => structuredClone(state);
  const restore = (snap: typeof state) => Object.assign(state, snap);

  const prisma = {
    user: {
      findUnique: ({
        where,
      }: {
        where: {
          id: string;
        };
      }) =>
        lazy(() => ({
          id: where.id,
          followerCount: state.counts[where.id]?.followerCount ?? 0,
        })),
      update: ({
        where,
        data,
      }: {
        where: {
          id: string;
        };
        data: Record<
          string,
          {
            increment: number;
          }
        >;
      }) =>
        lazy(() => {
          if (h.failUserUpdate) throw new Error('counter update failed');
          const row = (state.counts[where.id] ??= {
            followerCount: 0,
            followingCount: 0,
          });
          if (data.followerCount) row.followerCount += data.followerCount.increment;
          if (data.followingCount) row.followingCount += data.followingCount.increment;
          return {
            followerCount: row.followerCount,
          };
        }),
      updateMany: () =>
        lazy(() => ({
          count: 1,
        })),
    },
    follow: {
      findUnique: ({
        where,
      }: {
        where: {
          followerId_followingId: {
            followerId: string;
            followingId: string;
          };
        };
      }) =>
        lazy(
          () =>
            state.follows.find(
              (f) =>
                f.followerId === where.followerId_followingId.followerId &&
                f.followingId === where.followerId_followingId.followingId,
            ) ?? null,
        ),
      create: ({
        data,
      }: {
        data: {
          followerId: string;
          followingId: string;
        };
      }) =>
        lazy(() => {
          const row = {
            id: `f${h.nextId++}`,
            ...data,
            createdAt: new Date(),
          };
          state.follows.push(row);
          return row;
        }),
      delete: ({
        where,
      }: {
        where: {
          followerId_followingId: {
            followerId: string;
            followingId: string;
          };
        };
      }) =>
        lazy(() => {
          const w = where.followerId_followingId;
          state.follows = state.follows.filter(
            (f) => !(f.followerId === w.followerId && f.followingId === w.followingId),
          );
          return {};
        }),
      findMany: ({
        where,
      }: {
        where: {
          OR: {
            followerId: string;
            followingId: string;
          }[];
        };
      }) =>
        lazy(() =>
          state.follows.filter((f) =>
            where.OR.some((o) => o.followerId === f.followerId && o.followingId === f.followingId),
          ),
        ),
      deleteMany: ({
        where,
      }: {
        where: {
          id: string;
        };
      }) =>
        lazy(() => {
          const before = state.follows.length;
          state.follows = state.follows.filter((f) => f.id !== where.id);
          return {
            count: before - state.follows.length,
          };
        }),
    },
    followEvent: {
      create: ({
        data,
      }: {
        data: {
          followerId: string;
          followingId: string;
          kind: string;
        };
      }) =>
        lazy(() => {
          state.events.push({
            ...data,
            createdAt: new Date(),
          });
          return {
            id: BigInt(state.events.length),
          };
        }),
      deleteMany: ({
        where,
      }: {
        where: {
          followingId: string;
        };
      }) =>
        lazy(() => {
          const before = state.events.length;
          state.events = state.events.filter((e) => e.followingId !== where.followingId);
          return {
            count: before - state.events.length,
          };
        }),
      updateMany: ({
        where,
        data,
      }: {
        where: {
          followerId: string;
        };
        data: {
          followerId: string;
        };
      }) =>
        lazy(() => {
          let count = 0;
          for (const e of state.events) {
            if (e.followerId === where.followerId) {
              e.followerId = data.followerId;
              count++;
            }
          }
          return {
            count,
          };
        }),
      findFirst: () => lazy(() => state.events[0] ?? null),
    },
    // The block endpoint also clears the blocker's repost-mute row for the person (s05-07).
    repostMute: { deleteMany: () => lazy(() => ({ count: 0 })) },
    // ...and ends deck editing between the pair (s11-10).
    deckEditor: {
      deleteMany: (args: unknown) =>
        lazy(() => {
          h.state.deckEditorDeletes.push(args);
          return { count: 0 };
        }),
    },
    userBlock: {
      findUnique: () => lazy(() => null),
      create: ({
        data,
      }: {
        data: {
          blockerId: string;
          blockedId: string;
        };
      }) =>
        lazy(() => {
          state.blocks.push({
            id: `b${h.nextId++}`,
            ...data,
          });
          return {};
        }),
    },
    $transaction: async (arg: PromiseLike<unknown>[] | ((tx: unknown) => Promise<unknown>)) => {
      const snapshot = clone();
      try {
        if (typeof arg === 'function') return await arg(prisma);
        const out: unknown[] = [];
        for (const query of arg) out.push(await query);
        return out;
      } catch (err) {
        restore(snapshot);
        throw err;
      }
    },
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('FROM follow_event')) {
        const days = new Map<
          string,
          {
            gained: number;
            lost: number;
          }
        >();
        for (const e of state.events.filter((ev) => ev.followingId === 'creator')) {
          const day = e.createdAt.toISOString().slice(0, 10);
          const row = days.get(day) ?? {
            gained: 0,
            lost: 0,
          };
          if (e.kind === 'follow') row.gained += 1;
          else row.lost += 1;
          days.set(day, row);
        }
        return [...days].map(([day, r]) => ({
          day,
          ...r,
        }));
      }
      return [];
    },
  };
  return {
    prisma,
  };
});

const SESSION = 'better-auth.session_token=test';

const { followUser, unfollowUser } = await import('@/lib/social/engagement.server');
const { route: blockRoute } = await import('@/lib/moderation/api/moderation.block.server');
const { route: audienceRoute } = await import('@/lib/social/api/analytics.audience.server');
const { DELETED_USER_ID } = await import('@/lib/account/deleted-user');
const { deleteFollowEventsFor } = await import('@/lib/social/follow-events.server');
const { prisma } = await import('@/lib/prisma.server');

beforeEach(() => {
  h.state.follows = [];
  h.state.events = [];
  h.state.blocks = [];
  h.state.counts = {
    creator: {
      followerCount: 0,
      followingCount: 0,
    },
    fan: {
      followerCount: 0,
      followingCount: 0,
    },
  };
  h.failUserUpdate = false;
  h.invalidated = [];
});

describe('follow and unfollow write the log', () => {
  it('writes one follow event beside the Follow row and drops the cached audience view', async () => {
    const result = await followUser({
      followerId: 'fan',
      followingId: 'creator',
    });
    expect(result.following).toBe(true);
    expect(h.state.follows).toHaveLength(1);
    expect(h.state.events).toEqual([
      expect.objectContaining({
        followerId: 'fan',
        followingId: 'creator',
        kind: 'follow',
      }),
    ]);
    expect(h.invalidated).toEqual(['audience:creator']);
  });

  it('writes one unfollow event beside the delete', async () => {
    await followUser({
      followerId: 'fan',
      followingId: 'creator',
    });
    await unfollowUser({
      followerId: 'fan',
      followingId: 'creator',
    });
    expect(h.state.follows).toHaveLength(0);
    expect(h.state.events.map((e) => e.kind)).toEqual(['follow', 'unfollow']);
  });

  it('writes nothing when the follow state did not change', async () => {
    await unfollowUser({
      followerId: 'fan',
      followingId: 'creator',
    });
    await followUser({
      followerId: 'fan',
      followingId: 'creator',
    });
    await followUser({
      followerId: 'fan',
      followingId: 'creator',
    });
    expect(h.state.events.map((e) => e.kind)).toEqual(['follow']);
  });

  it('rolls the edge and the event back together when the transaction fails', async () => {
    h.failUserUpdate = true;
    await expect(
      followUser({
        followerId: 'fan',
        followingId: 'creator',
      }),
    ).rejects.toThrow();
    expect(h.state.follows).toHaveLength(0);
    expect(h.state.events).toHaveLength(0);
    expect(h.invalidated).toEqual([]);
  });
});

describe('blocking', () => {
  const post = handlersOf(blockRoute).POST as TestHandler;
  const request = () =>
    new Request('http://localhost/api/moderation/block', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: SESSION,
      },
      body: JSON.stringify({
        targetUserId: 'fan',
      }),
    });

  it('logs a blocked event for each follow it deletes, in both directions', async () => {
    await followUser({
      followerId: 'fan',
      followingId: 'creator',
    });
    await followUser({
      followerId: 'creator',
      followingId: 'fan',
    });
    h.state.events = [];
    const res = await post({
      request: request(),
      params: {},
    });
    expect(res.status).toBe(200);
    expect(h.state.follows).toHaveLength(0);
    expect(h.state.events.map((e) => `${e.followerId}>${e.followingId}:${e.kind}`).sort()).toEqual([
      'creator>fan:blocked',
      'fan>creator:blocked',
    ]);
  });

  it('ends deck editing between the pair, both directions, in the block transaction (s11-10)', async () => {
    h.state.deckEditorDeletes = [];
    const res = await post({ request: request(), params: {} });
    expect(res.status).toBe(200);
    expect(h.state.deckEditorDeletes).toEqual([
      {
        where: {
          OR: [
            { userId: 'fan', deck: { userId: 'creator' } },
            { userId: 'creator', deck: { userId: 'fan' } },
          ],
        },
      },
    ]);
  });

  it('logs nothing when there was no follow to remove', async () => {
    const res = await post({
      request: request(),
      params: {},
    });
    expect(res.status).toBe(200);
    expect(h.state.events).toHaveLength(0);
  });
});

describe('the audience endpoint', () => {
  const get = handlersOf(audienceRoute).GET as TestHandler;

  it('counts a loss and never returns who unfollowed', async () => {
    h.state.counts.creator = {
      followerCount: 0,
      followingCount: 0,
    };
    await followUser({
      followerId: 'fan',
      followingId: 'creator',
    });
    await unfollowUser({
      followerId: 'fan',
      followingId: 'creator',
    });

    const res = await get({
      request: new Request('http://localhost/api/analytics/audience?range=30&tz=UTC', {
        headers: {
          cookie: SESSION,
        },
      }),
      params: {},
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as {
      totals: {
        gained: number;
        lost: number;
        net: number;
      };
    };
    expect(body.totals).toEqual({
      gained: 1,
      lost: 1,
      net: 0,
    });
    expect(text).not.toContain('fan');
  });

  it('rejects a time zone the runtime does not know', async () => {
    const res = await get({
      request: new Request('http://localhost/api/analytics/audience?tz=Mars/Base', {
        headers: {
          cookie: SESSION,
        },
      }),
      params: {},
    });
    expect(res.status).toBe(400);
  });
});

describe('account deletion', () => {
  it("erases the member's own audience history and de-identifies the rows where they followed", async () => {
    await followUser({
      followerId: 'fan',
      followingId: 'creator',
    });
    await followUser({
      followerId: 'creator',
      followingId: 'fan',
    });
    h.state.events.push({
      followerId: 'x',
      followingId: 'y',
      kind: 'follow',
      createdAt: new Date(),
    });
    await prisma.$transaction([...deleteFollowEventsFor('fan')]);
    // creator>fan (fan's own audience) is gone; fan>creator stays for the creator's history but
    // no longer names fan; unrelated rows are untouched.
    expect(h.state.events.map((e) => `${e.followerId}>${e.followingId}`)).toEqual([
      `${DELETED_USER_ID}>creator`,
      'x>y',
    ]);
    expect(h.state.events.some((e) => e.followerId === 'fan' || e.followingId === 'fan')).toBe(false);
  });
});
