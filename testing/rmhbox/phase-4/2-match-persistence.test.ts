/**
 * Phase 4 §2 — Match-End Persistence Tests
 *
 * Verifies the LeaderboardService.persistMatchResults() method:
 * - Creates RMHboxMatch records
 * - Upserts RMHboxProfile with incremented stats
 * - Creates RMHboxMatchPlayer join records
 * - Correctly computes win streaks
 * - Fire-and-forget: errors are logged but never thrown
 *
 * Uses a mock Prisma client for environment-agnostic testing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MOCK_USERS, createPlayer, createMockResults, createMockPrisma } from './setup';
import type { MockPrismaClient } from './setup';

// Mock the prisma-client module
let mockPrisma: MockPrismaClient;

vi.mock('../../../server/rmhbox/prisma-client', () => ({
  getPrismaClient: () => mockPrisma,
}));

// Import after mocking
const { LeaderboardService } = await import('../../../server/rmhbox/leaderboard');

describe('Match-End Persistence (§2)', () => {
  let service: InstanceType<typeof LeaderboardService>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new LeaderboardService();
    vi.clearAllMocks();
  });

  it('should create an RMHboxMatch record with correct fields', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const bob = createPlayer(MOCK_USERS.bob);
    const players = new Map([
      [alice.userId, alice],
      [bob.userId, bob],
    ]);
    const results = createMockResults([alice, bob]);

    // Mock profile creation returns
    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-test-1' });
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue(null);
    mockPrisma.rMHboxProfile.create.mockResolvedValue({ id: 'profile-1', userId: alice.userId });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null);

    expect(mockPrisma.rMHboxMatch.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.rMHboxMatch.create.mock.calls[0][0];
    expect(createCall.data.minigameId).toBe('rhyme-time');
    expect(createCall.data.lobbyId).toBe('LOBBY01');
    expect(createCall.data.playerCount).toBe(2);
    expect(createCall.data.winnerUserId).toBe(alice.userId);
  });

  it('should create RMHboxMatchPlayer records for each player', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const bob = createPlayer(MOCK_USERS.bob);
    const players = new Map([
      [alice.userId, alice],
      [bob.userId, bob],
    ]);
    const results = createMockResults([alice, bob]);

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-test-2' });
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue(null);
    mockPrisma.rMHboxProfile.create
      .mockResolvedValueOnce({ id: 'profile-alice', userId: alice.userId })
      .mockResolvedValueOnce({ id: 'profile-bob', userId: bob.userId });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null);

    expect(mockPrisma.rMHboxMatchPlayer.create).toHaveBeenCalledTimes(2);

    // First player (winner) should have wasWinner = true
    const firstCall = mockPrisma.rMHboxMatchPlayer.create.mock.calls[0][0];
    expect(firstCall.data.wasWinner).toBe(true);
    expect(firstCall.data.rank).toBe(1);

    // Second player should have wasWinner = false
    const secondCall = mockPrisma.rMHboxMatchPlayer.create.mock.calls[1][0];
    expect(secondCall.data.wasWinner).toBe(false);
    expect(secondCall.data.rank).toBe(2);
  });

  it('should create a new RMHboxProfile when one does not exist', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const players = new Map([[alice.userId, alice]]);
    const results = createMockResults([alice]);

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-1' });
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue(null);
    mockPrisma.rMHboxProfile.create.mockResolvedValue({ id: 'profile-new', userId: alice.userId });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null);

    expect(mockPrisma.rMHboxProfile.create).toHaveBeenCalledTimes(1);
    const createData = mockPrisma.rMHboxProfile.create.mock.calls[0][0].data;
    expect(createData.userId).toBe(alice.userId);
    expect(createData.totalGamesPlayed).toBe(1);
    expect(createData.totalWins).toBe(1); // Alice is rank 1
    expect(createData.currentWinStreak).toBe(1);
    expect(createData.bestWinStreak).toBe(1);
  });

  it('should update existing RMHboxProfile with incremented stats', async () => {
    const bob = createPlayer(MOCK_USERS.bob);
    const players = new Map([[bob.userId, bob]]);
    const results = createMockResults([bob]);

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-2' });
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue({
      id: 'profile-bob',
      userId: bob.userId,
      totalGamesPlayed: 5,
      totalWins: 2,
      totalScore: 500,
      totalPlayTimeMs: 30000,
      minigameStats: {},
      currentWinStreak: 1,
      bestWinStreak: 3,
    });

    await service.persistMatchResults('LOBBY01', 'category-crash', results, players, null);

    expect(mockPrisma.rMHboxProfile.update).toHaveBeenCalledTimes(1);
    const updateData = mockPrisma.rMHboxProfile.update.mock.calls[0][0].data;
    expect(updateData.totalGamesPlayed).toEqual({ increment: 1 });
    expect(updateData.totalScore).toEqual({ increment: 100 }); // Score for rank 1
  });

  it('should reset win streak when player does not win', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const bob = createPlayer(MOCK_USERS.bob);
    const players = new Map([
      [alice.userId, alice],
      [bob.userId, bob],
    ]);
    const results = createMockResults([alice, bob]); // Alice wins, Bob is 2nd

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-3' });
    // Bob's existing profile with a streak
    mockPrisma.rMHboxProfile.findUnique
      .mockResolvedValueOnce(null) // Alice: no profile
      .mockResolvedValueOnce({     // Bob: has profile with streak
        id: 'profile-bob',
        userId: bob.userId,
        totalGamesPlayed: 3,
        totalWins: 2,
        totalScore: 300,
        totalPlayTimeMs: 20000,
        minigameStats: {},
        currentWinStreak: 2,
        bestWinStreak: 2,
      });
    mockPrisma.rMHboxProfile.create.mockResolvedValue({ id: 'profile-alice', userId: alice.userId });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null);

    // Bob's win streak should be reset to 0
    const bobUpdate = mockPrisma.rMHboxProfile.update.mock.calls[0][0].data;
    expect(bobUpdate.currentWinStreak).toBe(0);
    expect(bobUpdate.bestWinStreak).toBe(2); // Best stays the same
  });

  it('should increment win streak and update best when player wins', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const players = new Map([[alice.userId, alice]]);
    const results = createMockResults([alice]);

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-4' });
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue({
      id: 'profile-alice',
      userId: alice.userId,
      totalGamesPlayed: 5,
      totalWins: 3,
      totalScore: 500,
      totalPlayTimeMs: 30000,
      minigameStats: {},
      currentWinStreak: 2,
      bestWinStreak: 3,
    });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null);

    const updateData = mockPrisma.rMHboxProfile.update.mock.calls[0][0].data;
    expect(updateData.currentWinStreak).toBe(3); // 2 + 1
    expect(updateData.bestWinStreak).toBe(3); // max(3, 3) = 3
  });

  it('should update bestWinStreak when current exceeds best', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const players = new Map([[alice.userId, alice]]);
    const results = createMockResults([alice]);

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-5' });
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue({
      id: 'profile-alice',
      userId: alice.userId,
      totalGamesPlayed: 5,
      totalWins: 3,
      totalScore: 500,
      totalPlayTimeMs: 30000,
      minigameStats: {},
      currentWinStreak: 3,
      bestWinStreak: 3,
    });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null);

    const updateData = mockPrisma.rMHboxProfile.update.mock.calls[0][0].data;
    expect(updateData.currentWinStreak).toBe(4); // 3 + 1
    expect(updateData.bestWinStreak).toBe(4); // max(3, 4) = 4
  });

  it('should update per-minigame stats in minigameStats JSON', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const players = new Map([[alice.userId, alice]]);
    const results = createMockResults([alice]);

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-6' });
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue({
      id: 'profile-alice',
      userId: alice.userId,
      totalGamesPlayed: 2,
      totalWins: 1,
      totalScore: 200,
      totalPlayTimeMs: 10000,
      minigameStats: {
        'rhyme-time': {
          gamesPlayed: 1,
          wins: 1,
          bestScore: 100,
          totalScore: 100,
          totalRank: 1,
          averageRank: 1,
        },
      },
      currentWinStreak: 1,
      bestWinStreak: 1,
    });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null);

    const updateData = mockPrisma.rMHboxProfile.update.mock.calls[0][0].data;
    const updatedStats = updateData.minigameStats['rhyme-time'];
    expect(updatedStats.gamesPlayed).toBe(2);
    expect(updatedStats.wins).toBe(2);
    expect(updatedStats.bestScore).toBe(100); // max(100, 100)
    expect(updatedStats.totalScore).toBe(200);
  });

  it('should not throw when database write fails (fire-and-forget)', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const players = new Map([[alice.userId, alice]]);
    const results = createMockResults([alice]);

    mockPrisma.rMHboxMatch.create.mockRejectedValue(new Error('DB connection failed'));

    // Should not throw
    await expect(
      service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null),
    ).resolves.not.toThrow();
  });

  it('should handle empty results gracefully', async () => {
    const players = new Map<string, ReturnType<typeof createPlayer>>();
    const results = createMockResults([]);

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-empty' });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null);

    expect(mockPrisma.rMHboxMatch.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.rMHboxMatchPlayer.create).toHaveBeenCalledTimes(0);
  });

  it('should skip players not found in the players map', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const players = new Map([[alice.userId, alice]]);
    // Results include bob who is NOT in the players map
    const results = createMockResults([alice, createPlayer(MOCK_USERS.bob)]);

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-skip' });
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue(null);
    mockPrisma.rMHboxProfile.create.mockResolvedValue({ id: 'profile-alice', userId: alice.userId });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, null);

    // Only Alice should get a profile and match player record
    expect(mockPrisma.rMHboxProfile.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.rMHboxMatchPlayer.create).toHaveBeenCalledTimes(1);
  });

  it('should store gameLog when provided', async () => {
    const alice = createPlayer(MOCK_USERS.alice);
    const players = new Map([[alice.userId, alice]]);
    const results = createMockResults([alice]);
    const gameLog = { events: [{ timestamp: Date.now(), type: 'answer', data: { correct: true } }] };

    mockPrisma.rMHboxMatch.create.mockResolvedValue({ id: 'match-log' });
    mockPrisma.rMHboxProfile.findUnique.mockResolvedValue(null);
    mockPrisma.rMHboxProfile.create.mockResolvedValue({ id: 'profile-alice', userId: alice.userId });

    await service.persistMatchResults('LOBBY01', 'rhyme-time', results, players, gameLog);

    const createData = mockPrisma.rMHboxMatch.create.mock.calls[0][0].data;
    expect(createData.gameLog).toEqual(gameLog);
  });
});
