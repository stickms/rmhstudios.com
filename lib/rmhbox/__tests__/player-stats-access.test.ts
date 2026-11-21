/**
 * Who may see an RMHBox player's record (sprint 04 #12).
 *
 * The record follows `User.playtimePrivacy`: private is owner-only, followers-only
 * refuses a non-follower, public is for any signed-in viewer, and a signed-out
 * visitor gets only the totals of a public record. A blocked pair or a banned
 * member is a 404, never "private". The stats endpoint and the history endpoint's
 * `userId` filter share the one decision. Prisma is a small in-memory fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

interface UserRow {
  id: string;
  name: string;
  privacy: string;
  bannedUntil: Date | null;
}

const db = vi.hoisted(() => ({
  viewer: null as string | null,
  admins: new Set<string>(),
  users: new Map<string, { id: string; name: string; privacy: string; bannedUntil: Date | null }>(),
  follows: [] as { followerId: string; followingId: string }[],
  blocks: [] as { a: string; b: string }[],
  profiles: new Map<string, Record<string, unknown>>(),
  matchPlayers: [] as Record<string, unknown>[],
  matches: [] as Record<string, unknown>[],
  matchPlayerQueries: [] as Record<string, unknown>[],
  matchQueries: [] as Record<string, unknown>[],
  detail: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () =>
        db.viewer
          ? { user: { id: db.viewer, isAdmin: db.admins.has(db.viewer) }, session: { id: 's' } }
          : null,
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/messages/send.server', () => ({
  isBlockedPair: async (a: string, b: string) =>
    a !== b && db.blocks.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = db.users.get(where.id);
        if (!u) return null;
        return {
          id: u.id,
          name: u.name,
          image: null,
          username: null,
          handle: u.id,
          isVerified: false,
          isAdmin: false,
          isBot: false,
          profile: null,
          playtimePrivacy: u.privacy,
          bannedUntil: u.bannedUntil,
        };
      },
    },
    follow: {
      findFirst: async ({ where }: { where: { followerId: string; followingId: string } }) =>
        db.follows.some((f) => f.followerId === where.followerId && f.followingId === where.followingId)
          ? { id: 'f' }
          : null,
    },
    rMHboxProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) => db.profiles.get(where.userId) ?? null,
    },
    rMHboxMatchPlayer: {
      findMany: async (q: Record<string, unknown>) => {
        db.matchPlayerQueries.push(q);
        return db.matchPlayers;
      },
    },
    rMHboxMatch: {
      findMany: async (q: Record<string, unknown>) => {
        db.matchQueries.push(q);
        return db.matches;
      },
      count: async () => db.matches.length,
      findUnique: async () => db.detail,
    },
  },
}));

const { route: statsRoute } = await import('@/lib/rmhbox/api/rmhbox.stats.server');
const { route: historyRoute } = await import('@/lib/rmhbox/api/rmhbox.history.server');
const statsGET = handlersOf(statsRoute).GET!;
const historyGET = handlersOf(historyRoute).GET!;

/** The parts of a response these tests read; the endpoint's own types are checked by its contract. */
interface Json {
  access: string;
  player: unknown;
  global: { totalGamesPlayed: number } | null;
  minigames: Record<string, { averageRank: number | null }>;
  recentMatches: Array<{ matchId: string; rank: number; playerCount: number }>;
  matches: unknown[];
  total: number;
  match: { gameLog: unknown; results: unknown; players: unknown[] };
}

const addUser = (id: string, privacy = 'public', extra: Partial<UserRow> = {}) =>
  db.users.set(id, { id, name: `Name ${id}`, privacy, bannedUntil: null, ...extra });

const call = async (
  h: typeof statsGET,
  qs: string,
): Promise<{ status: number; body: Json }> => {
  const res = await h({
    request: new Request(`http://t/api/rmhbox/x?${qs}`, {
      headers: db.viewer ? { cookie: 'better-auth.session_token=t' } : {},
    }),
    params: {},
  });
  return { status: res.status, body: (await res.json()) as Json };
};
const stats = (target: string, extra = '') => call(statsGET, `userId=${target}${extra}`);
const history = (qs: string) => call(historyGET, qs);

const matchRow = {
  rank: 2,
  score: 150,
  wasWinner: false,
  match: { id: 'm1', minigameId: 'rhyme-time', startedAt: new Date('2026-11-01T10:00:00Z'), durationMs: 90_000, playerCount: 6 },
};

