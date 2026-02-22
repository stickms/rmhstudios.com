/**
 * RMHbox — Lobby Manager
 *
 * Handles lobby CRUD, player joins/leaves, host controls,
 * lobby browsing, ready-up, spectator promotion, and garbage
 * collection of idle lobbies.
 *
 * Reference: docs/rmhbox/design-spec/core.md §6
 * Implementation: docs/rmhbox/implementation/phase-2.md §1–§12
 */

import { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { config } from './config';
import { logger } from './logger';
import { generateRoomCode } from '../../lib/rmhbox/utils';
import { S2C } from '../../lib/rmhbox/events';
import type { GameAction, ChatMessage, ClientLobbyState, ClientPlayerInfo, ClientSpectatorInfo, ClientGameInfo, PublicLobbyInfo, MatchSummary } from '../../lib/rmhbox/types';
import type { RMHboxLobby, LobbySettings, RMHboxPlayer, RMHboxSpectator } from './types';
import {
  CreateLobbySchema,
  JoinLobbySchema,
  LeaveLobbySchema,
  KickPlayerSchema,
  TransferHostSchema,
  UpdateSettingsSchema,
  EndSessionSchema,
  ToggleReadySchema,
  RequestPromotionSchema,
  BrowseLobbiesSchema,
} from './schemas';
import { validated } from './schemas';

/** Maximum attempts to generate a unique lobby ID before throwing */
const MAX_CODE_ATTEMPTS = 10;

/** Delay before a disbanded lobby is fully cleaned up after session results */
const SESSION_RESULTS_DISBAND_DELAY_MS = 15_000;

export class LobbyManager {
  private readonly io: Server;
  private readonly lobbies = new Map<string, RMHboxLobby>();
  /** Fast userId → lobbyId index for O(1) lookup */
  private readonly userToLobby = new Map<string, string>();
  /** Per-lobby incrementing sequence counter for game actions */
  private readonly seqCounters = new Map<string, number>();
  /** Grace period timers keyed by userId */
  private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** End-session disband timers keyed by lobbyId */
  private readonly disbandTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private gcInterval: ReturnType<typeof setInterval> | null = null;

  constructor(io: Server) {
    this.io = io;
  }

  // ─── Lobby accessors (§12.1) ───────────────────────────────

  getLobbies(): Map<string, RMHboxLobby> {
    return this.lobbies;
  }

  getLobby(lobbyId: string): RMHboxLobby | undefined {
    return this.lobbies.get(lobbyId);
  }

  getLobbyByUserId(userId: string): RMHboxLobby | undefined {
    const lobbyId = this.userToLobby.get(userId);
    if (!lobbyId) return undefined;
    return this.lobbies.get(lobbyId);
  }

  /** Alias for getLobbyByUserId */
  findLobbyByUserId(userId: string): RMHboxLobby | undefined {
    return this.getLobbyByUserId(userId);
  }

  getLobbyBySocketId(socketId: string): RMHboxLobby | undefined {
    for (const lobby of this.lobbies.values()) {
      for (const player of lobby.players.values()) {
        if (player.socketId === socketId) return lobby;
      }
      for (const spectator of lobby.spectators.values()) {
        if (spectator.socketId === socketId) return lobby;
      }
    }
    return undefined;
  }

  // ─── Room code generation (§1.2) ───────────────────────────

  /** Generate a lobby ID that is not already in use */
  private generateUniqueLobbyId(): string {
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      const code = generateRoomCode();
      if (!this.lobbies.has(code)) return code;
    }
    throw new Error('Failed to generate unique lobby ID after max attempts');
  }

  // ─── Broadcasting helpers (§12.2) ──────────────────────────

  /** Broadcast a game action to all members in a lobby with auto-incrementing seq */
  broadcastAction(lobbyId: string, action: { type: string; payload?: unknown }): void {
    const seq = (this.seqCounters.get(lobbyId) ?? 0) + 1;
    this.seqCounters.set(lobbyId, seq);
    const fullAction: GameAction = {
      type: action.type,
      payload: action.payload ?? null,
      seq,
      timestamp: Date.now(),
    };
    this.io.to(`lobby:${lobbyId}`).emit(S2C.GAME_ACTION, fullAction);
  }

  broadcastToPlayers(lobbyId: string, event: string, data: unknown): void {
    this.io.to(`lobby:${lobbyId}:players`).emit(event, data);
  }

  broadcastToSpectators(lobbyId: string, event: string, data: unknown): void {
    this.io.to(`lobby:${lobbyId}:spectators`).emit(event, data);
  }

  sendToPlayer(lobbyId: string, userId: string, event: string, data: unknown): void {
    this.io.to(`lobby:${lobbyId}:player:${userId}`).emit(event, data);
  }

  /** Add a system chat message to a lobby and broadcast it */
  addSystemChat(lobbyId: string, message: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    const chatMsg: ChatMessage = {
      id: nanoid(),
      userId: 'system',
      userName: 'System',
      content: message,
      timestamp: Date.now(),
      type: 'system',
    };

    lobby.chat.push(chatMsg);
    // Ring buffer: trim oldest messages beyond history limit
    if (lobby.chat.length > config.CHAT_HISTORY_LENGTH) {
      lobby.chat.splice(0, lobby.chat.length - config.CHAT_HISTORY_LENGTH);
    }

    this.broadcastAction(lobbyId, {
      type: 'CHAT_MESSAGE',
      payload: chatMsg,
    });
  }

  // ─── Connection event wiring (§13) ─────────────────────────

  handleConnection(socket: Socket): void {
    socket.on('rmhbox:lobby:create', validated('rmhbox:lobby:create', CreateLobbySchema, (s, d) => this.createLobby(s, d)));
    socket.on('rmhbox:lobby:join', validated('rmhbox:lobby:join', JoinLobbySchema, (s, d) => this.joinLobby(s, d)));
    socket.on('rmhbox:lobby:leave', validated('rmhbox:lobby:leave', LeaveLobbySchema, (s, d) => this.leaveLobby(s, d)));
    socket.on('rmhbox:lobby:kick', validated('rmhbox:lobby:kick', KickPlayerSchema, (s, d) => this.kickPlayer(s, d)));
    socket.on('rmhbox:lobby:transfer_host', validated('rmhbox:lobby:transfer_host', TransferHostSchema, (s, d) => this.transferHost(s, d)));
    socket.on('rmhbox:lobby:update_settings', validated('rmhbox:lobby:update_settings', UpdateSettingsSchema, (s, d) => this.updateSettings(s, d)));
    socket.on('rmhbox:lobby:end_session', validated('rmhbox:lobby:end_session', EndSessionSchema, (s, d) => this.endSession(s, d)));
    socket.on('rmhbox:lobby:toggle_ready', validated('rmhbox:lobby:toggle_ready', ToggleReadySchema, (s, d) => this.toggleReady(s, d)));
    socket.on('rmhbox:lobby:request_promotion', validated('rmhbox:lobby:request_promotion', RequestPromotionSchema, (s, d) => this.requestPromotion(s, d)));
    socket.on('rmhbox:lobby:browse', validated('rmhbox:lobby:browse', BrowseLobbiesSchema, (s, d) => this.browseLobbies(s, d)));
  }

  // ─── Disconnect handling (§4.2) ────────────────────────────

  handleDisconnect(socket: Socket): void {
    const userId = socket.data.userId as string;
    const lobby = this.getLobbyByUserId(userId);
    if (!lobby) return;

    const player = lobby.players.get(userId);
    if (player) {
      player.isConnected = false;
      player.socketId = null;
      player.lastSeenAt = Date.now();
      lobby.lastActivityAt = Date.now();

      logger.info({ event: 'player_disconnected', userId, lobbyId: lobby.id });

      // Broadcast disconnect to lobby
      this.broadcastAction(lobby.id, {
        type: 'PLAYER_DISCONNECTED',
        payload: { userId, userName: player.userName },
      });

      // Start grace period timer
      const timer = setTimeout(() => {
        this.graceTimers.delete(userId);
        logger.info({ event: 'grace_period_expired', userId, lobbyId: lobby.id });
        // Remove player via leave logic
        this.removePlayer(lobby, userId);
      }, config.DISCONNECT_GRACE_PERIOD_MS);

      this.graceTimers.set(userId, timer);
      return;
    }

    const spectator = lobby.spectators.get(userId);
    if (spectator) {
      // Spectators are removed immediately — no grace period
      lobby.spectators.delete(userId);
      this.userToLobby.delete(userId);
      lobby.lastActivityAt = Date.now();

      logger.info({ event: 'spectator_disconnected', userId, lobbyId: lobby.id });

      this.broadcastAction(lobby.id, {
        type: 'SPECTATOR_LEFT',
        payload: { userId, userName: spectator.userName },
      });

      this.addSystemChat(lobby.id, `${spectator.userName} left`);
    }
  }

  /** Cancel a pending grace period timer (called by reconnection handler) */
  cancelGraceTimer(userId: string): void {
    const timer = this.graceTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(userId);
    }
  }

  // ─── Lobby creation (§2.1) ─────────────────────────────────

  private createLobby(socket: Socket, payload: { settings?: Partial<LobbySettings> }): void {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const avatarUrl = (socket.data.avatarUrl as string | null) ?? null;

    // Check if user is already in a lobby
    if (this.userToLobby.has(userId)) {
      socket.emit(S2C.ERROR, { code: 'ALREADY_IN_LOBBY', message: 'You are already in a lobby.' });
      return;
    }

    const lobbyId = this.generateUniqueLobbyId();

    // Default settings, merged with any provided partial settings
    const settings: LobbySettings = {
      isPublic: false,
      maxPlayers: config.DEFAULT_MAX_PLAYERS,
      maxSpectators: config.DEFAULT_MAX_SPECTATORS,
      allowMidGameJoin: true,
      allowSpectatorPromotion: true,
      autoStartThreshold: null,
      gameDurationOverride: null,
      ...payload.settings,
    };

    // Clamp settings
    settings.maxPlayers = Math.max(2, Math.min(config.ABSOLUTE_MAX_PLAYERS, settings.maxPlayers));
    settings.maxSpectators = Math.max(0, Math.min(config.MAX_SPECTATORS, settings.maxSpectators));

    const now = Date.now();
    const player: RMHboxPlayer = {
      userId,
      userName,
      avatarUrl,
      socketId: socket.id,
      isConnected: true,
      isReady: false,
      score: 0,
      roundScore: 0,
      joinedAt: now,
      lastSeenAt: now,
      role: 'player',
    };

    const lobby: RMHboxLobby = {
      id: lobbyId,
      hostUserId: userId,
      settings,
      players: new Map([[userId, player]]),
      spectators: new Map(),
      state: 'WAITING',
      chat: [],
      createdAt: now,
      lastActivityAt: now,
      currentGame: null,
      matchHistory: [],
      roundNumber: 0,
    };

    this.lobbies.set(lobbyId, lobby);
    this.userToLobby.set(userId, lobbyId);
    this.seqCounters.set(lobbyId, 0);

    // Join Socket.io rooms
    socket.join(`lobby:${lobbyId}`);
    socket.join(`lobby:${lobbyId}:players`);
    socket.join(`lobby:${lobbyId}:player:${userId}`);

    const clientState = this.buildClientState(lobby, userId);
    socket.emit(S2C.LOBBY_CREATED, { lobbyId, lobby: clientState });

    logger.info({ event: 'lobby_created', lobbyId, userId, userName });
  }

  // ─── Lobby join (§3.1) ─────────────────────────────────────

  private joinLobby(socket: Socket, payload: { lobbyId: string; asSpectator: boolean }): void {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const avatarUrl = (socket.data.avatarUrl as string | null) ?? null;

    // Validate lobby exists
    const lobby = this.lobbies.get(payload.lobbyId);
    if (!lobby) {
      socket.emit(S2C.ERROR, { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' });
      return;
    }

    // Validate lobby is not disbanded
    if (lobby.state === 'DISBANDED') {
      socket.emit(S2C.ERROR, { code: 'LOBBY_NOT_FOUND', message: 'Lobby has been disbanded.' });
      return;
    }

    // Validate user is not already in a lobby
    if (this.userToLobby.has(userId)) {
      socket.emit(S2C.ERROR, { code: 'ALREADY_IN_LOBBY', message: 'You are already in a lobby.' });
      return;
    }

    const now = Date.now();

    // Determine join role
    let joinAsSpectator = payload.asSpectator;
    if (!joinAsSpectator) {
      // Force spectator if game is playing, regardless of allowMidGameJoin
      if (lobby.state === 'PLAYING') {
        joinAsSpectator = true;
      }
      // Force spectator if lobby is full
      if (lobby.players.size >= lobby.settings.maxPlayers) {
        joinAsSpectator = true;
      }
    }

    if (joinAsSpectator) {
      // Join as spectator
      if (lobby.spectators.size >= lobby.settings.maxSpectators) {
        socket.emit(S2C.ERROR, { code: 'LOBBY_FULL', message: 'Spectator slots are full.' });
        return;
      }

      const spectator: RMHboxSpectator = {
        userId,
        userName,
        avatarUrl,
        socketId: socket.id,
        isConnected: true,
        joinedAt: now,
        role: 'spectator',
      };

      lobby.spectators.set(userId, spectator);
      this.userToLobby.set(userId, lobby.id);

      socket.join(`lobby:${lobby.id}`);
      socket.join(`lobby:${lobby.id}:spectators`);
      socket.join(`lobby:${lobby.id}:player:${userId}`);

      lobby.lastActivityAt = now;

      this.broadcastAction(lobby.id, {
        type: 'SPECTATOR_JOINED',
        payload: { userId, userName },
      });

      socket.emit(S2C.LOBBY_STATE_SNAPSHOT, this.buildClientState(lobby, userId));
      this.addSystemChat(lobby.id, `${userName} joined`);

      logger.info({ event: 'spectator_joined', lobbyId: lobby.id, userId, userName });
    } else {
      // Join as player
      if (lobby.players.size >= lobby.settings.maxPlayers) {
        socket.emit(S2C.ERROR, { code: 'LOBBY_FULL', message: 'Player slots are full.' });
        return;
      }

      const player: RMHboxPlayer = {
        userId,
        userName,
        avatarUrl,
        socketId: socket.id,
        isConnected: true,
        isReady: false,
        score: 0,
        roundScore: 0,
        joinedAt: now,
        lastSeenAt: now,
        role: 'player',
      };

      lobby.players.set(userId, player);
      this.userToLobby.set(userId, lobby.id);

      socket.join(`lobby:${lobby.id}`);
      socket.join(`lobby:${lobby.id}:players`);
      socket.join(`lobby:${lobby.id}:player:${userId}`);

      lobby.lastActivityAt = now;

      this.broadcastAction(lobby.id, {
        type: 'PLAYER_JOINED',
        payload: { userId, userName },
      });

      socket.emit(S2C.LOBBY_STATE_SNAPSHOT, this.buildClientState(lobby, userId));
      this.addSystemChat(lobby.id, `${userName} joined`);

      logger.info({ event: 'player_joined', lobbyId: lobby.id, userId, userName });
    }
  }

  // ─── Lobby leave (§4.1) ────────────────────────────────────

  private leaveLobby(socket: Socket, payload: { lobbyId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.getLobbyByUserId(userId);
    if (!lobby || lobby.id !== payload.lobbyId) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in a lobby.' });
      return;
    }

    // Cancel any grace timer
    this.cancelGraceTimer(userId);

    const isPlayer = lobby.players.has(userId);
    const isSpectator = lobby.spectators.has(userId);

    if (isPlayer) {
      this.removePlayer(lobby, userId);
    } else if (isSpectator) {
      const spectator = lobby.spectators.get(userId)!;
      lobby.spectators.delete(userId);
      this.userToLobby.delete(userId);

      // Leave Socket.io rooms
      socket.leave(`lobby:${lobby.id}`);
      socket.leave(`lobby:${lobby.id}:spectators`);
      socket.leave(`lobby:${lobby.id}:player:${userId}`);

      lobby.lastActivityAt = Date.now();

      this.broadcastAction(lobby.id, {
        type: 'SPECTATOR_LEFT',
        payload: { userId, userName: spectator.userName },
      });

      this.addSystemChat(lobby.id, `${spectator.userName} left`);

      logger.info({ event: 'spectator_left', lobbyId: lobby.id, userId });
    }
  }

  /**
   * Remove a player from a lobby, handling host succession and cleanup.
   * Shared between explicit leave, kick, and grace period expiry.
   */
  private removePlayer(lobby: RMHboxLobby, userId: string): void {
    const player = lobby.players.get(userId);
    if (!player) return;

    const userName = player.userName;
    const wasHost = lobby.hostUserId === userId;

    lobby.players.delete(userId);
    this.userToLobby.delete(userId);
    lobby.lastActivityAt = Date.now();

    // Leave Socket.io rooms if socket is still connected
    if (player.socketId) {
      const socketRoom = this.io.sockets.sockets?.get(player.socketId);
      if (socketRoom) {
        socketRoom.leave(`lobby:${lobby.id}`);
        socketRoom.leave(`lobby:${lobby.id}:players`);
        socketRoom.leave(`lobby:${lobby.id}:player:${userId}`);
      }
    }

    // Handle host succession
    if (wasHost) {
      if (lobby.players.size > 0) {
        // Find the player who joined earliest
        let earliestJoin = Infinity;
        let newHostId = '';
        for (const [pid, p] of lobby.players) {
          if (p.joinedAt < earliestJoin) {
            earliestJoin = p.joinedAt;
            newHostId = pid;
          }
        }
        lobby.hostUserId = newHostId;
        const newHost = lobby.players.get(newHostId)!;

        this.broadcastAction(lobby.id, {
          type: 'HOST_TRANSFERRED',
          payload: { newHostUserId: newHostId, newHostUserName: newHost.userName },
        });

        this.addSystemChat(lobby.id, `Host transferred to ${newHost.userName}`);

        logger.info({ event: 'host_transferred', lobbyId: lobby.id, newHostUserId: newHostId });
      } else if (lobby.spectators.size > 0) {
        // Promote earliest spectator to player and make them host
        let earliestJoin = Infinity;
        let newHostId = '';
        for (const [sid, s] of lobby.spectators) {
          if (s.joinedAt < earliestJoin) {
            earliestJoin = s.joinedAt;
            newHostId = sid;
          }
        }
        const spectator = lobby.spectators.get(newHostId)!;
        lobby.spectators.delete(newHostId);

        const newPlayer: RMHboxPlayer = {
          userId: spectator.userId,
          userName: spectator.userName,
          avatarUrl: spectator.avatarUrl,
          socketId: spectator.socketId,
          isConnected: spectator.isConnected,
          isReady: false,
          score: 0,
          roundScore: 0,
          joinedAt: spectator.joinedAt,
          lastSeenAt: Date.now(),
          role: 'player',
        };
        lobby.players.set(newHostId, newPlayer);
        lobby.hostUserId = newHostId;

        // Update Socket.io rooms for the promoted spectator
        if (spectator.socketId) {
          const socketRoom = this.io.sockets.sockets?.get(spectator.socketId);
          if (socketRoom) {
            socketRoom.leave(`lobby:${lobby.id}:spectators`);
            socketRoom.join(`lobby:${lobby.id}:players`);
          }
        }

        this.broadcastAction(lobby.id, {
          type: 'HOST_TRANSFERRED',
          payload: { newHostUserId: newHostId, newHostUserName: spectator.userName },
        });

        this.addSystemChat(lobby.id, `Host transferred to ${spectator.userName}`);

        logger.info({ event: 'host_transferred_from_spectator', lobbyId: lobby.id, newHostUserId: newHostId });
      } else {
        // Nobody remains — disband
        this.disband(lobby.id, 'All players left');
        return;
      }
    }

    // If no players and no spectators remain, disband
    if (lobby.players.size === 0 && lobby.spectators.size === 0) {
      this.disband(lobby.id, 'All players left');
      return;
    }

    this.broadcastAction(lobby.id, {
      type: 'PLAYER_LEFT',
      payload: { userId, userName },
    });

    this.addSystemChat(lobby.id, `${userName} left`);

    logger.info({ event: 'player_left', lobbyId: lobby.id, userId });
  }

  // ─── Host controls (§5) ────────────────────────────────────

  private kickPlayer(socket: Socket, payload: { lobbyId: string; targetUserId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbies.get(payload.lobbyId);
    if (!lobby) {
      socket.emit(S2C.ERROR, { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' });
      return;
    }

    if (lobby.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can kick players.' });
      return;
    }

    if (payload.targetUserId === userId) {
      socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'You cannot kick yourself.' });
      return;
    }

    const targetPlayer = lobby.players.get(payload.targetUserId);
    const targetSpectator = lobby.spectators.get(payload.targetUserId);
    if (!targetPlayer && !targetSpectator) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'Target user is not in this lobby.' });
      return;
    }

    const targetUserName = targetPlayer?.userName ?? targetSpectator!.userName;
    const targetSocketId = targetPlayer?.socketId ?? targetSpectator?.socketId;

    // Emit kicked event to the target before removing them
    if (targetSocketId) {
      const targetSocket = this.io.sockets.sockets?.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit(S2C.LOBBY_KICKED, { reason: 'Kicked by host' });
        // Force-disconnect from lobby rooms
        targetSocket.leave(`lobby:${lobby.id}`);
        targetSocket.leave(`lobby:${lobby.id}:players`);
        targetSocket.leave(`lobby:${lobby.id}:spectators`);
        targetSocket.leave(`lobby:${lobby.id}:player:${payload.targetUserId}`);
      }
    }

    // Remove the target
    if (targetPlayer) {
      lobby.players.delete(payload.targetUserId);
    } else {
      lobby.spectators.delete(payload.targetUserId);
    }
    this.userToLobby.delete(payload.targetUserId);
    this.cancelGraceTimer(payload.targetUserId);

    lobby.lastActivityAt = Date.now();

    this.broadcastAction(lobby.id, {
      type: 'PLAYER_KICKED',
      payload: { userId: payload.targetUserId, userName: targetUserName },
    });

    this.addSystemChat(lobby.id, `${targetUserName} was kicked by the host`);

    logger.info({ event: 'player_kicked', lobbyId: lobby.id, targetUserId: payload.targetUserId, byUserId: userId });
  }

  private transferHost(socket: Socket, payload: { lobbyId: string; targetUserId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbies.get(payload.lobbyId);
    if (!lobby) {
      socket.emit(S2C.ERROR, { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' });
      return;
    }

    if (lobby.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can transfer host.' });
      return;
    }

    const targetPlayer = lobby.players.get(payload.targetUserId);
    if (!targetPlayer) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'Target user is not a player in this lobby.' });
      return;
    }

    lobby.hostUserId = payload.targetUserId;
    lobby.lastActivityAt = Date.now();

    this.broadcastAction(lobby.id, {
      type: 'HOST_TRANSFERRED',
      payload: { newHostUserId: payload.targetUserId, newHostUserName: targetPlayer.userName },
    });

    this.addSystemChat(lobby.id, `Host transferred to ${targetPlayer.userName}`);

    logger.info({ event: 'host_transferred', lobbyId: lobby.id, newHostUserId: payload.targetUserId, byUserId: userId });
  }

  private updateSettings(socket: Socket, payload: { lobbyId: string; settings: Partial<LobbySettings> }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbies.get(payload.lobbyId);
    if (!lobby) {
      socket.emit(S2C.ERROR, { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' });
      return;
    }

    if (lobby.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can update settings.' });
      return;
    }

    if (lobby.state !== 'WAITING') {
      socket.emit(S2C.ERROR, { code: 'LOBBY_IN_GAME', message: 'Settings can only be changed in the waiting state.' });
      return;
    }

    // Merge settings with validation
    const newSettings = { ...lobby.settings };
    if (payload.settings.isPublic !== undefined) newSettings.isPublic = payload.settings.isPublic;
    if (payload.settings.maxPlayers !== undefined) {
      newSettings.maxPlayers = Math.max(2, Math.min(config.ABSOLUTE_MAX_PLAYERS, payload.settings.maxPlayers));
    }
    if (payload.settings.maxSpectators !== undefined) {
      newSettings.maxSpectators = Math.max(0, Math.min(config.MAX_SPECTATORS, payload.settings.maxSpectators));
    }
    if (payload.settings.allowMidGameJoin !== undefined) newSettings.allowMidGameJoin = payload.settings.allowMidGameJoin;
    if (payload.settings.allowSpectatorPromotion !== undefined) newSettings.allowSpectatorPromotion = payload.settings.allowSpectatorPromotion;
    if (payload.settings.autoStartThreshold !== undefined) newSettings.autoStartThreshold = payload.settings.autoStartThreshold;
    if (payload.settings.gameDurationOverride !== undefined) newSettings.gameDurationOverride = payload.settings.gameDurationOverride;

    lobby.settings = newSettings;
    lobby.lastActivityAt = Date.now();

    this.broadcastAction(lobby.id, {
      type: 'SETTINGS_UPDATED',
      payload: newSettings,
    });

    logger.info({ event: 'settings_updated', lobbyId: lobby.id, userId, settings: newSettings });
  }

  private endSession(socket: Socket, payload: { lobbyId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.getLobbyByUserId(userId);
    if (!lobby || lobby.id !== payload.lobbyId) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in a lobby.' });
      return;
    }

    if (lobby.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can end the session.' });
      return;
    }

    // Transition to SESSION_RESULTS
    lobby.state = 'SESSION_RESULTS';
    lobby.lastActivityAt = Date.now();

    logger.info({ event: 'session_ending', lobbyId: lobby.id, userId });

    // Build cumulative standings from match history
    const standings = this.buildSessionStandings(lobby);

    this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_SESSION_RESULTS, {
      standings,
      matchHistory: lobby.matchHistory.map((m) => ({
        matchId: `${m.minigameId}-${m.roundNumber}`,
        minigameId: m.minigameId,
        minigameDisplayName: m.minigameId,
        playerCount: m.standings.length,
        winnerUserName: m.standings[0]?.userName ?? null,
        rankings: m.standings,
        durationMs: m.endedAt - m.startedAt,
        playedAt: m.startedAt,
      })),
    });

    // Schedule disband after delay
    const timer = setTimeout(() => {
      this.disbandTimers.delete(lobby.id);
      this.disband(lobby.id, 'Session ended');
    }, SESSION_RESULTS_DISBAND_DELAY_MS);

    this.disbandTimers.set(lobby.id, timer);
  }

  /** Build cumulative standings from player scores */
  private buildSessionStandings(lobby: RMHboxLobby) {
    const standings = Array.from(lobby.players.values())
      .map((p) => ({
        userId: p.userId,
        userName: p.userName,
        totalScore: p.score,
        wins: 0,
        rank: 0,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    // Assign ranks
    standings.forEach((s, i) => { s.rank = i + 1; });
    return standings;
  }

  // ─── Ready-up (§7) ────────────────────────────────────────

  private toggleReady(socket: Socket, payload: { lobbyId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.getLobbyByUserId(userId);
    if (!lobby || lobby.id !== payload.lobbyId) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in a lobby.' });
      return;
    }

    const player = lobby.players.get(userId);
    if (!player) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not a player in this lobby.' });
      return;
    }

    player.isReady = !player.isReady;
    lobby.lastActivityAt = Date.now();

    this.broadcastAction(lobby.id, {
      type: 'PLAYER_READY_CHANGED',
      payload: { userId, isReady: player.isReady },
    });

    logger.info({ event: 'player_ready_changed', lobbyId: lobby.id, userId, isReady: player.isReady });

    // Check auto-start threshold
    if (lobby.settings.autoStartThreshold !== null) {
      const readyCount = Array.from(lobby.players.values()).filter((p) => p.isReady).length;
      if (readyCount >= lobby.settings.autoStartThreshold) {
        this.broadcastAction(lobby.id, {
          type: 'AUTO_START_TRIGGERED',
          payload: { readyCount, threshold: lobby.settings.autoStartThreshold },
        });

        logger.info({ event: 'auto_start_triggered', lobbyId: lobby.id, readyCount, threshold: lobby.settings.autoStartThreshold });
      }
    }
  }

  // ─── Spectator promotion (§8) ──────────────────────────────

  private requestPromotion(socket: Socket, payload: { lobbyId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.getLobbyByUserId(userId);
    if (!lobby || lobby.id !== payload.lobbyId) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in a lobby.' });
      return;
    }

    const spectator = lobby.spectators.get(userId);
    if (!spectator) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not a spectator in this lobby.' });
      return;
    }

    // Only allow promotion in WAITING or ROUND_RESULTS states
    if (lobby.state !== 'WAITING' && lobby.state !== 'ROUND_RESULTS') {
      socket.emit(S2C.ERROR, { code: 'LOBBY_IN_GAME', message: 'Promotion is only allowed between rounds.' });
      return;
    }

    if (!lobby.settings.allowSpectatorPromotion) {
      socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'Spectator promotion is disabled.' });
      return;
    }

    if (lobby.players.size >= lobby.settings.maxPlayers) {
      socket.emit(S2C.ERROR, { code: 'LOBBY_FULL', message: 'Player slots are full.' });
      return;
    }

    // Move spectator to players
    lobby.spectators.delete(userId);
    const newPlayer: RMHboxPlayer = {
      userId: spectator.userId,
      userName: spectator.userName,
      avatarUrl: spectator.avatarUrl,
      socketId: spectator.socketId,
      isConnected: spectator.isConnected,
      isReady: false,
      score: 0,
      roundScore: 0,
      joinedAt: spectator.joinedAt,
      lastSeenAt: Date.now(),
      role: 'player',
    };
    lobby.players.set(userId, newPlayer);

    // Update Socket.io rooms
    socket.leave(`lobby:${lobby.id}:spectators`);
    socket.join(`lobby:${lobby.id}:players`);

    lobby.lastActivityAt = Date.now();

    this.broadcastAction(lobby.id, {
      type: 'SPECTATOR_PROMOTED',
      payload: { userId, userName: spectator.userName },
    });

    this.addSystemChat(lobby.id, `${spectator.userName} joined as a player`);

    logger.info({ event: 'spectator_promoted', lobbyId: lobby.id, userId });
  }

  // ─── Lobby browser (§9) ───────────────────────────────────

  private browseLobbies(socket: Socket, payload: { cursor?: string; limit: number }): void {
    // Filter public, non-disbanded lobbies
    const publicLobbies: Array<{ id: string; lobby: RMHboxLobby }> = [];
    for (const [id, lobby] of this.lobbies) {
      if (lobby.settings.isPublic && lobby.state !== 'DISBANDED') {
        publicLobbies.push({ id, lobby });
      }
    }

    // Sort by player count descending (most active first)
    publicLobbies.sort((a, b) => b.lobby.players.size - a.lobby.players.size);

    // Apply cursor-based pagination
    let startIndex = 0;
    if (payload.cursor) {
      const cursorIndex = publicLobbies.findIndex((l) => l.id === payload.cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    const page = publicLobbies.slice(startIndex, startIndex + payload.limit);
    const nextCursor = page.length === payload.limit && startIndex + payload.limit < publicLobbies.length
      ? page[page.length - 1].id
      : null;

    const lobbies: PublicLobbyInfo[] = page.map(({ id, lobby }) => {
      const hostPlayer = lobby.players.get(lobby.hostUserId);
      return {
        lobbyId: id,
        hostName: hostPlayer?.userName ?? 'Unknown',
        playerCount: lobby.players.size,
        maxPlayers: lobby.settings.maxPlayers,
        spectatorCount: lobby.spectators.size,
        state: lobby.state,
        currentGame: lobby.currentGame?.minigameId ?? null,
        roundNumber: lobby.roundNumber,
      };
    });

    socket.emit(S2C.LOBBY_BROWSE_RESULT, { lobbies, nextCursor });

    logger.debug({ event: 'lobby_browse', userId: socket.data.userId, resultCount: lobbies.length });
  }

  // ─── Build client state (§10) ──────────────────────────────

  /**
   * Build a client-safe state snapshot for a specific user.
   * Strips internal fields (socketId, timer refs, Maps) and scopes
   * minigame state per player/spectator role.
   */
  buildClientState(lobby: RMHboxLobby, userId: string): ClientLobbyState {
    const players: ClientPlayerInfo[] = Array.from(lobby.players.values()).map((p) => ({
      userId: p.userId,
      userName: p.userName,
      avatarUrl: p.avatarUrl,
      isConnected: p.isConnected,
      isReady: p.isReady,
      score: p.score,
      roundScore: p.roundScore,
      isHost: p.userId === lobby.hostUserId,
    }));

    const spectators: ClientSpectatorInfo[] = Array.from(lobby.spectators.values()).map((s) => ({
      userId: s.userId,
      userName: s.userName,
      avatarUrl: s.avatarUrl,
      isConnected: s.isConnected,
    }));

    const myRole: 'player' | 'spectator' = lobby.players.has(userId) ? 'player' : 'spectator';

    let currentGame: ClientGameInfo | null = null;
    if (lobby.currentGame) {
      const handler = lobby.currentGame.handler;
      const gameState = myRole === 'player'
        ? handler.getStateForPlayer(userId)
        : handler.getStateForSpectator();

      currentGame = {
        minigameId: lobby.currentGame.minigameId,
        displayName: lobby.currentGame.minigameId,
        phase: 'playing',
        timeRemaining: null,
        publicState: (typeof gameState === 'object' && gameState !== null ? gameState : {}) as Record<string, unknown>,
        privateState: {},
      };
    }

    const seq = this.seqCounters.get(lobby.id) ?? 0;

    const matchHistory: MatchSummary[] = lobby.matchHistory.map((m) => ({
      matchId: `${m.minigameId}-${m.roundNumber}`,
      minigameId: m.minigameId,
      minigameDisplayName: m.minigameId,
      playerCount: m.standings.length,
      winnerUserName: m.standings[0]?.userName ?? null,
      rankings: m.standings,
      durationMs: m.endedAt - m.startedAt,
      playedAt: m.startedAt,
    }));

    return {
      lobbyId: lobby.id,
      hostUserId: lobby.hostUserId,
      state: lobby.state,
      settings: { ...lobby.settings },
      players,
      spectators,
      currentGame,
      roundNumber: lobby.roundNumber,
      chat: [...lobby.chat],
      myRole,
      myUserId: userId,
      seq,
      matchHistory,
    };
  }

  // ─── Garbage collector (§11) ───────────────────────────────

  startGarbageCollector(): void {
    this.gcInterval = setInterval(() => this.runGC(), config.LOBBY_GC_INTERVAL_MS);
  }

  stopGarbageCollector(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
  }

  private runGC(): void {
    const now = Date.now();
    for (const [id, lobby] of this.lobbies) {
      if (lobby.state === 'DISBANDED') continue;

      const allDisconnected = this.areAllDisconnected(lobby);
      const isEmpty = lobby.players.size === 0 && lobby.spectators.size === 0;

      // Check idle timeout (only in WAITING state)
      const isIdle = lobby.state === 'WAITING' && now - lobby.lastActivityAt > config.LOBBY_IDLE_TIMEOUT_MS;

      // Check absolute timeout (any state)
      const isExpired = now - lobby.lastActivityAt > config.LOBBY_ABSOLUTE_TIMEOUT_MS;

      // Check empty timeout (all disconnected or nobody present)
      const isEmptyTooLong = (isEmpty || allDisconnected) && now - lobby.lastActivityAt > config.LOBBY_EMPTY_TIMEOUT_MS;

      if (isExpired || isIdle || isEmptyTooLong) {
        const reason = isExpired ? 'expired' : isIdle ? 'idle' : 'empty';
        logger.info({ event: 'lobby_gc', lobbyId: id, reason });
        this.disband(id, 'Inactive lobby');
      }
    }
  }

  /** Check if all players and spectators in a lobby are disconnected */
  private areAllDisconnected(lobby: RMHboxLobby): boolean {
    if (lobby.players.size === 0 && lobby.spectators.size === 0) return true;

    for (const player of lobby.players.values()) {
      if (player.isConnected) return false;
    }
    for (const spectator of lobby.spectators.values()) {
      if (spectator.isConnected) return false;
    }
    return true;
  }

  // ─── Disband ───────────────────────────────────────────────

  private disband(lobbyId: string, reason: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.state = 'DISBANDED';

    logger.info({ event: 'lobby_disbanded', lobbyId, reason });

    this.io.to(`lobby:${lobbyId}`).emit(S2C.LOBBY_DISBANDED, { reason });

    // Clean up all user→lobby mappings
    for (const userId of lobby.players.keys()) {
      this.userToLobby.delete(userId);
      this.cancelGraceTimer(userId);
    }
    for (const userId of lobby.spectators.keys()) {
      this.userToLobby.delete(userId);
    }

    // Clean up lobby data
    this.lobbies.delete(lobbyId);
    this.seqCounters.delete(lobbyId);

    // Cancel any disband timer
    const disbandTimer = this.disbandTimers.get(lobbyId);
    if (disbandTimer) {
      clearTimeout(disbandTimer);
      this.disbandTimers.delete(lobbyId);
    }
  }
}
