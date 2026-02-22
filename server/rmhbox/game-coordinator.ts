/**
 * RMHbox — Game Coordinator
 *
 * Orchestrates the minigame lifecycle state machine:
 * WAITING → VOTING → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING
 *
 * Responsibilities:
 * - Driving the game lifecycle (instructions → preloading → countdown → playing → results)
 * - Instantiating and managing minigame handlers with fault isolation
 * - Routing player inputs to the active minigame handler
 * - Handling host force-skip for all phases
 * - Managing player disconnects during gameplay
 *
 * Reference: docs/rmhbox/design-spec/core.md §7
 * Implementation: docs/rmhbox/implementation/phase-3.md §2
 */

import { Server, Socket } from 'socket.io';
import { LobbyManager } from './lobby-manager';
import { StateSyncService } from './state-sync';
import { LeaderboardService } from './leaderboard';
import { logger } from './logger';
import { S2C } from '../../lib/rmhbox/events';
import { MINIGAME_REGISTRY } from '../../lib/rmhbox/minigame-registry';
import {
  COUNTDOWN_SECONDS,
  PRELOAD_TIMEOUT_MS,
  RESULTS_DISPLAY_SECONDS,
} from '../../lib/rmhbox/constants';
import { validated, SelectGameSchema, ForceSkipSchema, ReadyToRenderSchema, GameInputSchema } from './schemas';
import type { MinigameDefinition, RoundResultsPayload, SessionStanding } from '../../lib/rmhbox/types';
import type { RMHboxLobby, ServerMatchSummary } from './types';
import type { BaseMinigame, MinigameContext, MinigameResults } from './minigames/base-minigame';
import { RhymeTimeMinigame } from './minigames/rhyme-time';
import { UndercoverAgentMinigame } from './minigames/undercover-agent';
import { CategoryCrashMinigame } from './minigames/category-crash';
import { WikiRaceMinigame } from './minigames/wiki-race';

// ─── Minigame Server Registry ────────────────────────────────────

/**
 * Maps minigameId → server-side minigame class constructor.
 * Registered minigames are instantiated when the PLAYING phase begins.
 */
export const MINIGAME_SERVER_REGISTRY = new Map<
  string,
  new (context: MinigameContext) => BaseMinigame
>([
  ['rhyme-time', RhymeTimeMinigame],
  ['undercover-agent', UndercoverAgentMinigame],
  ['category-crash', CategoryCrashMinigame],
  ['wiki-race', WikiRaceMinigame],
]);

// ─── Per-lobby lifecycle tracking ────────────────────────────────

interface LifecycleState {
  /** Timer for the current phase (instructions, preloading, countdown, results) */
  phaseTimer: ReturnType<typeof setTimeout> | null;
  /** Cancel function for timer tick broadcast */
  cancelTimerBroadcast: (() => void) | null;
  /** Set of userIds who have sent ready_to_render during PRELOADING */
  readyPlayers: Set<string>;
}

// ─── GameCoordinator ─────────────────────────────────────────────

export class GameCoordinator {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;
  private readonly stateSync: StateSyncService;
  private readonly leaderboardService: LeaderboardService;
  /** Per-lobby lifecycle state tracking */
  private readonly lifecycles = new Map<string, LifecycleState>();

  constructor(io: Server, lobbyManager: LobbyManager, stateSync: StateSyncService, leaderboardService?: LeaderboardService) {
    this.io = io;
    this.lobbyManager = lobbyManager;
    this.stateSync = stateSync;
    this.leaderboardService = leaderboardService ?? new LeaderboardService();
  }

  // ─── Connection Handler (§2.6) ────────────────────────────────

  handleConnection(socket: Socket): void {
    socket.on('rmhbox:game:select', validated(socket, 'rmhbox:game:select', SelectGameSchema, (s, d) => this.onSelect(s, d)));
    socket.on('rmhbox:game:force_skip', validated(socket, 'rmhbox:game:force_skip', ForceSkipSchema, (s, d) => this.onForceSkip(s, d)));
    socket.on('rmhbox:game:ready_to_render', validated(socket, 'rmhbox:game:ready_to_render', ReadyToRenderSchema, (s, d) => this.onReadyToRender(s, d)));
    socket.on('rmhbox:game:input', validated(socket, 'rmhbox:game:input', GameInputSchema, (s, d) => this.onInput(s, d)));
  }

