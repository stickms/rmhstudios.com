import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATH, VOICE_PATH } from '../content/path';

interface UserRow {
  id: string;
  name: string;
  isBot: boolean;
  bannedUntil: Date | null;
  handle: string;
  email: string;
}

/**
 * An in-memory database that evaluates the where-shapes `friends.server.ts` sends, so who appears
 * (mutual follows, the friends switch, bans, tombstones, bots, blocks) is tested by what it returns.
 */
const h = vi.hoisted(() => {
  const users = new Map<string, UserRow>();
  const social = new Map<
    string,
    {
      board: boolean;
      friends: boolean;
    }
  >();
  const follows: {
    followerId: string;
    followingId: string;
  }[] = [];
  const profiles = new Map<
    string,
    {
      instrument: string;
      input: string;
      latencyMs: number;
    }
  >();
  const lessons: {
    userId: string;
    lessonId: string;
    stars: number;
  }[] = [];
  const daily: {
    userId: string;
    date: string;
    score: number | null;
  }[] = [];
  const songs: {
    userId: string;
    songId: string;
    mode: string;
    bestScore: number;
  }[] = [];
  const cache = new Map<string, unknown>();
  const blocked = {
    fail: false,
    pairs: [] as [string, string][],
  };
  const inIds = (
    w: {
      userId: {
        in: string[];
      };
    },
    id: string,
  ) => w.userId.in.includes(id);

  type UserWhere = {
    id: {
      in: string[];
    };
    isBot?: boolean;
    OR?: (
      | {
          bannedUntil: null;
        }
      | {
          bannedUntil: {
            lt: Date;
          };
        }
    )[];
    musicSocial?: {
      is: {
        friends?: boolean;
      };
    };
  };
  const userOk = (u: UserRow, w: UserWhere) => {
    if (!w.id.in.includes(u.id)) return false;
    if (w.isBot !== undefined && u.isBot !== w.isBot) return false;
    if (
      w.OR &&
      !w.OR.some((o) =>
        o.bannedUntil === null ? u.bannedUntil === null : u.bannedUntil !== null && u.bannedUntil < o.bannedUntil.lt,
      )
    )
      return false;
    if (w.musicSocial) {
      const s = social.get(u.id);
      if (!s) return false;
      if (w.musicSocial.is.friends !== undefined && s.friends !== w.musicSocial.is.friends) return false;
    }
    return true;
  };

  return {
    users,
    social,
    follows,
    profiles,
    lessons,
    daily,
    songs,
    cache,
    blocked,
    prisma: {
      musicSocial: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: string;
            };
          }) => social.get(where.userId) ?? null,
        ),
      },
      user: {
        findMany: vi.fn(async ({ where }: { where: UserWhere }) =>
          [...users.values()]
            .filter((u) => userOk(u, where))
            .map((u) => ({
              ...u,
              image: `https://img.example/${u.id}.png`,
              username: null,
              isVerified: false,
              isAdmin: false,
              profile: null,
              inventory: [],
            })),
        ),
      },
      musicLearnProfile: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: {
                in: string[];
              };
            };
          }) =>
            [...profiles.entries()]
              .filter(([id]) => inIds(where, id))
              .map(([userId, p]) => ({
                userId,
                ...p,
              })),
        ),
      },
      musicLearnLessonProgress: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: {
                in: string[];
              };
              stars: {
                gte: number;
              };
            };
          }) => lessons.filter((l) => inIds(where, l.userId) && l.stars >= where.stars.gte),
        ),
      },
      musicSprintDaily: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: {
                in: string[];
              };
              date: {
                gte: string;
              };
            };
          }) => daily.filter((d) => inIds(where, d.userId) && d.score !== null && d.date >= where.date.gte),
        ),
      },
      musicSongBest: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: {
                in: string[];
              };
            };
          }) => songs.filter((s) => inIds(where, s.userId)),
        ),
      },
      follow: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              followerId: {
                in: string[];
              };
              followingId: string;
            };
          }) =>
            follows
              .filter((f) => where.followerId.in.includes(f.followerId) && f.followingId === where.followingId)
              .map((f) => ({
                followerId: f.followerId,
              })),
        ),
      },
    },
    cached: vi.fn(async (key: string, _ttl: number, loader: () => Promise<unknown>) => {
      if (!cache.has(key)) cache.set(key, JSON.parse(JSON.stringify(await loader())));
      return cache.get(key);
    }),
    getBlockedAuthorIds: vi.fn(async (viewer: string) => {
      if (blocked.fail) throw new Error('db down');
      return blocked.pairs.flatMap(([a, b]) => (a === viewer ? [b] : b === viewer ? [a] : []));
    }),
    getFollowingIds: vi.fn(async (viewer: string) =>
      follows.filter((f) => f.followerId === viewer).map((f) => f.followingId),
    ),
  };
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: h.prisma,
}));
vi.mock('@/lib/cached.server', () => ({
  cached: h.cached,
  invalidateCached: vi.fn(),
}));
vi.mock('@/lib/moderation.server', () => ({
  getBlockedAuthorIds: h.getBlockedAuthorIds,
}));
vi.mock('@/lib/social/follow-graph.server', () => ({
  getFollowingIds: h.getFollowingIds,
}));
vi.mock('@/lib/communities/access.server', () => ({
  getRole: vi.fn(),
}));

