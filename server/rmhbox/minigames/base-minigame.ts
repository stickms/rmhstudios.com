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
  /**
   * How many games of this same minigame the lobby has already finished in
   * this session (from the lobby's match history). Absent means unknown (0).
   */
  priorGamesOfThisMinigame?: number;
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
  /**
   * The handle returned to the caller by `setTimeout`. It never changes, so
   * `clearTrackedTimeout` still finds the entry after a pause/resume has
   * re-armed it under a new `handle`.
   */
  key: NodeJS.Timeout;
  /** The live timer, or null while paused. */
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
  /**
   * Whether the host has paused the game. Game-wide, not per phase: a phase
   * that starts while paused (an input can still end a phase) starts paused,
   * and tracked timeouts stay suspended until the host resumes.
   */
  private phaseTimerPaused: boolean = false;
  /** Remaining seconds of the current phase timer (-1 = infinite phase). */
  private phaseTimerRemaining: number = 0;
  /** Total seconds of the current phase timer (-1 = infinite phase). */
  private phaseTimerTotal: number = 0;
  /** Whether the current infinite phase shows the host "Next" button. */
  private phaseShowSkip: boolean = false;

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

  // ─── Initial State Broadcast ────────────────────────────────────

  /**
   * Send the initial GAME_STATE_SNAPSHOT to every player after start().
   *
   * Called by GameCoordinator.startPlaying() immediately after start() so
   * the client's Zustand store has the full game state *before* the
   * lazy-loaded minigame component mounts and subscribes to socket events.
   *
   * This centralises the "first-round initialisation" delivery that all
   * minigames require, preventing the race condition where the component
   * misses the initial broadcast.  Future minigames inherit this for free.
   *
   * @param snapshotEvent — the socket event name (S2C.GAME_STATE_SNAPSHOT)
   */
  broadcastInitialState(snapshotEvent: string): void {
    for (const [playerId] of this.context.players) {
      try {
        const playerState = this.getStateForPlayer(playerId);
        this.context.sendToPlayer(playerId, snapshotEvent, playerState);
      } catch {
        // Ignore — player may not be connected yet
      }
    }
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

  /** Audience (spectator) vote. Default: ignored; games with a voting phase override. */
  handleAudienceVote(_userId: string, _data: unknown): void {
    // Default no-op
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
    this.phaseTimerRemaining = durationSeconds;
    this.phaseTimerTotal = durationSeconds;
    this.phaseShowSkip = false;
    this.context.broadcastAction({
      type: 'TIMER_START',
      payload: { totalDuration: durationSeconds, timeRemaining: durationSeconds },
    });
    this.rebroadcastPauseIfPaused();
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
    // No timer now: a reconnect snapshot must not report the last phase's clock.
    this.phaseTimerRemaining = 0;
    this.phaseTimerTotal = 0;
    this.phaseShowSkip = false;
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
    this.phaseTimerRemaining = -1;
    this.phaseTimerTotal = -1;
    this.phaseShowSkip = showSkip;
    this.context.broadcastAction({
      type: 'TIMER_START',
      payload: { totalDuration: -1, timeRemaining: -1, showSkip },
    });
    this.rebroadcastPauseIfPaused();
  }

  /** TIMER_START clears the client's paused flag; restate it while the game is paused. */
  private rebroadcastPauseIfPaused(): void {
    if (!this.phaseTimerPaused) return;
    this.context.broadcastAction({
      type: 'TIMER_PAUSED',
      payload: { timeRemaining: this.pausedDisplayRemaining() },
    });
  }

  private pausedDisplayRemaining(): number {
    return this.phaseTimerRemaining === -1 ? -1 : Math.max(0, this.phaseTimerRemaining);
  }

  /**
   * The host pressed "Next" (GAME_FORCE_SKIP) while the game is PLAYING.
   * The button is only shown in an infinite phase started with
   * `startInfinitePhaseTimer(true)`, so by default the press ends such a
   * phase through `forceEnd('host_skip')` and is ignored anywhere else.
   * Games whose "Next" means something narrower override this.
   */
  handleHostSkip(): void {
    if (this.phaseTimerRemaining === -1 && this.phaseShowSkip) {
      this.forceEnd('host_skip');
    }
  }

  /**
   * Pause the game: the phase timer and every tracked setTimeout timer.
   * Works in any phase, timed or infinite. Broadcasts TIMER_PAUSED.
   */
  pausePhaseTimer(): void {
    if (this.phaseTimerPaused) return;
    this.phaseTimerPaused = true;

    // Suspend all tracked setTimeout timers — snapshot remaining time
    const now = Date.now();
    for (const pt of this.pausableTimers) {
      if (!pt.handle) continue;
      const elapsed = now - pt.scheduledAt;
      pt.delayMs = Math.max(0, pt.delayMs - elapsed); // Store remaining for resume
      clearTimeout(pt.handle);
      pt.handle = null;
    }

    this.context.broadcastAction({
      type: 'TIMER_PAUSED',
      payload: { timeRemaining: this.pausedDisplayRemaining() },
    });
  }

  /** Resume the game: the phase timer and all tracked setTimeout timers. Broadcasts TIMER_RESUMED. */
  resumePhaseTimer(): void {
    if (!this.phaseTimerPaused) return;
    this.phaseTimerPaused = false;

    // Re-schedule all suspended setTimeout timers with their remaining time
    for (const pt of this.pausableTimers) {
      if (pt.handle) continue; // Already running (shouldn't happen)
      this.armTimer(pt);
    }

    this.context.broadcastAction({
      type: 'TIMER_RESUMED',
      payload: { timeRemaining: this.pausedDisplayRemaining() },
    });
  }

  /** Whether the phase timer is currently paused. */
  get isPhaseTimerPaused(): boolean {
    return this.phaseTimerPaused;
  }

  /**
   * Return the current phase timer state so it can be sent to a
   * reconnecting player or a spectator switching targets, avoiding
   * the "full timer" flash before the next tick.
   */
  getPhaseTimerSnapshot(): { total: number; remaining: number; paused: boolean; infinite: boolean; showSkip: boolean } | null {
    // No active timer
    if (!this.phaseTimerInterval && this.phaseTimerRemaining === 0) return null;
    const infinite = this.phaseTimerRemaining === -1;
    return {
      total: infinite ? -1 : this.phaseTimerTotal,
      remaining: infinite ? -1 : Math.max(0, this.phaseTimerRemaining),
      paused: this.phaseTimerPaused,
      infinite,
      showSkip: infinite && this.phaseShowSkip,
    };
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
    const key = globalThis.setTimeout(() => {}, 0);
    clearTimeout(key);
    const entry: PausableTimer = {
      key,
      handle: null,
      callback: fn,
      scheduledAt: Date.now(),
      delayMs: ms,
    };
    this.pausableTimers.push(entry);
    // Created while paused (an input handler can schedule one): it waits for resume.
    if (!this.phaseTimerPaused) this.armTimer(entry);
    return key;
  }

  /** (Re)schedule a tracked timeout for its remaining `delayMs`. */
  private armTimer(entry: PausableTimer): void {
    entry.scheduledAt = Date.now();
    entry.handle = globalThis.setTimeout(() => {
      this.pausableTimers = this.pausableTimers.filter((x) => x !== entry);
      try {
        entry.callback();
      } catch (e) {
        this.context.onError(e as Error);
      }
    }, entry.delayMs);
  }

  /**
   * Cancel and untrack a previously created setTimeout by the handle it
   * returned. Safe to call with null/undefined or an already-fired timer, and
   * across a pause/resume (the entry is found by its stable key).
   */
  protected clearTrackedTimeout(handle: NodeJS.Timeout | null | undefined): void {
    if (!handle) return;
    const entry = this.pausableTimers.find((pt) => pt.key === handle || pt.handle === handle);
    if (entry) {
      if (entry.handle) clearTimeout(entry.handle);
      entry.handle = null;
      this.pausableTimers = this.pausableTimers.filter((pt) => pt !== entry);
    } else {
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
