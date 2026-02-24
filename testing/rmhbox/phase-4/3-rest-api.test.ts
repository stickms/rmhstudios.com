/**
 * Phase 4 §3 — REST API Endpoint Tests
 *
 * Verifies the leaderboard, stats, and history API endpoints
 * using mock Prisma data. Tests rate limiting, parameter parsing,
 * and response shapes.
 *
 * Environment-agnostic: uses mocked database, no real HTTP calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock Prisma
const mockPrisma = {
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

vi.mock('../../../lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Import rate-limit mock for manipulation
import { rateLimit } from '../../../lib/rate-limit';
const mockRateLimit = vi.mocked(rateLimit);

describe('REST API — Leaderboard (§3.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  });

  it('should return 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue({ allowed: false, retryAfter: 30 });
    const { GET } = await import('../../../app/api/rmhbox/leaderboard/route');
    const req = new Request('http://localhost/api/rmhbox/leaderboard?period=all-time&metric=score');
    const res = await GET(req as Parameters<typeof GET>[0]);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.retryAfter).toBe(30);
  });

  it('should return empty entries when no profiles exist', async () => {
    const { GET } = await import('../../../app/api/rmhbox/leaderboard/route');
    const req = new Request('http://localhost/api/rmhbox/leaderboard?period=all-time&metric=score');
    const res = await GET(req as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries).toEqual([]);
    expect(data.period).toBe('all-time');
    expect(data.metric).toBe('score');
  });

  it('should return leaderboard entries sorted by score', async () => {
    mockPrisma.rMHboxProfile.findMany.mockResolvedValue([
      { userId: 'user-1', totalScore: 1000, totalWins: 5, totalGamesPlayed: 10, user: { name: 'Alice', image: null } },
      { userId: 'user-2', totalScore: 800, totalWins: 3, totalGamesPlayed: 8, user: { name: 'Bob', image: null } },
    ]);
    mockPrisma.rMHboxProfile.count.mockResolvedValue(2);

    const { GET } = await import('../../../app/api/rmhbox/leaderboard/route');
    const req = new Request('http://localhost/api/rmhbox/leaderboard?period=all-time&metric=score');
    const res = await GET(req as Parameters<typeof GET>[0]);
    const data = await res.json();

    expect(data.entries).toHaveLength(2);
    expect(data.entries[0].rank).toBe(1);
    expect(data.entries[0].userName).toBe('Alice');
    expect(data.entries[0].value).toBe(1000);
    expect(data.total).toBe(2);
  });

  it('should clamp limit parameter to max 50', async () => {
    const { GET } = await import('../../../app/api/rmhbox/leaderboard/route');
    const req = new Request('http://localhost/api/rmhbox/leaderboard?limit=100');
    await GET(req as Parameters<typeof GET>[0]);

    // findMany should be called with take: 50 (clamped)
    expect(mockPrisma.rMHboxProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('should default metric to score', async () => {
    const { GET } = await import('../../../app/api/rmhbox/leaderboard/route');
    const req = new Request('http://localhost/api/rmhbox/leaderboard');
    const res = await GET(req as Parameters<typeof GET>[0]);
    const data = await res.json();
    expect(data.metric).toBe('score');
  });
});

describe('REST API — Stats (§3.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  });

  it('should return 400 when userId is missing', async () => {
    const { GET } = await import('../../../app/api/rmhbox/stats/route');
    const req = new Request('http://localhost/api/rmhbox/stats');
    const res = await GET(req as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
  });

  it('should return empty stats for unknown user', async () => {
    const { GET } = await import('../../../app/api/rmhbox/stats/route');
    const req = new Request('http://localhost/api/rmhbox/stats?userId=unknown');
    const res = await GET(req as Parameters<typeof GET>[0]);
    const data = await res.json();
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

    const { GET } = await import('../../../app/api/rmhbox/stats/route');
    const req = new Request('http://localhost/api/rmhbox/stats?userId=user-alice');
    const res = await GET(req as Parameters<typeof GET>[0]);
    const data = await res.json();

    expect(data.global.totalGamesPlayed).toBe(10);
    expect(data.global.winRate).toBe(40);
    expect(data.global.favoriteMinigame).toBe('rhyme-time');
    expect(data.minigames).toHaveProperty('rhyme-time');
    expect(data.minigames).toHaveProperty('emoji-cinema');
  });

  it('should return 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue({ allowed: false, retryAfter: 15 });
    const { GET } = await import('../../../app/api/rmhbox/stats/route');
    const req = new Request('http://localhost/api/rmhbox/stats?userId=test');
    const res = await GET(req as Parameters<typeof GET>[0]);
    expect(res.status).toBe(429);
  });
});

describe('REST API — History (§3.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  });

  it('should return 404 for unknown matchId', async () => {
    mockPrisma.rMHboxMatch.findUnique.mockResolvedValue(null);
    const { GET } = await import('../../../app/api/rmhbox/history/route');
    const req = new Request('http://localhost/api/rmhbox/history?matchId=nonexistent');
    const res = await GET(req as Parameters<typeof GET>[0]);
    expect(res.status).toBe(404);
  });

  it('should return match detail when matchId is provided', async () => {
    mockPrisma.rMHboxMatch.findUnique.mockResolvedValue({
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

    const { GET } = await import('../../../app/api/rmhbox/history/route');
    const req = new Request('http://localhost/api/rmhbox/history?matchId=match-1');
    const res = await GET(req as Parameters<typeof GET>[0]);
    const data = await res.json();

    expect(data.match.id).toBe('match-1');
    expect(data.match.minigameId).toBe('rhyme-time');
    expect(data.match.players).toHaveLength(2);
    expect(data.match.gameLog).toBeDefined();
  });

  it('should return paginated match list when userId is provided', async () => {
    mockPrisma.rMHboxMatch.findMany.mockResolvedValue([
      {
        id: 'match-1', minigameId: 'rhyme-time', lobbyId: 'L1',
        startedAt: new Date(), endedAt: new Date(), durationMs: 5000,
        winnerUserId: 'user-alice', playerCount: 2,
        players: [{ userId: 'user-alice', userName: 'Alice', rank: 1, score: 200, wasWinner: true }],
      },
    ]);
    mockPrisma.rMHboxMatch.count.mockResolvedValue(1);

    const { GET } = await import('../../../app/api/rmhbox/history/route');
    const req = new Request('http://localhost/api/rmhbox/history?userId=user-alice');
    const res = await GET(req as Parameters<typeof GET>[0]);
    const data = await res.json();

    expect(data.matches).toHaveLength(1);
    expect(data.total).toBe(1);
  });

  it('should clamp limit parameter to max 50', async () => {
    mockPrisma.rMHboxMatch.count.mockResolvedValue(0);
    const { GET } = await import('../../../app/api/rmhbox/history/route');
    const req = new Request('http://localhost/api/rmhbox/history?limit=200');
    await GET(req as Parameters<typeof GET>[0]);

    expect(mockPrisma.rMHboxMatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('should return 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue({ allowed: false, retryAfter: 10 });
    const { GET } = await import('../../../app/api/rmhbox/history/route');
    const req = new Request('http://localhost/api/rmhbox/history');
    const res = await GET(req as Parameters<typeof GET>[0]);
    expect(res.status).toBe(429);
  });
});
