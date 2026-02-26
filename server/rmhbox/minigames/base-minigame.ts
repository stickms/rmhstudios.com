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

import type { LobbySettings, GameSettingValues, SpectatorMode } from '../../../lib/rmhbox/types';
import type { RMHboxPlayer } from '../types';
import type { PlayerRanking, Award } from '../../../lib/rmhbox/types';

export type { SpectatorMode };

// ─── Minigame Context ────────────────────────────────────────────

/**
 * Context provided to every minigame instance by the GameCoordinator.
 * Includes lobby metadata and communication helpers.
 */
export interface MinigameContext {
  lobbyId: string;
  players: Map<string, RMHboxPlayer>;
  settings: LobbySettings;
  /** Host-configured game settings for this minigame instance (§12A). */
  gameSettings: GameSettingValues;
  /** Live lookup of the current host userId (reflects host transfer). */
  getHostId: () => string;
  broadcastToLobby: (event: string, data: unknown) => void;
  broadcastToPlayers: (event: string, data: unknown) => void;
  /** Emit a sequenced GameAction (with seq + timestamp) via LobbyManager. */
  broadcastAction: (action: { type: string; payload?: unknown }) => void;
  sendToPlayer: (userId: string, event: string, data: unknown) => void;
  sendToSpectators: (event: string, data: unknown) => void;
  /**
   * Send data to all spectators who are currently following a specific player.
   * Used by competitive-individual games to forward per-player events to
   * spectators viewing that player's state.
   */
  sendToSpectatorFollowers: (targetPlayerId: string, event: string, data: unknown) => void;
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

// ─── Pausable Timer Entry ────────────────────────────────────────

interface PausableTimer {
  handle: NodeJS.Timeout | null;
  callback: () => void;
  /** Unix timestamp when the timer was (re)scheduled. */
  scheduledAt: number;
  /** Total delay in ms when (re)scheduled. */
  delayMs: number;
}

// ─── Abstract Base Class ─────────────────────────────────────────

export abstract class BaseMinigame {
  protected context: MinigameContext;
  protected gameState: Record<string, unknown> = {};
  /** Tracked pausable timers — replaced the old `timers: NodeJS.Timeout[]`. */
  private pausableTimers: PausableTimer[] = [];
  protected intervals: NodeJS.Timeout[] = [];
  protected isRunning: boolean = false;

  /** Number of pending tracked timeouts (for testing). */
  get pendingTimerCount(): number {
    return this.pausableTimers.length;
  }
  /** Interval handle for the current phase timer (managed by startPhaseTimer/clearPhaseTimer). */
  private phaseTimerInterval: NodeJS.Timeout | null = null;
  /** Whether the phase timer is paused. */
  private phaseTimerPaused: boolean = false;
  /** Remaining seconds snapshot when paused (for accurate resume). */
  private phaseTimerRemaining: number = 0;

  constructor(context: MinigameContext) {
    this.context = context;
  }

  /**
   * Read a host-configured game setting, falling back to the provided default
   * (which should be the matching constant). Type-safe via generic parameter.
   *
   * @example this.getSetting('totalRounds', RT_TOTAL_ROUNDS)
   */
  protected getSetting<T extends boolean | number | string>(key: string, fallback: T): T {
    const val = this.context.gameSettings[key];
    return (val !== undefined ? val : fallback) as T;
  }

  /** Called when the PLAYING phase begins. Start game logic here. */
  abstract start(): void;

  /** Called when a player sends an input/action. */
  abstract handleInput(userId: string, action: string, data: unknown): void;

  /** Return the scoped game state for a specific player (used for reconnection + heartbeat). */
  abstract getStateForPlayer(userId: string): unknown;

  /** Return the game state visible to spectators (omniscient/privileged view). */
  abstract getStateForSpectator(): unknown;

  /** Compute final results. Must be implemented by subclasses. */
  abstract computeResults(): MinigameResults;

  /**
   * Declares how spectators view this game:
   * - 'shared-privileged': Spectators see the highest-level omniscient view
   *   (e.g. spymaster grid in Undercover Agent, all guesses in Emoji Cinema).
   * - 'competitive-individual': All players are on equal footing; spectators
   *   pick a player to follow and view their individual state.
   */
  abstract get spectatorMode(): SpectatorMode;

  // ─── Unified Spectator State ──────────────────────────────────

