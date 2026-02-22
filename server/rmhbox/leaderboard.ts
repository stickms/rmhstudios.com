/**
 * RMHbox — Leaderboard Service
 *
 * Handles match result persistence (async, fire-and-forget) and
 * leaderboard data queries via WebSocket.
 *
 * Match persistence writes are wrapped in try-catch to prevent
 * any database failures from affecting the game flow.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14
 * Implementation: docs/rmhbox/implementation/phase-4.md §2, §3.4
 */

import { Socket } from 'socket.io';
import { logger } from './logger';
import { S2C } from '../../lib/rmhbox/events';
import { getPrismaClient } from './prisma-client';
import type { RMHboxPlayer } from './types';
import type { MinigameResults } from './minigames/base-minigame';

// ─── Types ───────────────────────────────────────────────────────

interface GameLog {
  events: Array<{ timestamp: number; type: string; data: unknown }>;
}

interface MinigameStatEntry {
  gamesPlayed: number;
  wins: number;
  bestScore: number;
  totalScore: number;
  totalRank: number;
  averageRank: number;
}

// ─── LeaderboardService ──────────────────────────────────────────

export class LeaderboardService {
  /**
   * Register WebSocket listeners for leaderboard data fetching.
   */
  handleConnection(socket: Socket): void {
    socket.on('rmhbox:leaderboard:fetch', (payload) => this.onFetch(socket, payload));
  }

  /**
   * Handle a leaderboard fetch request via WebSocket.
   * Queries the database for top profiles and returns them to the requester.
   */
  private async onFetch(socket: Socket, payload: unknown): Promise<void> {
    try {
      const params = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {};
      const metric = (params.metric as string) || 'score';
      const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);

      const prisma = getPrismaClient();

      const orderBy = metric === 'wins'
        ? { totalWins: 'desc' as const }
        : metric === 'games'
          ? { totalGamesPlayed: 'desc' as const }
          : { totalScore: 'desc' as const };

      const profiles = await prisma.rMHboxProfile.findMany({
        orderBy,
        take: limit,
        include: { user: { select: { name: true, image: true } } },
      });

      const entries = profiles.map((p, idx) => ({
        rank: idx + 1,
        userId: p.userId,
        userName: p.user?.name ?? 'Unknown',
        avatarUrl: p.user?.image ?? null,
        value: metric === 'wins' ? p.totalWins : metric === 'games' ? p.totalGamesPlayed : p.totalScore,
        gamesPlayed: p.totalGamesPlayed,
        wins: p.totalWins,
      }));

      socket.emit(S2C.LEADERBOARD_DATA, {
        entries,
        total: entries.length,
        period: 'all-time',
        metric,
      });
    } catch (err) {
      logger.error({ event: 'leaderboard_fetch_error', error: String(err) });
      socket.emit(S2C.LEADERBOARD_DATA, { entries: [], total: 0, period: 'all-time', metric: 'score' });
    }
  }

  /**
   * Persist match results to the database after a game completes.
   *
   * This method is fire-and-forget: errors are logged but never thrown.
   * It creates an RMHboxMatch record, upserts RMHboxProfile for each player,
   * and creates RMHboxMatchPlayer join records.
   */
  async persistMatchResults(
    lobbyId: string,
    minigameId: string,
    results: MinigameResults,
    players: Map<string, RMHboxPlayer>,
    gameLog: GameLog | null,
  ): Promise<void> {
    try {
      const prisma = getPrismaClient();

      const startedAt = new Date();
      const endedAt = new Date();
      const durationMs = results.duration;
      const winnerRanking = results.rankings.find((r) => r.rank === 1);
      const winnerUserId = winnerRanking?.userId ?? null;

      // Step 1: Create RMHboxMatch record
      const match = await prisma.rMHboxMatch.create({
        data: {
          minigameId,
          lobbyId,
          startedAt,
          endedAt,
          durationMs,
          winnerUserId,
          playerCount: results.rankings.length,
          gameLog: gameLog as object ?? undefined,
          results: results.rankings as unknown as object,
        },
      });

      // Step 2: For each player ranking, upsert profile and create match player
      for (const ranking of results.rankings) {
        const player = players.get(ranking.userId);
        if (!player) continue;

        const isWinner = ranking.rank === 1;

        // Upsert RMHboxProfile
        const existingProfile = await prisma.rMHboxProfile.findUnique({
          where: { userId: ranking.userId },
        });

        let profileId: string;

        if (existingProfile) {
          // Read-modify-write for minigameStats JSON field
          const currentStats = (existingProfile.minigameStats as unknown as Record<string, MinigameStatEntry>) ?? {};
          const gameStat: MinigameStatEntry = currentStats[minigameId] ?? {
            gamesPlayed: 0,
            wins: 0,
            bestScore: 0,
            totalScore: 0,
            totalRank: 0,
            averageRank: 0,
          };

          gameStat.gamesPlayed++;
          if (isWinner) gameStat.wins++;
          gameStat.bestScore = Math.max(gameStat.bestScore, ranking.score);
          gameStat.totalScore += ranking.score;
          gameStat.totalRank += ranking.rank;
          gameStat.averageRank = gameStat.totalRank / gameStat.gamesPlayed;

          currentStats[minigameId] = gameStat;

          // Update win streak
          const newCurrentStreak = isWinner ? existingProfile.currentWinStreak + 1 : 0;
          const newBestStreak = Math.max(existingProfile.bestWinStreak, newCurrentStreak);

          await prisma.rMHboxProfile.update({
            where: { userId: ranking.userId },
            data: {
              totalGamesPlayed: { increment: 1 },
              totalWins: isWinner ? { increment: 1 } : undefined,
              totalScore: { increment: ranking.score },
              totalPlayTimeMs: { increment: durationMs },
              minigameStats: currentStats as object,
              currentWinStreak: newCurrentStreak,
              bestWinStreak: newBestStreak,
            },
          });

          profileId = existingProfile.id;
        } else {
          // Create new profile
          const newProfile = await prisma.rMHboxProfile.create({
            data: {
              userId: ranking.userId,
              totalGamesPlayed: 1,
              totalWins: isWinner ? 1 : 0,
              totalScore: ranking.score,
              totalPlayTimeMs: durationMs,
              minigameStats: {
                [minigameId]: {
                  gamesPlayed: 1,
                  wins: isWinner ? 1 : 0,
                  bestScore: ranking.score,
                  totalScore: ranking.score,
                  totalRank: ranking.rank,
                  averageRank: ranking.rank,
                } satisfies MinigameStatEntry,
              } as object,
              currentWinStreak: isWinner ? 1 : 0,
              bestWinStreak: isWinner ? 1 : 0,
            },
          });
          profileId = newProfile.id;
        }

        // Create RMHboxMatchPlayer record
        await prisma.rMHboxMatchPlayer.create({
          data: {
            matchId: match.id,
            profileId,
            userId: ranking.userId,
            userName: player.userName,
            rank: ranking.rank,
            score: ranking.score,
            wasWinner: isWinner,
            stats: (ranking.deltas ?? {}) as object,
          },
        });
      }

      logger.info({
        event: 'match_persisted',
        matchId: match.id,
        lobbyId,
        minigameId,
        playerCount: results.rankings.length,
      });
    } catch (err) {
      // Fire-and-forget — log but NEVER throw
      logger.error({
        event: 'match_persist_error',
        lobbyId,
        minigameId,
        error: String(err),
      });
    }
  }
}