import { loadFriendsProgress } from './friends.server';

const NOW = Date.UTC(2026, 10, 16, 12);
const TODAY = '2026-11-16';

function learner(
  id: string,
  opts: {
    friends?: boolean;
    board?: boolean;
    isBot?: boolean;
    bannedUntil?: Date | null;
    instrument?: string;
  } = {},
) {
  h.users.set(id, {
    id,
    name: `Name ${id}`,
    isBot: opts.isBot ?? false,
    bannedUntil: opts.bannedUntil ?? null,
    handle: `handle-${id}`,
    email: `${id}@example.com`,
  });
  if (opts.friends !== undefined || opts.board !== undefined)
    h.social.set(id, {
      board: opts.board ?? false,
      friends: opts.friends ?? false,
    });
  h.profiles.set(id, {
    instrument: opts.instrument ?? 'piano',
    input: 'midi',
    latencyMs: 37,
  });
}
const follow = (a: string, b: string) =>
  h.follows.push({
    followerId: a,
    followingId: b,
  });
const mutual = (a: string, b: string) => {
  follow(a, b);
  follow(b, a);
};

beforeEach(() => {
  h.users.clear();
  h.social.clear();
  h.follows.length = 0;
  h.profiles.clear();
  h.lessons.length = 0;
  h.daily.length = 0;
  h.songs.length = 0;
  h.cache.clear();
  h.blocked.fail = false;
  h.blocked.pairs = [];
  learner('me', {
    friends: true,
  });
});