  /**
   * Returns the spectator state for a competitive-individual game when the
   * spectator has selected a specific player to follow. By default, returns
   * the target player's state via getStateForPlayer(). Subclasses can override
   * to add spectator-specific annotations (e.g. labelling it as a spectator view).
   */
  getStateForSpectatorViewingPlayer(targetPlayerId: string): unknown {
    return this.getStateForPlayer(targetPlayerId);
  }

  /**
   * Unified entry point for spectator state, dispatching based on spectatorMode.
   *
   * - shared-privileged: always returns getStateForSpectator() (omniscient view)
   * - competitive-individual: returns the targeted player's state if provided,
   *   otherwise falls back to the omniscient getStateForSpectator() overview
   */
  getSpectatorSnapshot(targetPlayerId?: string): unknown {
    if (this.spectatorMode === 'competitive-individual' && targetPlayerId) {
      return this.getStateForSpectatorViewingPlayer(targetPlayerId);
    }
    return this.getStateForSpectator();
  }

  /**
   * Returns the list of players available for spectators to follow
   * in competitive-individual games. Used by the coordinator to populate
   * the spectator player-switcher UI.
   */
  getViewablePlayers(): Array<{ userId: string; userName: string }> {
    return Array.from(this.context.players.values()).map((p) => ({
      userId: p.userId,
      userName: p.userName,
    }));
  }

  // ─── Unified Reconnection ─────────────────────────────────────

  /**
   * Build a complete reconnection snapshot for a player or spectator.
   * Centralises reconnection state delivery so individual minigames
   * only need to override when they have extra async logic (e.g. WikiRace).
   */
  buildReconnectionSnapshot(userId: string, isSpectator: boolean, targetPlayerId?: string): unknown {
    if (isSpectator) {
      return this.getSpectatorSnapshot(targetPlayerId);
    }
    return this.getStateForPlayer(userId);
  }

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
   * Override for game-specific side effects only (e.g. re-fetching async data,
   * cancelling disconnect timers). State snapshot delivery is handled centrally
   * by ReconnectionHandler.attemptReconnect() using buildReconnectionSnapshot().
   */
  handlePlayerReconnect(_userId: string): void {
    // Default no-op — state snapshot is sent by ReconnectionHandler
  }

  // ─── Phase Timer Helpers ─────────────────────────────────────

  /**
   * Start a phase timer: emits TIMER_START, then TIMER_TICK every second.
   * Automatically cancels any previously running phase timer.
   * The interval is tracked and cleaned up with the rest of the game.
   */
  protected startPhaseTimer(durationSeconds: number): void {
    this.clearPhaseTimer();
    this.phaseTimerPaused = false;
    this.phaseTimerRemaining = durationSeconds;
    this.context.broadcastAction({
      type: 'TIMER_START',
      payload: { totalDuration: durationSeconds, timeRemaining: durationSeconds },
    });
    this.phaseTimerInterval = this.setInterval(() => {
      if (this.phaseTimerPaused) return;
      this.phaseTimerRemaining--;
      if (this.phaseTimerRemaining >= 0) {
        this.context.broadcastAction({
          type: 'TIMER_TICK',
          payload: { timeRemaining: this.phaseTimerRemaining },
        });
      }
    }, 1000);
  }

  /** Stop the current phase timer interval. */
  protected clearPhaseTimer(): void {
    if (this.phaseTimerInterval) {
      clearInterval(this.phaseTimerInterval);
      this.intervals = this.intervals.filter((i) => i !== this.phaseTimerInterval);
      this.phaseTimerInterval = null;
    }
    this.phaseTimerPaused = false;
  }

  /**
   * Broadcast an infinite phase timer: full ring + ∞ icon on clients.
   * No ticking, no auto-complete. The host advances via force-skip or a
   * game-specific continue action. Clears any previous phase timer first.
   *
   * @param showSkip — Whether to show the host "Next" button in the footer.
   *   Defaults to `false` so minigames that manage their own advancement
   *   (e.g. Undercover Agent) don't expose the generic skip button.
   */
  protected startInfinitePhaseTimer(showSkip = false): void {
    this.clearPhaseTimer();
    this.phaseTimerPaused = false;
    this.phaseTimerRemaining = -1;
    this.context.broadcastAction({
      type: 'TIMER_START',
      payload: { totalDuration: -1, timeRemaining: -1, showSkip },
    });
  }

