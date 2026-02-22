/**
 * RMHbox — Base Minigame Abstract Class
 *
 * All minigame server handlers extend this class. It provides:
 * - Tracked timers/intervals with automatic cleanup
 * - Error isolation via try-catch wrappers
 * - Lifecycle methods (start, handleInput, forceEnd, cleanup)
 * - Reconnection support (getStateForPlayer, handlePlayerReconnect)
 *
 * Reference: docs/rmhbox/design-spec/core.md §7.4
 */

import type { LobbySettings } from '../../../lib/rmhbox/types';
import type { RMHboxPlayer } from '../types';
import type { PlayerRanking, Award } from '../../../lib/rmhbox/types';

// ─── Minigame Context ────────────────────────────────────────────

/**
 * Context provided to every minigame instance by the GameCoordinator.
 * Includes lobby metadata and communication helpers.
 */
export interface MinigameContext {
  lobbyId: string;
  players: Map<string, RMHboxPlayer>;
  settings: LobbySettings;
  broadcastToLobby: (event: string, data: unknown) => void;
  broadcastToPlayers: (event: string, data: unknown) => void;
  sendToPlayer: (userId: string, event: string, data: unknown) => void;
  sendToSpectators: (event: string, data: unknown) => void;
  onComplete: (results: MinigameResults) => void;
  onError: (error: Error) => void;
}

// ─── Minigame Results ────────────────────────────────────────────

/**
 * The result object returned by computeResults() after a game ends.
 */
export interface MinigameResults {
  rankings: PlayerRanking[];
  awards: Award[];
  gameSpecificData: Record<string, unknown>;
  duration: number; // actual game duration in ms
}

// ─── Abstract Base Class ─────────────────────────────────────────

export abstract class BaseMinigame {
  protected context: MinigameContext;
  protected gameState: Record<string, unknown> = {};
  protected timers: NodeJS.Timeout[] = [];
  protected intervals: NodeJS.Timeout[] = [];
  protected isRunning: boolean = false;

  constructor(context: MinigameContext) {
    this.context = context;
  }

  /** Called when the PLAYING phase begins. Start game logic here. */
  abstract start(): void;

  /** Called when a player sends an input/action. */
  abstract handleInput(userId: string, action: string, data: unknown): void;

  /** Return the scoped game state for a specific player (used for reconnection + heartbeat). */
  abstract getStateForPlayer(userId: string): unknown;

  /** Return the game state visible to spectators. */
  abstract getStateForSpectator(): unknown;

  /** Compute final results. Must be implemented by subclasses. */
  abstract computeResults(): MinigameResults;

  /**
   * Called when a new player joins mid-game (join-in-progress).
   * Default: no-op. Subclasses override for games that support immediate joins.
   */
  handlePlayerJoin(_userId: string): void {
    // Default no-op — subclasses override for join-in-progress support
  }

  /**
   * Called when a player disconnects mid-game.
   * Default: mark as inactive. Subclasses can override for game-specific behavior.
   */
  handlePlayerDisconnect(_userId: string): void {
    // Default no-op — subclasses override for turn-skipping, AI takeover, etc.
  }

  /**
   * Called when a player reconnects mid-game.
   * Default: send them the full game state snapshot.
   */
  handlePlayerReconnect(userId: string): void {
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForPlayer(userId));
  }

  /**
   * Force-end the game early (e.g., not enough players remain).
   * Cleans up resources and delivers partial results.
   */
  forceEnd(_reason: string): void {
    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  /**
   * Clean up all tracked timers, intervals, and resources.
   * Called automatically on game end or error, and by GameCoordinator.
   */
  cleanup(): void {
    this.isRunning = false;
    this.timers.forEach((t) => clearTimeout(t));
    this.intervals.forEach((i) => clearInterval(i));
    this.timers = [];
    this.intervals = [];
  }

  /**
   * Create a tracked timeout that is automatically cleaned up on game end.
   * The callback is wrapped in try-catch to prevent unhandled exceptions.
   */
  protected setTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    const t = globalThis.setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== t);
      try {
        fn();
      } catch (e) {
        this.context.onError(e as Error);
      }
    }, ms);
    this.timers.push(t);
    return t;
  }

  /**
   * Create a tracked interval that is automatically cleaned up on game end.
   * The callback is wrapped in try-catch to prevent unhandled exceptions.
   */
  protected setInterval(fn: () => void, ms: number): NodeJS.Timeout {
    const i = globalThis.setInterval(() => {
      try {
        fn();
      } catch (e) {
        this.context.onError(e as Error);
      }
    }, ms);
    this.intervals.push(i);
    return i;
  }
}
