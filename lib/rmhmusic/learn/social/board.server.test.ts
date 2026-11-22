import { beforeEach, describe, expect, it, vi } from 'vitest';

interface DailyRow {
  id: string;
  userId: string;
  date: string;
  score: number | null;
  avgMs: number | null;
  skipped: number;
  scoredAt: Date | null;
  ranked: boolean;
  unrankedReason: string | null;
  hiddenAt: Date | null;
}
interface UserRow {
  id: string;
  name: string;
  isBot: boolean;
  bannedUntil: Date | null;
  handle: string;
  email: string;
}

/**
 * An in-memory database that evaluates the where-shapes `board.server.ts` sends, so the filters
 * (consent, ranked, hidden, scored, bans, tombstones, bots) are tested by what they return.
 */
const h = vi.hoisted(() => {
  const daily: DailyRow[] = [];
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
  const cache = new Map<string, unknown>();
  const blocked = {
    fail: false,
    pairs: [] as [string, string][],
  };

  type SocialWhere = {
    board?: boolean;
    OR?: {
      board?: boolean;
      friends?: boolean;
    }[];
  };
  const socialOk = (userId: string, w: SocialWhere | undefined) => {
    if (!w) return true;
    const s = social.get(userId);
    if (!s) return false;
    if (w.board !== undefined && s.board !== w.board) return false;
    if (
      w.OR &&
      !w.OR.some(
        (o) => (o.board === undefined || s.board === o.board) && (o.friends === undefined || s.friends === o.friends),
      )
    )
      return false;
    return true;
  };
  type UserWhere = {
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
      is: SocialWhere;
    };
  };
  const userOk = (id: string, w: UserWhere | undefined) => {
    if (!w) return true;
    const u = users.get(id);
    if (!u) return false;
    if (w.isBot !== undefined && u.isBot !== w.isBot) return false;
    if (
      w.OR &&
      !w.OR.some((o) =>
        o.bannedUntil === null ? u.bannedUntil === null : u.bannedUntil !== null && u.bannedUntil < o.bannedUntil.lt,
      )
    )
      return false;
    if (w.musicSocial && !socialOk(id, w.musicSocial.is)) return false;
    return true;
  };

  return {
    daily,
    users,
    social,
    follows,
    cache,
    blocked,
    findMany: vi.fn(),
    prisma: {
      musicSprintDaily: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              date: string;
              score: {
                not: null;
              };
              ranked: boolean;
              hiddenAt: null;
              userId?: {
                in: string[];
              };
              user?: UserWhere;
            };
          }) =>
            daily
              .filter(
                (r) =>
                  r.date === where.date &&
                  r.score !== null &&
                  r.ranked === where.ranked &&
                  r.hiddenAt === null &&
                  (!where.userId || where.userId.in.includes(r.userId)) &&
                  userOk(r.userId, where.user),
              )
              .map((r) => ({
                ...r,
              })),
        ),
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId_date: {
                userId: string;
                date: string;
              };
            };
          }) => daily.find((r) => r.userId === where.userId_date.userId && r.date === where.userId_date.date) ?? null,
        ),
      },
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
        upsert: vi.fn(
          async ({
            where,
            update,
          }: {
            where: {
              userId: string;
            };
            update: {
              board?: boolean;
              friends?: boolean;
            };
          }) => {
            const next = {
              board: false,
              friends: false,
              ...social.get(where.userId),
              ...update,
            };
            social.set(where.userId, next);
            return next;
          },
        ),
      },
      user: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              id: {
                in: string[];
              };
            };
          }) =>
            where.id.in.flatMap((id) => {
              const u = users.get(id);
              return u
                ? [
                    {
                      ...u,
                      image: null,
                      username: null,
                      isVerified: false,
                      isAdmin: false,
                      profile: null,
                      inventory: [],
                    },
                  ]
                : [];
            }),
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
    invalidate: vi.fn(async (key: string) => {
      cache.delete(key);
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
  invalidateCached: h.invalidate,
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

// s05-01: game boards (scopeFilter) leave hidden and banned members off; none here.
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({
  leaderboardHiddenUserIds: async () => new Set<string>(),
}));

import { loadBoard } from './board.server';
import { setMusicSocial } from './prefs.server';

const DATE = '2026-11-16';
const NOW = Date.UTC(2026, 10, 16, 12);
let n = 0;

function learner(
  id: string,
  score: number | null,
  opts: Partial<DailyRow & UserRow> & {
    board?: boolean;
    friends?: boolean;
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
  if (opts.board !== undefined || opts.friends !== undefined) {
    h.social.set(id, {
      board: opts.board ?? false,
      friends: opts.friends ?? false,
    });
  }
  h.daily.push({
    id: `row-${id}`,
    userId: id,
    date: opts.date ?? DATE,
    score,
    avgMs: opts.avgMs ?? 800 + n++,
    skipped: opts.skipped ?? 0,
    scoredAt: score === null ? null : new Date(NOW - 60_000),
    ranked: opts.ranked ?? true,
    unrankedReason: opts.unrankedReason ?? null,
    hiddenAt: opts.hiddenAt ?? null,
  });
}
const mutual = (a: string, b: string) =>
  h.follows.push(
    {
      followerId: a,
      followingId: b,
    },
    {
      followerId: b,
      followingId: a,
    },
  );
// Rows carry no user id (the client has no use for one): a learner is known by their run's id.
const names = (
  rows: {
    rowId: string;
  }[],
) => rows.map((r) => r.rowId.replace(/^row-/, ''));

beforeEach(() => {
  h.daily.length = 0;
  h.users.clear();
  h.social.clear();
  h.follows.length = 0;
  h.cache.clear();
  h.blocked.fail = false;
  h.blocked.pairs = [];
  h.prisma.musicSprintDaily.findMany.mockClear();
  n = 0;
});

describe('the Everyone board', () => {
  it('shows only opted-in, ranked, unhidden, scored runs of learners who are not banned, deleted or bots', async () => {
    learner('ok', 90, {
      board: true,
    });
    learner('off', 99, {
      board: false,
      friends: true,
    });
    learner('none', 98);
    learner('hidden', 97, {
      board: true,
      hiddenAt: new Date(),
    });
    learner('unranked', 96, {
      board: true,
      ranked: false,
      unrankedReason: 'too-fast',
    });
    learner('unscored', null, {
      board: true,
    });
    learner('banned', 95, {
      board: true,
      bannedUntil: new Date(NOW + 86_400_000),
    });
    learner('ban-over', 80, {
      board: true,
      bannedUntil: new Date(NOW - 86_400_000),
    });
    learner('deleted', 94, {
      board: true,
      bannedUntil: new Date('9999-12-31T00:00:00Z'),
    });
    learner('bot', 93, {
      board: true,
      isBot: true,
    });
    learner('viewer', null);
    const b = await loadBoard('viewer', DATE, 'everyone', NOW);
    expect(names(b.rows)).toEqual(['ok', 'ban-over']);
    expect(b.total).toBe(2);
  });

  it('blocked learners are invisible both ways, with a gap in the ranks', async () => {
    learner('a', 99, {
      board: true,
    });
    learner('b', 95, {
      board: true,
    });
    learner('c', 90, {
      board: true,
    });
    h.blocked.pairs = [['c', 'b']];
    const asC = await loadBoard('c', DATE, 'everyone', NOW);
    expect(names(asC.rows)).toEqual(['a', 'c']);
    expect(asC.rows.map((r) => r.rank)).toEqual([1, 3]);
    expect(asC.me).toEqual({
      state: 'ranked',
      rank: 3,
      total: 3,
      score: 90,
    });
    const asB = await loadBoard('b', DATE, 'everyone', NOW);
    expect(names(asB.rows)).toEqual(['a', 'b']);
  });

  it('a failed block lookup fails the request (no fallback to "no blocks")', async () => {
    learner('a', 99, {
      board: true,
    });
    h.blocked.fail = true;
    await expect(loadBoard('a', DATE, 'everyone', NOW)).rejects.toThrow();
  });

  it('carries names and avatars only, and marks runs without chords', async () => {
    learner('mic', 90, {
      board: true,
      skipped: 10,
    });
    const b = await loadBoard('mic', DATE, 'everyone', NOW);
    const row = b.rows[0]!;
    expect(row).toMatchObject({
      rank: 1,
      score: 90,
      withoutChords: true,
      you: true,
      rowId: 'row-mic',
    });
    expect(Object.keys(row.user).sort()).toEqual(['image', 'name']);
    expect(JSON.stringify(b)).not.toMatch(/handle-|@example\.com/);
  });

  it("a private viewer sees where they would place, and is not on anyone else's board", async () => {
    learner('a', 99, {
      board: true,
    });
    learner('me', 95, {
      board: false,
    });
    learner('c', 90, {
      board: true,
    });
    const mine = await loadBoard('me', DATE, 'everyone', NOW);
    expect(mine.me).toEqual({
      state: 'private',
      rank: 2,
      total: 3,
      score: 95,
    });
    expect(names(mine.rows)).toEqual(['a', 'c']);
    const theirs = await loadBoard('c', DATE, 'everyone', NOW);
    expect(theirs.total).toBe(2);
  });

  it('caches the list per date and a switch change drops it at once', async () => {
    learner('a', 99, {
      board: true,
    });
    learner('me', 95, {
      board: false,
    });
    await loadBoard('a', DATE, 'everyone', NOW);
    await loadBoard('a', DATE, 'everyone', NOW);
    expect(h.prisma.musicSprintDaily.findMany).toHaveBeenCalledTimes(1);
    await setMusicSocial(
      'me',
      {
        board: true,
      },
      NOW,
    );
    const b = await loadBoard('a', DATE, 'everyone', NOW);
    expect(names(b.rows)).toEqual(['a', 'me']);
  });
});

describe('the Friends board', () => {
  it("needs the viewer's friends switch", async () => {
    learner('v', 90, {
      board: true,
      friends: false,
    });
    const b = await loadBoard('v', DATE, 'friends', NOW);
    expect(b).toMatchObject({
      rows: [],
      friendsOff: true,
    });
  });

  it('shows mutual follows with either switch on, plus the viewer, ranked among them', async () => {
    learner('v', 80, {
      friends: true,
    });
    learner('mutualBoard', 99, {
      board: true,
    });
    learner('mutualFriends', 85, {
      friends: true,
    });
    learner('mutualOff', 95, {});
    learner('oneWay', 98, {
      board: true,
      friends: true,
    });
    learner('stranger', 97, {
      board: true,
      friends: true,
    });
    mutual('v', 'mutualBoard');
    mutual('v', 'mutualFriends');
    mutual('v', 'mutualOff');
    h.follows.push({
      followerId: 'oneWay',
      followingId: 'v',
    });
    const b = await loadBoard('v', DATE, 'friends', NOW);
    expect(names(b.rows)).toEqual(['mutualBoard', 'mutualFriends', 'v']);
    expect(b.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(b.total).toBe(3);
    // The viewer's line is their place among friends, not on the Everyone board.
    expect(b.me).toEqual({
      state: 'ranked',
      rank: 3,
      total: 3,
      score: 80,
    });
  });
});
