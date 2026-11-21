/**
 * Phase 4 §3 — REST API Endpoint Tests
 *
 * Verifies the leaderboard, stats and history API endpoints using mock Prisma data.
 * Tests rate limiting, parameter parsing, and response shapes. Stats and history are
 * contract-bound modules (`lib/rmhbox/api/`) that follow each member's game-activity
 * privacy, so their cases also cover the access rules; the fuller access matrix lives
 * in lib/rmhbox/__tests__/player-stats-access.test.ts.
 *
 * Environment-agnostic: uses mocked database, no real HTTP calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlersOf } from '../../../lib/__tests__/api-handlers-of';

// ─── Mock modules before imports ────────────────────────────────

// Mock rate-limit to always allow
vi.mock('../../../lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ allowed: true, retryAfter: 0 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

// Mock auth to return null session by default
vi.mock('../../../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

// Mock user-display
vi.mock('../../../lib/user-display', () => ({
  userDisplaySelect: { id: true, name: true, image: true, handle: true },
  resolveUserDisplay: vi.fn((user: any) => ({
    name: user?.name ?? null,
    image: user?.image ?? null,
  })),
}));

// Mock @tanstack/react-router to stub createFileRoute
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => ({
    options: opts,
  }),
}));

// The registered stats / history endpoints rate limit through the async limiter.
const mockLimited = vi.hoisted(() => ({ on: false }));
vi.mock('../../../lib/rate-limit.server', () => ({
  withRateLimitAsync: async () =>
    mockLimited.on ? Response.json({ error: 'Too many requests', retryAfter: 15 }, { status: 429 }) : null,
}));
vi.mock('../../../lib/messages/send.server', () => ({ isBlockedPair: async () => false }));

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  follow: { findFirst: vi.fn().mockResolvedValue(null) },
  rMHboxProfile: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
  },
  rMHboxMatch: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
  },
  rMHboxMatchPlayer: {
    findMany: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockResolvedValue([]),
  },
};

vi.mock('@/lib/prisma.server', () => ({
  prisma: mockPrisma,
}));

// Import rate-limit mock for manipulation
import { rateLimit, type RateLimitResult } from '../../../lib/rate-limit';
import { auth } from '../../../lib/auth';
const mockRateLimit = vi.mocked(rateLimit);

// Build a full RateLimitResult. The handlers under test only read
// `allowed`/`retryAfter`, but the mocked signature requires the additive
// header fields (limit/remaining/reset), so fill them with representative values.
const rl = (allowed: boolean, retryAfter: number): RateLimitResult => ({
  allowed,
  retryAfter,
  limit: 100,
  remaining: allowed ? 99 : 0,
  reset: 0,
});

// ─── Helper to extract GET handler from TanStack route ──────────

async function getHandler(modulePath: string) {
  const mod = await import(modulePath);
  // createFileRoute returns a function that receives options and returns { options }
  // The Route export is the result of calling that function
  const route = mod.Route;
  return route.options.server.handlers.GET as (ctx: { request: Request }) => Promise<Response>;
}

describe('REST API — Leaderboard (§3.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue(rl(true, 0));
  });

  it('should return 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue(rl(false, 30));
    const GET = await getHandler('../../../app/routes/api/rmhbox/leaderboard');
    const req = new Request('http://localhost/api/rmhbox/leaderboard?period=all-time&metric=score');
    const res = await GET({ request: req });
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.retryAfter).toBe(30);
  });

  it('should return empty entries when no profiles exist', async () => {
    const GET = await getHandler('../../../app/routes/api/rmhbox/leaderboard');
    const req = new Request('http://localhost/api/rmhbox/leaderboard?period=all-time&metric=score');
    const res = await GET({ request: req });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries).toEqual([]);
    expect(data.period).toBe('all-time');
    expect(data.metric).toBe('score');
  });

  it('should return leaderboard entries sorted by score', async () => {
    mockPrisma.rMHboxProfile.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        totalScore: 1000,
        totalWins: 5,
        totalGamesPlayed: 10,
        user: { name: 'Alice', image: null },
      },
      {
        userId: 'user-2',
        totalScore: 800,
        totalWins: 3,
        totalGamesPlayed: 8,
        user: { name: 'Bob', image: null },
      },
    ]);
    mockPrisma.rMHboxProfile.count.mockResolvedValue(2);

    const GET = await getHandler('../../../app/routes/api/rmhbox/leaderboard');
    const req = new Request('http://localhost/api/rmhbox/leaderboard?period=all-time&metric=score');
    const res = await GET({ request: req });
    const data = await res.json();

    expect(data.entries).toHaveLength(2);
    expect(data.entries[0].rank).toBe(1);
    expect(data.entries[0].userName).toBe('Alice');
    expect(data.entries[0].value).toBe(1000);
    expect(data.total).toBe(2);
  });

  it('should clamp limit parameter to max 50', async () => {
    const GET = await getHandler('../../../app/routes/api/rmhbox/leaderboard');
    const req = new Request('http://localhost/api/rmhbox/leaderboard?limit=100');
    await GET({ request: req });

    // findMany should be called with take: 50 (clamped)
    expect(mockPrisma.rMHboxProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('should default metric to score', async () => {
    const GET = await getHandler('../../../app/routes/api/rmhbox/leaderboard');
    const req = new Request('http://localhost/api/rmhbox/leaderboard');
    const res = await GET({ request: req });
    const data = await res.json();
    expect(data.metric).toBe('score');
  });
});

// ─── Stats and history: the registered endpoints ────────────────

const { route: statsRoute } = await import('../../../lib/rmhbox/api/rmhbox.stats.server');
const { route: historyRoute } = await import('../../../lib/rmhbox/api/rmhbox.history.server');
const statsGET = handlersOf(statsRoute).GET!;
const historyGET = handlersOf(historyRoute).GET!;

const getSession = vi.mocked(auth.api.getSession) as unknown as ReturnType<typeof vi.fn>;
const signIn = (id: string | null) =>
  getSession.mockResolvedValue(id ? { user: { id, isAdmin: false }, session: { id: 's' } } : null);
const publicUser = (id: string, name: string) => ({
  id,
  name,
  image: null,
  username: null,
  handle: id,
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: null,
  playtimePrivacy: 'public',
  bannedUntil: null,
});
const req = (path: string) => ({
  request: new Request(`http://localhost${path}`, { headers: { cookie: 'better-auth.session_token=t' } }),
  params: {},
});

describe('REST API — Stats (§3.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimited.on = false;
    signIn('viewer');
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'user-alice' ? publicUser('user-alice', 'Alice') : where.id === 'viewer' ? publicUser('viewer', 'V') : null,
    );
  });

  it('should return 400 when userId is missing', async () => {
    const res = await statsGET(req('/api/rmhbox/stats'));
    expect(res.status).toBe(400);
  });

  it('should return 404 for an unknown user (was: an empty record)', async () => {
    const res = await statsGET(req('/api/rmhbox/stats?userId=unknown'));
    expect(res.status).toBe(404);
  });

  it('should return empty stats for a member with no profile', async () => {
    const res = await statsGET(req('/api/rmhbox/stats?userId=user-alice'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.global).toBeNull();
    expect(data.recentMatches).toEqual([]);
  });

  it('should return aggregated stats for existing user', async () => {
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-alice',
      totalGamesPlayed: 10,
      totalWins: 4,
      totalScore: 1500,
      totalPlayTimeMs: 60000,
      currentWinStreak: 2,
      bestWinStreak: 5,
      minigameStats: {
        'rhyme-time': { gamesPlayed: 5, wins: 3, bestScore: 200, totalScore: 800 },
        'emoji-cinema': { gamesPlayed: 5, wins: 1, bestScore: 150, totalScore: 700 },
      },
    });
    mockPrisma.rMHboxMatchPlayer.findMany.mockResolvedValue([]);

    const res = await statsGET(req('/api/rmhbox/stats?userId=user-alice'));
    const data = await res.json();

    expect(data.access).toBe('full');
    expect(data.global.totalGamesPlayed).toBe(10);
    expect(data.global.winRate).toBe(40);
    expect(data.global.favoriteMinigame).toBe('rhyme-time');
    expect(data.minigames).toHaveProperty('rhyme-time');
    expect(data.minigames).toHaveProperty('emoji-cinema');
  });

  it('should return 429 when rate limited', async () => {
    mockLimited.on = true;
    const res = await statsGET(req('/api/rmhbox/stats?userId=test'));
    expect(res.status).toBe(429);
  });
});

describe('REST API — History (§3.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimited.on = false;
    signIn('viewer');
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'user-alice' ? publicUser('user-alice', 'Alice') : where.id === 'viewer' ? publicUser('viewer', 'V') : null,
    );
  });

  it('should return 404 for unknown matchId', async () => {
    mockPrisma.rMHboxMatch.findUnique.mockResolvedValue(null);
    const res = await historyGET(req('/api/rmhbox/history?matchId=nonexistent'));
    expect(res.status).toBe(404);
  });

  const detail = () => ({
    id: 'match-1',
    minigameId: 'rhyme-time',
    lobbyId: 'LOBBY01',
    startedAt: new Date('2025-01-01'),
    endedAt: new Date('2025-01-01T00:05:00'),
    durationMs: 300000,
    winnerUserId: 'user-alice',
    playerCount: 2,
    gameLog: { events: [] },
    results: [],
    players: [
      { userId: 'user-alice', userName: 'Alice', rank: 1, score: 200, wasWinner: true, stats: {} },
      { userId: 'user-bob', userName: 'Bob', rank: 2, score: 100, wasWinner: false, stats: {} },
    ],
  });

  it('should return match detail when matchId is provided (the log to a player of the match)', async () => {
    mockPrisma.rMHboxMatch.findUnique.mockResolvedValue(detail());
    signIn('user-alice');

    const res = await historyGET(req('/api/rmhbox/history?matchId=match-1'));
    const data = await res.json();

    expect(data.match.id).toBe('match-1');
    expect(data.match.minigameId).toBe('rhyme-time');
    expect(data.match.players).toHaveLength(2);
    expect(data.match.gameLog).toEqual({ events: [] });
  });

  it('should withhold the game log from anyone who did not play the match', async () => {
    mockPrisma.rMHboxMatch.findUnique.mockResolvedValue(detail());
    const res = await historyGET(req('/api/rmhbox/history?matchId=match-1'));
    const data = await res.json();
    expect(data.match.players).toHaveLength(2);
    expect(data.match.gameLog).toBeNull();
    expect(data.match.results).toBeNull();
  });

  it('should return paginated match list when userId is provided', async () => {
    mockPrisma.rMHboxMatch.findMany.mockResolvedValue([
      {
        id: 'match-1',
        minigameId: 'rhyme-time',
        lobbyId: 'L1',
        startedAt: new Date(),
        endedAt: new Date(),
        durationMs: 5000,
        winnerUserId: 'user-alice',
        playerCount: 2,
        gameLog: null,
        players: [{ userId: 'user-alice', userName: 'Alice', rank: 1, score: 200, wasWinner: true }],
      },
    ]);
    mockPrisma.rMHboxMatch.count.mockResolvedValue(1);

    const res = await historyGET(req('/api/rmhbox/history?userId=user-alice'));
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.total).toBe(1);
  });

  it('should return an empty list, not the matches, when the player is not visible to the caller', async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'user-alice' ? { ...publicUser('user-alice', 'Alice'), playtimePrivacy: 'private' } : publicUser('viewer', 'V'),
    );
    mockPrisma.rMHboxMatch.count.mockResolvedValue(1);
    const res = await historyGET(req('/api/rmhbox/history?userId=user-alice'));
    const data = await res.json();
    expect(data.matches).toEqual([]);
    expect(data.total).toBe(0);
    expect(mockPrisma.rMHboxMatch.findMany).not.toHaveBeenCalled();
  });

  it('should clamp limit parameter to max 50', async () => {
    mockPrisma.rMHboxMatch.count.mockResolvedValue(0);
    await historyGET(req('/api/rmhbox/history?limit=200'));

    expect(mockPrisma.rMHboxMatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('should return 429 when rate limited', async () => {
    mockLimited.on = true;
    const res = await historyGET(req('/api/rmhbox/history'));
    expect(res.status).toBe(429);
  });
});