beforeEach(() => {
  db.viewer = null;
  db.admins.clear();
  db.users.clear();
  db.follows = [];
  db.blocks = [];
  db.profiles.clear();
  db.matchPlayers = [matchRow];
  db.matches = [];
  db.matchPlayerQueries = [];
  db.matchQueries = [];
  db.detail = null;
  addUser('owner');
  db.profiles.set('owner', {
    totalGamesPlayed: 10,
    totalWins: 4,
    totalScore: 1500,
    totalPlayTimeMs: 3_600_000,
    currentWinStreak: 2,
    bestWinStreak: 5,
    minigameStats: { 'rhyme-time': { gamesPlayed: 10, wins: 4, bestScore: 200, totalScore: 1500, totalRank: 25, averageRank: 2.5 } },
  });
});

describe('GET /api/rmhbox/stats', () => {
  it('private: the owner sees the record, anyone else only that it is private', async () => {
    addUser('owner', 'private');
    db.viewer = 'owner';
    const own = await stats('owner');
    expect(own.status).toBe(200);
    expect(own.body.access).toBe('full');
    expect(own.body.global?.totalGamesPlayed).toBe(10);
    expect(own.body.recentMatches).toHaveLength(1);

    db.viewer = 'other';
    addUser('other');
    const other = await stats('owner');
    expect(other.status).toBe(200);
    expect(other.body).toEqual({
      access: 'private',
      player: { id: 'owner', name: 'Name owner', image: null },
      global: null,
      minigames: {},
      recentMatches: [],
    });
    expect(db.matchPlayerQueries).toHaveLength(1); // only the owner's own read touched matches
  });

  it('followers: a follower sees it, a non-follower does not', async () => {
    addUser('owner', 'followers');
    addUser('fan');
    addUser('stranger');
    db.follows.push({ followerId: 'fan', followingId: 'owner' });
    db.viewer = 'fan';
    expect((await stats('owner')).body.access).toBe('full');
    db.viewer = 'stranger';
    const refused = await stats('owner');
    expect(refused.body.access).toBe('private');
    expect(refused.body.global).toBeNull();
  });

  it('public: any signed-in viewer sees all of it', async () => {
    addUser('anyone');
    db.viewer = 'anyone';
    const r = await stats('owner');
    expect(r.body.access).toBe('full');
    expect(r.body.minigames['rhyme-time'].averageRank).toBe(2.5);
    expect(r.body.recentMatches[0]).toMatchObject({ matchId: 'm1', rank: 2, playerCount: 6 });
  });

  it('signed out: totals of a public record only, nothing of a narrower one', async () => {
    const pub = await stats('owner');
    expect(pub.body.access).toBe('totals');
    expect(pub.body.global?.totalGamesPlayed).toBe(10);
    expect(pub.body.minigames).toEqual({});
    expect(pub.body.recentMatches).toEqual([]);
    expect(db.matchPlayerQueries).toHaveLength(0);

    for (const privacy of ['followers', 'private']) {
      addUser('owner', privacy);
      const r = await stats('owner');
      expect(r.body.access).toBe('private');
      expect(r.body.global).toBeNull();
    }
  });

  it('a blocked pair, in either direction, is a 404', async () => {
    addUser('v');
    db.viewer = 'v';
    db.blocks.push({ a: 'v', b: 'owner' });
    expect((await stats('owner')).status).toBe(404);
    db.blocks = [{ a: 'owner', b: 'v' }];
    expect((await stats('owner')).status).toBe(404);
  });

  it('a banned member, and a banned viewer, read as not found', async () => {
    addUser('v');
    db.viewer = 'v';
    addUser('owner', 'public', { bannedUntil: new Date(Date.now() + 86_400_000) });
    expect((await stats('owner')).status).toBe(404);
    addUser('owner');
    addUser('v', 'public', { bannedUntil: new Date(Date.now() + 86_400_000) });
    expect((await stats('owner')).status).toBe(404);
    // an expired ban no longer counts
    addUser('v', 'public', { bannedUntil: new Date(Date.now() - 1000) });
    expect((await stats('owner')).status).toBe(200);
  });

  it('an unknown player is a 404, and an unrecognised stored setting fails closed', async () => {
    expect((await stats('nobody')).status).toBe(404);
    addUser('owner', 'friends-of-friends');
    addUser('v');
    db.viewer = 'v';
    expect((await stats('owner')).body.access).toBe('private');
  });

  it('a member with no profile has no record rather than an error', async () => {
    addUser('fresh');
    db.viewer = 'fresh';
    const r = await stats('fresh');
    expect(r.status).toBe(200);
    expect(r.body.global).toBeNull();
    expect(r.body.recentMatches).toEqual([]);
  });

  it('validates the query: userId is required, paging is bounded, minigame narrows the matches', async () => {
    expect((await call(statsGET, '')).status).toBe(400);
    expect((await stats('owner', '&offset=-1')).status).toBe(400);
    db.viewer = 'owner';
    await stats('owner', '&limit=999&offset=5&minigame=rhyme-time');
    const q = db.matchPlayerQueries.at(-1)!;
    expect(q).toMatchObject({
      where: { userId: 'owner', match: { minigameId: 'rhyme-time' } },
      take: 50,
      skip: 5,
    });
    await stats('owner');
    expect(db.matchPlayerQueries.at(-1)).toMatchObject({ take: 20, skip: 0 });
  });
});

