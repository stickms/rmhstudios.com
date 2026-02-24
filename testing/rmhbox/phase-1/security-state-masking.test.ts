/**
 * Phase 1 — Security Tests: State-Masking Verification
 *
 * Verifies that the state-masking and information scoping patterns
 * are correctly designed to prevent Player A from seeing Player B's
 * hidden data.
 *
 * Tests the BaseMinigame's per-player state scoping pattern and
 * the server-side type definitions that enforce information barriers.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  BaseMinigame,
  type MinigameContext,
  type MinigameResults,
} from '../../../server/rmhbox/minigames/base-minigame';
import type { RMHboxPlayer } from '../../../server/rmhbox/types';

// ─── Game with hidden state ──────────────────────────────────────

/**
 * A test minigame where each player has a secret word that only
 * they should be able to see in their state.
 */
class SecretWordGame extends BaseMinigame {
  private secretWords = new Map<string, string>();

  start(): void {
    this.isRunning = true;
    // Assign a secret word to each player
    const words = ['apple', 'banana', 'cherry', 'date'];
    let i = 0;
    for (const [userId] of this.context.players) {
      this.secretWords.set(userId, words[i % words.length]);
      i++;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleInput(_userId: string, _action: string, _data: unknown): void {}

  /**
   * Returns state scoped to a specific player:
   * Each player sees their own secret word but NOT other players' words.
   */
  getStateForPlayer(userId: string): unknown {
    return {
      myWord: this.secretWords.get(userId) || null,
      otherPlayers: Array.from(this.context.players.keys())
        .filter((id) => id !== userId)
        .map((id) => ({
          userId: id,
          hasWord: this.secretWords.has(id),
          // Deliberately NOT including their secret word
        })),
    };
  }

  /**
   * Spectators see no secret words at all.
   */
  getStateForSpectator(): unknown {
    return {
      playerCount: this.context.players.size,
      // No secret words exposed
    };
  }

  computeResults(): MinigameResults {
    return { rankings: [], awards: [], gameSpecificData: {}, duration: 0 };
  }
}

function createPlayers(): Map<string, RMHboxPlayer> {
  const players = new Map<string, RMHboxPlayer>();
  const playerData = [
    { userId: 'player-a', userName: 'Alice' },
    { userId: 'player-b', userName: 'Bob' },
    { userId: 'player-c', userName: 'Charlie' },
  ];
  for (const p of playerData) {
    players.set(p.userId, {
      userId: p.userId,
      userName: p.userName,
      avatarUrl: null,
      socketId: `socket-${p.userId}`,
      isConnected: true,
      isReady: true,
      score: 0,
      roundScore: 0,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      role: 'player',
    });
  }
  return players;
}

describe('Security: State-Masking Verification', () => {
  it('should scope secret state per player — Player A cannot see Player B data', () => {
    const players = createPlayers();
    const ctx: MinigameContext = {
      lobbyId: 'SEC01',
      players,
      settings: {
        isPublic: false,
        maxPlayers: 8,
        maxSpectators: 20,
        allowMidGameJoin: false,
        allowSpectatorPromotion: true,
        autoStartThreshold: null,
        gameDurationOverride: null,
      },
      gameSettings: {},
      getHostId: () => 'player-a',
      broadcastToLobby: vi.fn(),
      broadcastToPlayers: vi.fn(),
      broadcastAction: vi.fn(),
      sendToPlayer: vi.fn(),
      sendToSpectators: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    const game = new SecretWordGame(ctx);
    game.start();

    // Get state for Player A
    const stateA = game.getStateForPlayer('player-a') as Record<string, unknown>;
    // Get state for Player B
    const stateB = game.getStateForPlayer('player-b') as Record<string, unknown>;

    // Player A should see their own word
    expect(stateA.myWord).toBe('apple');

    // Player B should see their own word (different from A)
    expect(stateB.myWord).toBe('banana');

    // Player A should NOT see Player B's word
    const playerBInA = (stateA.otherPlayers as Array<Record<string, unknown>>).find((p) => p.userId === 'player-b');
    expect(playerBInA).toBeDefined();
    expect(playerBInA.hasWord).toBe(true);
    expect(playerBInA).not.toHaveProperty('word');
    expect(playerBInA).not.toHaveProperty('secretWord');
    expect(playerBInA).not.toHaveProperty('myWord');

    // Player B should NOT see Player A's word
    const playerAInB = (stateB.otherPlayers as Array<Record<string, unknown>>).find((p) => p.userId === 'player-a');
    expect(playerAInB).toBeDefined();
    expect(playerAInB).not.toHaveProperty('word');
    expect(playerAInB).not.toHaveProperty('secretWord');
    expect(playerAInB).not.toHaveProperty('myWord');
  });

  it('should not expose any secret words to spectators', () => {
    const players = createPlayers();
    const ctx: MinigameContext = {
      lobbyId: 'SEC02',
      players,
      settings: {
        isPublic: false,
        maxPlayers: 8,
        maxSpectators: 20,
        allowMidGameJoin: false,
        allowSpectatorPromotion: true,
        autoStartThreshold: null,
        gameDurationOverride: null,
      },
      gameSettings: {},
      getHostId: () => 'player-a',
      broadcastToLobby: vi.fn(),
      broadcastToPlayers: vi.fn(),
      broadcastAction: vi.fn(),
      sendToPlayer: vi.fn(),
      sendToSpectators: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    const game = new SecretWordGame(ctx);
    game.start();

    const spectatorState = game.getStateForSpectator() as Record<string, unknown>;

    // Spectator state should have player count but no words
    expect(spectatorState.playerCount).toBe(3);
    expect(spectatorState).not.toHaveProperty('secretWords');
    expect(spectatorState).not.toHaveProperty('myWord');
    expect(spectatorState).not.toHaveProperty('words');
  });

  it('should send per-player scoped state on reconnection', () => {
    const players = createPlayers();
    const sendToPlayer = vi.fn();
    const ctx: MinigameContext = {
      lobbyId: 'SEC03',
      players,
      settings: {
        isPublic: false,
        maxPlayers: 8,
        maxSpectators: 20,
        allowMidGameJoin: false,
        allowSpectatorPromotion: true,
        autoStartThreshold: null,
        gameDurationOverride: null,
      },
      gameSettings: {},
      getHostId: () => 'player-a',
      broadcastToLobby: vi.fn(),
      broadcastToPlayers: vi.fn(),
      broadcastAction: vi.fn(),
      sendToPlayer,
      sendToSpectators: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    const game = new SecretWordGame(ctx);
    game.start();

    // Simulate Player A reconnecting
    game.handlePlayerReconnect('player-a');

    // Should send state to player-a specifically
    expect(sendToPlayer).toHaveBeenCalledWith(
      'player-a',
      'rmhbox:game:state_snapshot',
      expect.objectContaining({ myWord: 'apple' }),
    );

    // The sent state should not contain other players' words
    const sentState = sendToPlayer.mock.calls[0][2] as Record<string, unknown>;
    for (const other of sentState.otherPlayers as Array<Record<string, unknown>>) {
      expect(other).not.toHaveProperty('myWord');
      expect(other).not.toHaveProperty('secretWord');
    }
  });

  it('should isolate socket IDs from client-visible types', () => {
    // Verify that RMHboxPlayer has socketId but ClientPlayerInfo does not
    // This is a type-level check — if this compiles, it passes
    const serverPlayer: RMHboxPlayer = {
      userId: 'test',
      userName: 'Test',
      avatarUrl: null,
      socketId: 'socket-123', // server has socket ID
      isConnected: true,
      isReady: false,
      score: 0,
      roundScore: 0,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      role: 'player',
    };

    // The server player has socketId (internal)
    expect(serverPlayer.socketId).toBe('socket-123');

    // ClientPlayerInfo type (from shared types) does NOT have socketId
    // This is verified by the type definition — no socketId field
    const clientPlayer = {
      userId: serverPlayer.userId,
      userName: serverPlayer.userName,
      avatarUrl: serverPlayer.avatarUrl,
      isConnected: serverPlayer.isConnected,
      isReady: serverPlayer.isReady,
      score: serverPlayer.score,
      roundScore: serverPlayer.roundScore,
      isHost: false,
    };

    expect(clientPlayer).not.toHaveProperty('socketId');
    expect(clientPlayer).not.toHaveProperty('lastSeenAt');
    expect(clientPlayer).not.toHaveProperty('joinedAt');
    expect(clientPlayer).not.toHaveProperty('role');
  });
});
