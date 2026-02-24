/**
 * Phase 1 — Section 2: Shared Type Definitions
 *
 * Verifies that all shared types in lib/rmhbox/types.ts compile
 * correctly and can be instantiated without TypeScript errors.
 */

import { describe, it, expect } from 'vitest';
import type {
  LobbyState,
  LobbySettings,
  ClientLobbyState,
  ClientPlayerInfo,
  ClientSpectatorInfo,
  ClientGameInfo,
  ChatMessage,
  GameAction,
  PlayerRanking,
  Award,
  SessionStanding,
  RoundResultsPayload,
  MatchSummary,
  MinigameCategory,
  JoinInProgressPolicy,
  PreloadManifest,
  ControlHint,
  MinigameDefinition,
  VoteCandidate,
  VoteStartedPayload,
  VoteCastPayload,
  VoteResultPayload,
  LeaderboardEntry,
  RMHboxErrorCode,
  RMHboxError,
} from '../../../lib/rmhbox/types';

describe('Shared Type Definitions (§2.1)', () => {
  it('should allow all valid LobbyState values', () => {
    const states: LobbyState[] = [
      'WAITING', 'VOTING', 'INSTRUCTIONS', 'PRELOADING',
      'COUNTDOWN', 'PLAYING', 'ROUND_RESULTS', 'SESSION_RESULTS', 'DISBANDED',
    ];
    expect(states).toHaveLength(9);
  });

  it('should allow constructing LobbySettings', () => {
    const settings: LobbySettings = {
      isPublic: false,
      maxPlayers: 8,
      maxSpectators: 20,
      allowMidGameJoin: false,
      allowSpectatorPromotion: true,
      autoStartThreshold: null,
      gameDurationOverride: null,
    };
    expect(settings.maxPlayers).toBe(8);
  });

  it('should allow constructing ClientLobbyState', () => {
    const state: ClientLobbyState = {
      lobbyId: 'ABC123',
      hostUserId: 'user-1',
      state: 'WAITING',
      settings: {
        isPublic: false,
        maxPlayers: 8,
        maxSpectators: 20,
        allowMidGameJoin: false,
        allowSpectatorPromotion: true,
        autoStartThreshold: null,
        gameDurationOverride: null,
      },
      players: [],
      spectators: [],
      currentGame: null,
      roundNumber: 0,
      chat: [],
      myRole: 'player',
      myUserId: 'user-1',
      seq: 0,
      matchHistory: [],
      selectedGame: null,
    };
    expect(state.lobbyId).toBe('ABC123');
  });

  it('should allow constructing ClientPlayerInfo', () => {
    const player: ClientPlayerInfo = {
      userId: 'user-1',
      userName: 'Alice',
      avatarUrl: null,
      isConnected: true,
      isReady: false,
      score: 0,
      roundScore: 0,
      isHost: true,
    };
    expect(player.isHost).toBe(true);
  });

  it('should allow constructing ClientSpectatorInfo', () => {
    const spec: ClientSpectatorInfo = {
      userId: 'user-2',
      userName: 'Bob',
      avatarUrl: 'https://example.com/bob.png',
      isConnected: true,
    };
    expect(spec.isConnected).toBe(true);
  });

  it('should allow constructing ClientGameInfo', () => {
    const game: ClientGameInfo = {
      minigameId: 'rhyme-time',
      displayName: 'Rhyme Time',
      phase: 'playing',
      timeRemaining: 60,
      publicState: {},
      privateState: {},
    };
    expect(game.phase).toBe('playing');
  });

  it('should allow constructing ChatMessage', () => {
    const msg: ChatMessage = {
      id: 'msg-1',
      userId: 'user-1',
      userName: 'Alice',
      content: 'Hello!',
      timestamp: Date.now(),
      type: 'user',
    };
    expect(msg.type).toBe('user');
  });

  it('should allow constructing GameAction', () => {
    const action: GameAction = {
      type: 'PLAYER_ANSWER',
      payload: { answer: 'cat' },
      seq: 1,
      timestamp: Date.now(),
    };
    expect(action.type).toBe('PLAYER_ANSWER');
  });

  it('should allow constructing PlayerRanking with deltas', () => {
    const ranking: PlayerRanking = {
      userId: 'user-1',
      userName: 'Alice',
      score: 100,
      rank: 1,
      deltas: { speed: 20, accuracy: 80 },
    };
    expect(ranking.deltas.speed).toBe(20);
  });

  it('should allow constructing Award', () => {
    const award: Award = {
      userId: 'user-1',
      title: 'Speed Demon',
      description: 'Answered fastest',
      icon: '⚡',
    };
    expect(award.title).toBe('Speed Demon');
  });

  it('should allow constructing SessionStanding', () => {
    const standing: SessionStanding = {
      userId: 'user-1',
      userName: 'Alice',
      totalScore: 500,
      wins: 3,
      rank: 1,
    };
    expect(standing.totalScore).toBe(500);
  });

  it('should allow constructing RoundResultsPayload', () => {
    const results: RoundResultsPayload = {
      minigameId: 'rhyme-time',
      rankings: [],
      awards: [],
      roundNumber: 1,
      sessionStandings: [],
    };
    expect(results.roundNumber).toBe(1);
  });

  it('should allow constructing MatchSummary', () => {
    const summary: MatchSummary = {
      matchId: 'match-1',
      minigameId: 'rhyme-time',
      minigameDisplayName: 'Rhyme Time',
      playerCount: 4,
      winnerUserName: 'Alice',
      rankings: [{ userId: 'user-1', userName: 'Alice', rank: 1, score: 100 }],
      durationMs: 120000,
      playedAt: Date.now(),
    };
    expect(summary.playerCount).toBe(4);
  });

  it('should allow all MinigameCategory values', () => {
    const cats: MinigameCategory[] = ['word', 'trivia', 'action', 'creative'];
    expect(cats).toHaveLength(4);
  });

  it('should allow all JoinInProgressPolicy values', () => {
    const policies: JoinInProgressPolicy[] = [
      'spectate_only', 'join_next_subround', 'join_immediately',
    ];
    expect(policies).toHaveLength(3);
  });

  it('should allow constructing PreloadManifest', () => {
    const manifest: PreloadManifest = {
      images: ['/img/bg.png'],
      sounds: ['/sfx/ding.mp3'],
      data: [],
      estimatedSizeBytes: 50000,
    };
    expect(manifest.estimatedSizeBytes).toBe(50000);
  });

  it('should allow constructing ControlHint', () => {
    const hint: ControlHint = {
      platform: 'all',
      action: 'tap',
      description: 'Tap to select',
    };
    expect(hint.platform).toBe('all');
  });

  it('should allow constructing MinigameDefinition', () => {
    const def: MinigameDefinition = {
      id: 'test-game',
      displayName: 'Test Game',
      description: 'A test game',
      category: 'word',
      icon: '🎮',
      minPlayers: 2,
      maxPlayers: 8,
      estimatedDurationSeconds: 120,
      supportsTeams: false,
      instructionDurationSeconds: 15,
      preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
      joinInProgressPolicy: 'spectate_only',
      tags: ['test'],
    };
    expect(def.id).toBe('test-game');
  });

  it('should allow constructing VoteCandidate', () => {
    const candidate: VoteCandidate = {
      minigameId: 'rhyme-time',
      displayName: 'Rhyme Time',
      description: 'Chain words',
      category: 'word',
      icon: '🎤',
      playerRange: '2-10',
    };
    expect(candidate.minigameId).toBe('rhyme-time');
  });

  it('should allow constructing VoteStartedPayload', () => {
    const payload: VoteStartedPayload = {
      candidates: [],
      durationSeconds: 30,
      endsAt: Date.now() + 30000,
    };
    expect(payload.durationSeconds).toBe(30);
  });

  it('should allow constructing VoteCastPayload', () => {
    const payload: VoteCastPayload = {
      userId: 'user-1',
      tallies: { 'rhyme-time': 2, 'wiki-race': 1 },
      totalVoters: 3,
      totalPlayers: 4,
    };
    expect(payload.totalVoters).toBe(3);
  });

  it('should allow constructing VoteResultPayload', () => {
    const payload: VoteResultPayload = {
      winnerId: 'rhyme-time',
      winnerName: 'Rhyme Time',
      tallies: { 'rhyme-time': 3 },
      wasUnanimous: true,
    };
    expect(payload.wasUnanimous).toBe(true);
  });

  it('should allow constructing LeaderboardEntry', () => {
    const entry: LeaderboardEntry = {
      rank: 1,
      userId: 'user-1',
      userName: 'Alice',
      avatarUrl: null,
      value: 1000,
      gamesPlayed: 50,
      wins: 25,
    };
    expect(entry.rank).toBe(1);
  });

  it('should allow all RMHboxErrorCode values', () => {
    const codes: RMHboxErrorCode[] = [
      'AUTH_REQUIRED', 'AUTH_FAILED', 'SESSION_EXPIRED', 'DUPLICATE_SESSION',
      'LOBBY_NOT_FOUND', 'LOBBY_FULL', 'LOBBY_IN_GAME', 'NOT_HOST',
      'NOT_IN_LOBBY', 'ALREADY_IN_LOBBY', 'INVALID_PAYLOAD', 'INVALID_GAME',
      'INSUFFICIENT_PLAYERS', 'INTERNAL_ERROR', 'RATE_LIMITED',
    ];
    expect(codes).toHaveLength(15);
  });

  it('should allow constructing RMHboxError', () => {
    const error: RMHboxError = {
      code: 'LOBBY_NOT_FOUND',
      message: 'Lobby does not exist',
      details: { lobbyId: 'ABC123' },
    };
    expect(error.code).toBe('LOBBY_NOT_FOUND');
  });

  it('should allow RMHboxError without optional details', () => {
    const error: RMHboxError = {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    };
    expect(error.details).toBeUndefined();
  });
});