describe('GET /api/rmhbox/history', () => {
  const matchOf = (id: string) => ({
    id,
    minigameId: 'rhyme-time',
    lobbyId: 'L',
    startedAt: new Date('2026-11-01T10:00:00Z'),
    endedAt: null,
    durationMs: 1000,
    winnerUserId: 'owner',
    playerCount: 2,
    players: [{ userId: 'owner', userName: 'Name owner', rank: 1, score: 5, wasWinner: true }],
  });

  it("the list for a minigame stays public, signed out too", async () => {
    addUser('owner', 'private');
    db.matches = [matchOf('m1')];
    const r = await history('minigame=rhyme-time');
    expect(r.status).toBe(200);
    expect(r.body.matches).toHaveLength(1);
    expect(r.body.total).toBe(1);
    expect(db.matchQueries.at(-1)!.where).toEqual({ minigameId: 'rhyme-time' });
  });

  it('the userId filter follows the same rule as the stats page', async () => {
    db.matches = [matchOf('m1')];
    addUser('other');
    addUser('fan');

    // public: signed in sees it, signed out does not (totals only)
    db.viewer = 'other';
    expect((await history('userId=owner')).body.matches).toHaveLength(1);
    expect(db.matchQueries.at(-1)!.where).toEqual({ players: { some: { userId: 'owner' } } });
    db.viewer = null;
    expect((await history('userId=owner')).body).toEqual({ matches: [], total: 0, limit: 20, offset: 0 });

    // followers: only a follower
    addUser('owner', 'followers');
    db.follows.push({ followerId: 'fan', followingId: 'owner' });
    db.viewer = 'other';
    expect((await history('userId=owner')).body.matches).toEqual([]);
    db.viewer = 'fan';
    expect((await history('userId=owner')).body.matches).toHaveLength(1);

    // private: only the owner
    addUser('owner', 'private');
    db.viewer = 'fan';
    expect((await history('userId=owner')).body.matches).toEqual([]);
    db.viewer = 'owner';
    expect((await history('userId=owner')).body.matches).toHaveLength(1);
  });

  it('a blocked pair gets the empty list, indistinguishable from no matches', async () => {
    db.matches = [matchOf('m1')];
    addUser('v');
    db.viewer = 'v';
    db.blocks.push({ a: 'owner', b: 'v' });
    const queriesBefore = db.matchQueries.length;
    const r = await history('userId=owner&minigame=rhyme-time');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ matches: [], total: 0, limit: 20, offset: 0 });
    expect(db.matchQueries.length).toBe(queriesBefore);
  });

  it('clamps an oversized limit to 50 and refuses a negative offset', async () => {
    await history('limit=200');
    expect(db.matchQueries.at(-1)).toMatchObject({ take: 50, skip: 0 });
    expect((await history('offset=-3')).status).toBe(400);
  });

  describe('?matchId (one match)', () => {
    const detail = () => ({
      ...matchOf('m1'),
      gameLog: { rounds: [1] },
      results: [{ userId: 'owner' }],
      players: [
        { userId: 'owner', userName: 'Name owner', rank: 1, score: 5, wasWinner: true, stats: {} },
        { userId: 'p2', userName: 'P2', rank: 2, score: 3, wasWinner: false, stats: {} },
      ],
    });

    it('is a 404 for an unknown match', async () => {
      expect((await history('matchId=nope')).status).toBe(404);
    });

    it('shows the log only to a player of the match and to admins', async () => {
      db.detail = detail();
      expect((await history('matchId=m1')).body.match.gameLog).toBeNull();
      db.viewer = 'stranger';
      expect((await history('matchId=m1')).body.match.gameLog).toBeNull();
      expect((await history('matchId=m1')).body.match.players).toHaveLength(2);
      db.viewer = 'p2';
      expect((await history('matchId=m1')).body.match.gameLog).toEqual({ rounds: [1] });
      db.viewer = 'admin';
      db.admins.add('admin');
      expect((await history('matchId=m1')).body.match.results).toEqual([{ userId: 'owner' }]);
    });
  });
});