describe('loadFriendsProgress', () => {
  it('is empty while the viewer’s own friends switch is off (no one-sided watching)', async () => {
    h.social.set('me', {
      board: true,
      friends: false,
    });
    learner('ann', {
      friends: true,
    });
    mutual('me', 'ann');
    expect(await loadFriendsProgress('me', 100, NOW)).toEqual({
      optedIn: false,
      total: 0,
      friends: [],
    });
  });

  it('lists only mutual follows whose friends switch is on', async () => {
    learner('ann', {
      friends: true,
    });
    learner('one-way', {
      friends: true,
    });
    learner('board-only', {
      board: true,
    });
    learner('no-row');
    mutual('me', 'ann');
    follow('one-way', 'me');
    mutual('me', 'board-only');
    mutual('me', 'no-row');
    const res = await loadFriendsProgress('me', 100, NOW);
    expect(res.optedIn).toBe(true);
    expect(res.friends.map((f) => f.user.name)).toEqual(['Name ann']);
  });

  it('leaves out banned, deleted (tombstone) and bot accounts', async () => {
    for (const [id, opts] of [
      [
        'banned',
        {
          bannedUntil: new Date(NOW + 86_400_000),
        },
      ],
      [
        'tomb',
        {
          bannedUntil: new Date('9999-12-31T00:00:00Z'),
        },
      ],
      [
        'bot',
        {
          isBot: true,
        },
      ],
      [
        'lapsed',
        {
          bannedUntil: new Date(NOW - 1000),
        },
      ],
    ] as const) {
      learner(id, {
        friends: true,
        ...opts,
      });
      mutual('me', id);
    }
    const res = await loadFriendsProgress('me', 100, NOW);
    expect(res.friends.map((f) => f.user.name)).toEqual(['Name lapsed']);
  });

  it('applies blocks both ways, even while the cached mutuals still hold the pair', async () => {
    learner('ann', {
      friends: true,
    });
    learner('ben', {
      friends: true,
    });
    mutual('me', 'ann');
    mutual('me', 'ben');
    await loadFriendsProgress('me', 100, NOW); // caches the mutuals
    h.blocked.pairs = [
      ['me', 'ann'],
      ['ben', 'me'],
    ];
    expect((await loadFriendsProgress('me', 100, NOW)).friends).toEqual([]);
  });

  it('fails closed when the block lookup fails', async () => {
    learner('ann', {
      friends: true,
    });
    mutual('me', 'ann');
    h.blocked.fail = true;
    await expect(loadFriendsProgress('me', 100, NOW)).rejects.toThrow();
  });

  it('carries the Daily streak, finished units on the friend’s own path and song bests', async () => {
    learner('pia', {
      friends: true,
    });
    learner('sin', {
      friends: true,
      instrument: 'voice',
    });
    mutual('me', 'pia');
    mutual('me', 'sin');
    for (const l of PATH[0]!.lessons)
      h.lessons.push({
        userId: 'pia',
        lessonId: l.id,
        stars: 2,
      });
    h.lessons.push({
      userId: 'pia',
      lessonId: PATH[1]!.lessons[0]!.id,
      stars: 0,
    });
    for (const l of VOICE_PATH[0]!.lessons)
      h.lessons.push({
        userId: 'sin',
        lessonId: l.id,
        stars: 1,
      });
    h.daily.push(
      {
        userId: 'pia',
        date: '2026-11-15',
        score: 80,
      },
      {
        userId: 'pia',
        date: '2026-11-14',
        score: 70,
      },
      {
        userId: 'sin',
        date: TODAY,
        score: 90,
      },
      {
        userId: 'sin',
        date: '2026-11-15',
        score: null,
      },
    );
    h.songs.push(
      {
        userId: 'pia',
        songId: 'ode-to-joy',
        mode: 'play',
        bestScore: 98,
      },
      {
        userId: 'pia',
        songId: 'gone-song',
        mode: 'play',
        bestScore: 50,
      },
    );
    const res = await loadFriendsProgress('me', 100, NOW);
    expect(res.friends.map((f) => f.user.name)).toEqual(['Name sin', 'Name pia']);
    const [sin, pia] = res.friends;
    expect(sin!.daily).toEqual({
      streak: 1,
      today: true,
    });
    expect(sin!.units).toEqual({
      finished: 1,
      total: VOICE_PATH.length,
      last: VOICE_PATH[0]!.title,
    });
    expect(pia!.daily).toEqual({
      streak: 2,
      today: false,
    });
    expect(pia!.units).toEqual({
      finished: 1,
      total: PATH.length,
      last: PATH[0]!.title,
    });
    expect(pia!.songs).toEqual([
      {
        songId: 'ode-to-joy',
        title: 'Ode to Joy',
        composer: 'Ludwig van Beethoven',
        mode: 'play',
        bestScore: 98,
      },
    ]);
  });

  it('honours the limit and counts every sharing friend', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      learner(id, {
        friends: true,
      });
      mutual('me', id);
    }
    const res = await loadFriendsProgress('me', 3, NOW);
    expect(res.friends).toHaveLength(3);
    expect(res.total).toBe(5);
  });

  it('never sends an id, handle, e-mail, instrument, input or latency', async () => {
    learner('ann', {
      friends: true,
    });
    mutual('me', 'ann');
    const text = JSON.stringify(await loadFriendsProgress('me', 100, NOW));
    for (const leak of ['"ann"', 'handle-ann', 'ann@example.com', 'piano', 'midi', 'latency', '"id"', 'userId'])
      expect(text).not.toContain(leak);
  });
});