  /** Pause the current phase timer and all tracked setTimeout timers. Broadcasts TIMER_PAUSED action. */
  pausePhaseTimer(): void {
    if (!this.phaseTimerInterval || this.phaseTimerPaused) return;
    this.phaseTimerPaused = true;

    // Suspend all tracked setTimeout timers — snapshot remaining time
    const now = Date.now();
    for (const pt of this.pausableTimers) {
      if (!pt.handle) continue;
      const elapsed = now - pt.scheduledAt;
      const remaining = Math.max(0, pt.delayMs - elapsed);
      pt.delayMs = remaining; // Store remaining for resume
      clearTimeout(pt.handle);
      pt.handle = null;
    }

    this.context.broadcastAction({
      type: 'TIMER_PAUSED',
      payload: { timeRemaining: Math.max(0, this.phaseTimerRemaining) },
    });
  }

  /** Resume the current phase timer and all tracked setTimeout timers. Broadcasts TIMER_RESUMED action. */
  resumePhaseTimer(): void {
    if (!this.phaseTimerInterval || !this.phaseTimerPaused) return;
    this.phaseTimerPaused = false;

    // Re-schedule all suspended setTimeout timers with their remaining time
    const now = Date.now();
    for (const pt of this.pausableTimers) {
      if (pt.handle) continue; // Already running (shouldn't happen)
      pt.scheduledAt = now;
      pt.handle = globalThis.setTimeout(() => {
        this.pausableTimers = this.pausableTimers.filter((x) => x !== pt);
        try {
          pt.callback();
        } catch (e) {
          this.context.onError(e as Error);
        }
      }, pt.delayMs);
    }

    this.context.broadcastAction({
      type: 'TIMER_RESUMED',
      payload: { timeRemaining: Math.max(0, this.phaseTimerRemaining) },
    });
  }

  /** Whether the phase timer is currently paused. */
  get isPhaseTimerPaused(): boolean {
    return this.phaseTimerPaused;
  }

  /**
   * Broadcast the current minigame sub-round (e.g. "Round 2/3") to all
   * clients, updating the footer round counter via the store.
   */
  protected broadcastRound(current: number, total: number): void {
    this.context.broadcastAction({
      type: 'MINIGAME_ROUND',
      payload: { current, total },
    });
  }

  /**
   * Broadcast a game action to all lobby members (players + spectators).
   * Convenience wrapper around `this.context.broadcastToLobby('rmhbox:game:action', data)`.
   * Subclasses can override to attach additional metadata (e.g. actionLog).
   */
  protected broadcastGameAction(data: Record<string, unknown>): void {
    this.context.broadcastToLobby('rmhbox:game:action', data);
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
    this.clearPhaseTimer();
    this.isRunning = false;
    for (const pt of this.pausableTimers) {
      if (pt.handle) clearTimeout(pt.handle);
    }
    this.pausableTimers = [];
    this.intervals.forEach((i) => clearInterval(i));
    this.intervals = [];
  }

  /**
   * Create a tracked timeout that is automatically cleaned up on game end.
   * Paused/resumed alongside the phase timer.
   * The callback is wrapped in try-catch to prevent unhandled exceptions.
   */
  protected setTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    const entry: PausableTimer = {
      handle: null,
      callback: fn,
      scheduledAt: Date.now(),
      delayMs: ms,
    };

    const handle = globalThis.setTimeout(() => {
      this.pausableTimers = this.pausableTimers.filter((x) => x !== entry);
      try {
        fn();
      } catch (e) {
        this.context.onError(e as Error);
      }
    }, ms);

    entry.handle = handle;
    this.pausableTimers.push(entry);
    return handle;
  }

  /**
   * Cancel and untrack a previously created setTimeout by its handle.
   * Safe to call with null/undefined or an already-fired timer.
   */
  protected clearTrackedTimeout(handle: NodeJS.Timeout | null): void {
    if (!handle) return;
    const entry = this.pausableTimers.find((pt) => pt.handle === handle);
    if (entry) {
      clearTimeout(handle);
      entry.handle = null;
      this.pausableTimers = this.pausableTimers.filter((pt) => pt !== entry);
    } else {
      // Handle might be from a paused timer (handle is null during pause)
      // or already removed — just clear it safely
      clearTimeout(handle);
    }
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