  // ─── Disconnect Handler (§2.8) ────────────────────────────────

  handleDisconnect(socket: Socket): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);
    if (!lobby || lobby.state !== 'PLAYING' || !lobby.currentGame) return;

    const handler = lobby.currentGame.handler;

    // Notify the active minigame handler
    try {
      handler.handlePlayerDisconnect(userId);
    } catch (err) {
      logger.error({ event: 'game_disconnect_handler_error', lobbyId: lobby.id, userId, error: String(err) });
    }

    // Check if remaining connected players < minPlayers
    const def = MINIGAME_REGISTRY[lobby.currentGame.minigameId];
    if (def) {
      const connectedCount = Array.from(lobby.players.values()).filter((p) => p.isConnected).length;
      if (connectedCount < def.minPlayers) {
        logger.info({ event: 'force_end_insufficient_players', lobbyId: lobby.id, connectedCount, minPlayers: def.minPlayers });
        try {
          handler.forceEnd('insufficient_players');
        } catch (err) {
          logger.error({ event: 'force_end_error', lobbyId: lobby.id, error: String(err) });
          this.handleGameError(lobby.id, err as Error);
        }
      }
    }
  }

  // ─── Host Start Game (§2.5) ────────────────────────────────
  // Host presses "Start Game" — starts the game flow for the picked minigame.
  // Vote mode is handled client-side by emitting GAME_START_VOTE instead.

  private onSelect(socket: Socket, payload: { lobbyId: string; minigameId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);

    if (!lobby || lobby.id !== payload.lobbyId) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in this lobby.' });
      return;
    }

    if (lobby.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can start the game.' });
      return;
    }

    if (lobby.state !== 'WAITING') {
      socket.emit(S2C.ERROR, { code: 'INVALID_STATE', message: 'Lobby must be in WAITING state.' });
      return;
    }

    const def = MINIGAME_REGISTRY[payload.minigameId];
    if (!def) {
      socket.emit(S2C.ERROR, { code: 'INVALID_GAME', message: 'Unknown minigame.' });
      return;
    }

    const playerCount = lobby.players.size;
    if (playerCount < def.minPlayers || playerCount > def.maxPlayers) {
      socket.emit(S2C.ERROR, {
        code: 'INSUFFICIENT_PLAYERS',
        message: `This game requires ${def.minPlayers}–${def.maxPlayers} players (current: ${playerCount}).`,
      });
      return;
    }

    logger.info({ event: 'game_direct_select', lobbyId: lobby.id, userId, minigameId: payload.minigameId });
    this.startGameFlow(lobby.id, payload.minigameId);
  }

  // ─── Host Force-Skip (§2.7) ───────────────────────────────────

  private onForceSkip(socket: Socket, payload: { lobbyId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);

    if (!lobby || lobby.id !== payload.lobbyId) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in this lobby.' });
      return;
    }

    if (lobby.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can force-skip.' });
      return;
    }

    const lifecycle = this.lifecycles.get(lobby.id);

    switch (lobby.state) {
      // VOTING is handled by VoteManager — this handler won't fire for VOTING
      // because VoteManager also registers on the same event and validates state
      case 'INSTRUCTIONS':
        logger.info({ event: 'force_skip_instructions', lobbyId: lobby.id, userId });
        this.clearLifecycleTimers(lobby.id);
        this.startPreloading(lobby);
        break;

      case 'PRELOADING':
        logger.info({ event: 'force_skip_preloading', lobbyId: lobby.id, userId });
        // Force-mark all as ready
        if (lifecycle) {
          for (const pid of lobby.players.keys()) {
            lifecycle.readyPlayers.add(pid);
          }
        }
        this.clearLifecycleTimers(lobby.id);
        this.lobbyManager.addSystemChat(lobby.id, 'Host skipped preloading.');
        this.startCountdown(lobby);
        break;

      case 'COUNTDOWN':
        // Don't skip — only 3 seconds
        break;

      case 'PLAYING':
        // Force-end the current game immediately and return to lobby
        logger.info({ event: 'force_end_game', lobbyId: lobby.id, userId });
        this.clearLifecycleTimers(lobby.id);
        if (lobby.currentGame?.handler) {
          lobby.currentGame.handler.cleanup();
        }
        this.lobbyManager.addSystemChat(lobby.id, 'Host force-ended the game.');
        this.returnToWaiting(lobby);
        break;

      case 'ROUND_RESULTS':
        logger.info({ event: 'force_skip_results', lobbyId: lobby.id, userId });
        this.clearLifecycleTimers(lobby.id);
        this.returnToWaiting(lobby);
        break;

      default:
        // No-op for other states
        break;
    }
  }

  // ─── Ready To Render (§2.2 Step 2) ────────────────────────────

  private onReadyToRender(socket: Socket, payload: { lobbyId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);

    if (!lobby || lobby.id !== payload.lobbyId) return;
    if (lobby.state !== 'PRELOADING') return;

    const lifecycle = this.lifecycles.get(lobby.id);
    if (!lifecycle) return;

    lifecycle.readyPlayers.add(userId);

    // Broadcast preload progress
    const progressPayload = this.buildPreloadProgress(lobby, lifecycle);
    this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_PRELOAD_PROGRESS, progressPayload);

    logger.info({ event: 'player_ready_to_render', lobbyId: lobby.id, userId, allReady: progressPayload.allReady });

    // If all players ready, proceed to countdown
    if (progressPayload.allReady) {
      this.clearLifecycleTimers(lobby.id);
      this.startCountdown(lobby);
    }
  }

  // ─── Game Input (§2.2 Step 4) ─────────────────────────────────

  private onInput(socket: Socket, payload: { lobbyId: string; action: string; data: unknown }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);

    if (!lobby || lobby.id !== payload.lobbyId) return;
    if (lobby.state !== 'PLAYING' || !lobby.currentGame) return;

    // Spectator input gating (§5.2) — silently drop
    if (!lobby.players.has(userId)) return;

    try {
      lobby.currentGame.handler.handleInput(userId, payload.action, payload.data);
    } catch (err) {
      logger.error({ event: 'game_input_error', lobbyId: lobby.id, userId, action: payload.action, error: String(err) });
    }
  }

  // ─── Game Flow Orchestration (§2.2) ───────────────────────────

  startGameFlow(lobbyId: string, minigameId: string): void {
    const lobby = this.lobbyManager.getLobby(lobbyId);
    if (!lobby) return;

    const def = MINIGAME_REGISTRY[minigameId];

    // Validate minigame exists in either client or server registry
    if (!def && !MINIGAME_SERVER_REGISTRY.has(minigameId)) {
      logger.warn({ event: 'unknown_minigame', lobbyId, minigameId });
      this.lobbyManager.broadcastAction(lobbyId, {
        type: 'STATE_CHANGED',
        payload: { state: 'WAITING', reason: 'INVALID_GAME', message: 'Unknown minigame selected.' },
      });
      lobby.state = 'WAITING';
      return;
    }

    // Validate player count
    if (def) {
      const playerCount = lobby.players.size;
      if (playerCount < def.minPlayers || playerCount > def.maxPlayers) {
        logger.warn({ event: 'player_count_mismatch', lobbyId, minigameId, playerCount, min: def.minPlayers, max: def.maxPlayers });
        this.lobbyManager.broadcastAction(lobbyId, {
          type: 'STATE_CHANGED',
          payload: { state: 'WAITING', reason: 'INSUFFICIENT_PLAYERS', message: 'Not enough players for this game.' },
        });
        lobby.state = 'WAITING';
        return;
      }
    }

    // Store the intended minigame on the lobby for later phases
    lobby.currentGame = {
      minigameId,
      handler: null as unknown as BaseMinigame,
      startedAt: Date.now(),
    };

    // Broadcast GAME_SELECTED so clients get currentGame via incremental action
    // before the full sync arrives in the next phase transition
    const def2 = this.getMinigameDef(minigameId);
    this.lobbyManager.broadcastAction(lobbyId, {
      type: 'GAME_SELECTED',
      payload: {
        game: {
          minigameId,
          displayName: def2?.displayName ?? minigameId,
          phase: 'instructions',
          timeRemaining: null,
          publicState: {},
          privateState: {},
        },
      },
    });

    logger.info({ event: 'game_flow_started', lobbyId, minigameId });
    this.startInstructions(lobby, minigameId);
  }

  // ─── Step 1: INSTRUCTIONS Phase ───────────────────────────────

  private startInstructions(lobby: RMHboxLobby, minigameId: string): void {
    const def = this.getMinigameDef(minigameId);
    const durationSeconds = def?.instructionDurationSeconds ?? 15;

    lobby.state = 'INSTRUCTIONS';
    lobby.lastActivityAt = Date.now();

    this.lobbyManager.broadcastAction(lobby.id, { type: 'STATE_CHANGED', payload: { state: 'INSTRUCTIONS' } });

    // Broadcast instructions payload
    const instructionsPayload = {
      minigameId,
      title: def?.displayName ?? minigameId,
      description: def?.description ?? '',
      rules: [] as string[],
      tips: [] as string[],
      controls: [] as Array<{ platform: string; action: string; description: string }>,
      durationSeconds,
      estimatedGameDuration: def?.estimatedDurationSeconds ?? 60,
      playerCount: {
        min: def?.minPlayers ?? 2,
        max: def?.maxPlayers ?? 16,
        current: lobby.players.size,
      },
      teams: def?.supportsTeams ?? false,
    };

    this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_INSTRUCTIONS, instructionsPayload);

    // Send full state sync on phase transition
    this.stateSync.broadcastFullSync(lobby.id);

    // Start instruction timer with tick broadcast
    const cancelTimer = this.stateSync.startTimerBroadcast(lobby.id, durationSeconds, () => {
      this.startPreloading(lobby);
    });

    this.lifecycles.set(lobby.id, {
      phaseTimer: null,
      cancelTimerBroadcast: cancelTimer,
      readyPlayers: new Set(),
    });

    logger.info({ event: 'instructions_started', lobbyId: lobby.id, minigameId, durationSeconds });
  }

  // ─── Step 2: PRELOADING Phase ─────────────────────────────────

  private startPreloading(lobby: RMHboxLobby): void {
    const minigameId = lobby.currentGame?.minigameId;
    if (!minigameId) return;

    const def = this.getMinigameDef(minigameId);

    lobby.state = 'PRELOADING';
    lobby.lastActivityAt = Date.now();

    this.lobbyManager.broadcastAction(lobby.id, { type: 'STATE_CHANGED', payload: { state: 'PRELOADING' } });

    // Broadcast preload manifest
    const manifest = def?.preloadAssets ?? { images: [], sounds: [], data: [], estimatedSizeBytes: 0 };
    this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_PRELOAD_START, { manifest });

    // Send full state sync
    this.stateSync.broadcastFullSync(lobby.id);

    // Initialize lifecycle tracking
    let lifecycle = this.lifecycles.get(lobby.id);
    if (!lifecycle) {
      lifecycle = { phaseTimer: null, cancelTimerBroadcast: null, readyPlayers: new Set() };
      this.lifecycles.set(lobby.id, lifecycle);
    } else {
      lifecycle.readyPlayers = new Set();
    }

    // Preload timeout — force-proceed after 30s
    const timer = setTimeout(() => {
      const currentLobby = this.lobbyManager.getLobby(lobby.id);
      if (!currentLobby || currentLobby.state !== 'PRELOADING') return;

      // Force-mark all unready players
      for (const pid of currentLobby.players.keys()) {
        lifecycle!.readyPlayers.add(pid);
      }

      this.lobbyManager.addSystemChat(lobby.id, 'Preloading timed out — starting game.');
      logger.info({ event: 'preload_timeout', lobbyId: lobby.id });
      this.startCountdown(currentLobby);
    }, PRELOAD_TIMEOUT_MS);

    lifecycle.phaseTimer = timer;

    logger.info({ event: 'preloading_started', lobbyId: lobby.id, minigameId });
  }

  // ─── Step 3: COUNTDOWN Phase ──────────────────────────────────

  private startCountdown(lobby: RMHboxLobby): void {
    lobby.state = 'COUNTDOWN';
    lobby.lastActivityAt = Date.now();

    this.lobbyManager.broadcastAction(lobby.id, { type: 'STATE_CHANGED', payload: { state: 'COUNTDOWN' } });
    this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_COUNTDOWN, { seconds: COUNTDOWN_SECONDS });

    // Send full state sync
    this.stateSync.broadcastFullSync(lobby.id);

    const cancelTimer = this.stateSync.startTimerBroadcast(lobby.id, COUNTDOWN_SECONDS, () => {
      const currentLobby = this.lobbyManager.getLobby(lobby.id);
      if (!currentLobby || currentLobby.state !== 'COUNTDOWN') return;
      this.startPlaying(currentLobby);
    });

    let lifecycle = this.lifecycles.get(lobby.id);
    if (!lifecycle) {
      lifecycle = { phaseTimer: null, cancelTimerBroadcast: cancelTimer, readyPlayers: new Set() };
      this.lifecycles.set(lobby.id, lifecycle);
    } else {
      lifecycle.cancelTimerBroadcast = cancelTimer;
    }

    logger.info({ event: 'countdown_started', lobbyId: lobby.id, seconds: COUNTDOWN_SECONDS });
  }

  // ─── Step 4: PLAYING Phase ────────────────────────────────────

  private startPlaying(lobby: RMHboxLobby): void {
    const minigameId = lobby.currentGame?.minigameId;
    if (!minigameId) return;

    lobby.state = 'PLAYING';
    lobby.lastActivityAt = Date.now();

    this.lobbyManager.broadcastAction(lobby.id, { type: 'STATE_CHANGED', payload: { state: 'PLAYING' } });
    this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_STARTED, { minigameId });

    // Send full state sync
    this.stateSync.broadcastFullSync(lobby.id);

    // Look up server-side handler class
    const GameClass = MINIGAME_SERVER_REGISTRY.get(minigameId);
    if (!GameClass) {
      // No server handler registered — auto-complete with empty results after game duration
      logger.warn({ event: 'no_server_handler', lobbyId: lobby.id, minigameId });
      lobby.currentGame = {
        minigameId,
        handler: null as unknown as BaseMinigame,
        startedAt: Date.now(),
      };

      // Auto-complete after the estimated game duration or a fallback of 60s
      const def = this.getMinigameDef(minigameId);
      const fallbackDurationMs = (def?.estimatedDurationSeconds ?? 60) * 1000;
      let lifecycle = this.lifecycles.get(lobby.id);
      if (!lifecycle) {
        lifecycle = { phaseTimer: null, cancelTimerBroadcast: null, readyPlayers: new Set() };
        this.lifecycles.set(lobby.id, lifecycle);
      }
      lifecycle.phaseTimer = setTimeout(() => {
        const currentLobby = this.lobbyManager.getLobby(lobby.id);
        if (!currentLobby || currentLobby.state !== 'PLAYING') return;

        // Build placeholder results from current players
        const players = Array.from(currentLobby.players.values());
        const placeholderResults: MinigameResults = {
          rankings: players.map((p, idx) => ({
            userId: p.userId,
            userName: p.userName,
            score: 0,
            rank: idx + 1,
            deltas: {},
          })),
          awards: [],
          gameSpecificData: {},
          duration: fallbackDurationMs,
        };
        this.handleGameComplete(lobby.id, placeholderResults);
      }, fallbackDurationMs);

      // Start timer broadcast for the duration
      lifecycle.cancelTimerBroadcast = this.stateSync.startTimerBroadcast(
        lobby.id,
        Math.ceil(fallbackDurationMs / 1000),
        () => { /* timer expiry handled by phaseTimer above */ },
      );

      return;
    }

    // Build MinigameContext for the handler
    const context: MinigameContext = {
      lobbyId: lobby.id,
      players: new Map(lobby.players),
      settings: { ...lobby.settings },
      broadcastToLobby: (event: string, data: unknown) => {
        this.io.to(`lobby:${lobby.id}`).emit(event, data);
      },
      broadcastToPlayers: (event: string, data: unknown) => {
        this.lobbyManager.broadcastToPlayers(lobby.id, event, data);
      },
      sendToPlayer: (userId: string, event: string, data: unknown) => {
        this.lobbyManager.sendToPlayer(lobby.id, userId, event, data);
      },
      sendToSpectators: (event: string, data: unknown) => {
        this.lobbyManager.broadcastToSpectators(lobby.id, event, data);
      },
      onComplete: (results: MinigameResults) => {
        this.handleGameComplete(lobby.id, results);
      },
      onError: (error: Error) => {
        this.handleGameError(lobby.id, error);
      },
    };

    // Instantiate game handler with fault isolation
    try {
      const gameInstance = new GameClass(context);
      lobby.currentGame = {
        minigameId,
        handler: gameInstance,
        startedAt: Date.now(),
      };
      gameInstance.start();
      logger.info({ event: 'game_handler_started', lobbyId: lobby.id, minigameId });
    } catch (err) {
      logger.error({ event: 'game_start_error', lobbyId: lobby.id, minigameId, error: String(err) });
      this.handleGameError(lobby.id, err as Error);
    }
  }

  // ─── Game Complete (§2.3) ─────────────────────────────────────

  handleGameComplete(lobbyId: string, results: MinigameResults): void {
    const lobby = this.lobbyManager.getLobby(lobbyId);
    if (!lobby) return;

    // Clean up game handler
    if (lobby.currentGame?.handler) {
      try {
        lobby.currentGame.handler.cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    // Increment round number
    lobby.roundNumber++;

    // Update player scores
    for (const ranking of results.rankings) {
      const player = lobby.players.get(ranking.userId);
      if (player) {
        player.roundScore = ranking.score;
        player.score += ranking.score;
      }
    }

    // Transition to ROUND_RESULTS
    lobby.state = 'ROUND_RESULTS';
    lobby.lastActivityAt = Date.now();

    this.lobbyManager.broadcastAction(lobbyId, { type: 'STATE_CHANGED', payload: { state: 'ROUND_RESULTS' } });

    // Build session standings (cumulative scores sorted)
    const sessionStandings: SessionStanding[] = Array.from(lobby.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({
        userId: p.userId,
        userName: p.userName,
        totalScore: p.score,
        wins: lobby.matchHistory.filter((m) => m.standings[0]?.userId === p.userId).length,
        rank: idx + 1,
      }));

    // Broadcast round results
    const roundResults: RoundResultsPayload = {
      minigameId: lobby.currentGame?.minigameId ?? '',
      rankings: results.rankings,
      awards: results.awards,
      roundNumber: lobby.roundNumber,
      sessionStandings,
    };

    this.io.to(`lobby:${lobbyId}`).emit(S2C.GAME_ROUND_RESULTS, roundResults);

    // Add to match history (using ServerMatchSummary format)
    const serverMatch: ServerMatchSummary = {
      minigameId: lobby.currentGame?.minigameId ?? '',
      roundNumber: lobby.roundNumber,
      startedAt: lobby.currentGame?.startedAt ?? Date.now(),
      endedAt: Date.now(),
      standings: results.rankings.map((r) => ({
        userId: r.userId,
        userName: r.userName,
        score: r.score,
        rank: r.rank,
      })),
    };
    lobby.matchHistory.push(serverMatch);

    // Async persistence — fire-and-forget, never blocks game flow
    this.leaderboardService.persistMatchResults(
      lobbyId,
      lobby.currentGame?.minigameId ?? '',
      results,
      lobby.players,
      null,
    ).catch((err) => {
      logger.error({ event: 'match_persist_fire_forget_error', lobbyId, error: String(err) });
    });

    logger.info({ event: 'match_results_persisted_async', lobbyId, roundNumber: lobby.roundNumber });

    // Send full state sync
    this.stateSync.broadcastFullSync(lobbyId);

    // Start results display timer
    const cancelTimer = this.stateSync.startTimerBroadcast(lobbyId, RESULTS_DISPLAY_SECONDS, () => {
      const currentLobby = this.lobbyManager.getLobby(lobbyId);
      if (!currentLobby || currentLobby.state !== 'ROUND_RESULTS') return;
      this.returnToWaiting(currentLobby);
    });

    let lifecycle = this.lifecycles.get(lobbyId);
    if (!lifecycle) {
      lifecycle = { phaseTimer: null, cancelTimerBroadcast: cancelTimer, readyPlayers: new Set() };
      this.lifecycles.set(lobbyId, lifecycle);
    } else {
      lifecycle.cancelTimerBroadcast = cancelTimer;
    }

    logger.info({ event: 'round_results_displayed', lobbyId, roundNumber: lobby.roundNumber });
  }

  // ─── Game Error (§2.4) ────────────────────────────────────────

  handleGameError(lobbyId: string, error: Error): void {
    const lobby = this.lobbyManager.getLobby(lobbyId);
    if (!lobby) return;

    logger.error({ event: 'game_error', lobbyId, error: error.message, stack: error.stack });

    // Clean up broken game handler
    if (lobby.currentGame?.handler) {
      try {
        lobby.currentGame.handler.cleanup();
      } catch {
        // Ignore cleanup errors on already-broken handler
      }
    }

    lobby.currentGame = null;
    lobby.state = 'WAITING';
    lobby.lastActivityAt = Date.now();

    this.lobbyManager.broadcastAction(lobbyId, {
      type: 'STATE_CHANGED',
      payload: {
        state: 'WAITING',
        reason: 'GAME_ERROR',
        message: 'The game encountered an error and was ended. Sorry about that!',
      },
    });

    this.lobbyManager.addSystemChat(lobbyId, 'The game encountered an error and was ended.');

    // Send full state sync
    this.stateSync.broadcastFullSync(lobbyId);

    // Clean up lifecycle tracking
    this.clearLifecycleTimers(lobbyId);
    this.lifecycles.delete(lobbyId);
  }

  // ─── Return to Waiting ────────────────────────────────────────

  private returnToWaiting(lobby: RMHboxLobby): void {
    lobby.currentGame = null;
    lobby.selectedGame = null;
    lobby.state = 'WAITING';
    lobby.lastActivityAt = Date.now();

    // Reset player ready states and round scores (host stays ready)
    for (const player of lobby.players.values()) {
      player.isReady = player.userId === lobby.hostUserId;
      player.roundScore = 0;
    }

    this.lobbyManager.broadcastAction(lobby.id, { type: 'STATE_CHANGED', payload: { state: 'WAITING' } });

    // Send full state sync
    this.stateSync.broadcastFullSync(lobby.id);

    // Clean up lifecycle tracking
    this.clearLifecycleTimers(lobby.id);
    this.lifecycles.delete(lobby.id);

    logger.info({ event: 'returned_to_waiting', lobbyId: lobby.id });
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /** Check if a minigame ID exists in either the client or server registry */
  private isRegisteredMinigame(minigameId: string): boolean {
    return minigameId in MINIGAME_REGISTRY || MINIGAME_SERVER_REGISTRY.has(minigameId);
  }

  /** Get minigame definition from the client-side registry */
  private getMinigameDef(minigameId: string): MinigameDefinition | undefined {
    return MINIGAME_REGISTRY[minigameId];
  }

  /** Build preload progress payload */
  private buildPreloadProgress(lobby: RMHboxLobby, lifecycle: LifecycleState) {
    const players = Array.from(lobby.players.values()).map((p) => ({
      userId: p.userId,
      userName: p.userName,
      ready: lifecycle.readyPlayers.has(p.userId),
    }));
    const allReady = players.every((p) => p.ready);
    return { players, allReady };
  }

  /** Clear all lifecycle timers for a lobby */
  private clearLifecycleTimers(lobbyId: string): void {
    const lifecycle = this.lifecycles.get(lobbyId);
    if (!lifecycle) return;

    if (lifecycle.phaseTimer) {
      clearTimeout(lifecycle.phaseTimer);
      lifecycle.phaseTimer = null;
    }
    if (lifecycle.cancelTimerBroadcast) {
      lifecycle.cancelTimerBroadcast();
      lifecycle.cancelTimerBroadcast = null;
    }
  }
}
