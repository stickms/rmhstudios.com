/**
 * RMHbox — Reconnection Handler
 *
 * Manages the reconnection protocol for players who disconnect:
 * - Identifies returning users by userId (not socketId)
 * - Handles duplicate sessions (same user, different tab/device)
 * - Re-associates sockets with existing lobby/player slots
 * - Sends full state snapshot to resync the client
 * - Manages grace period timers for temporary disconnects
 *
 * Reference: docs/rmhbox/design-spec/core.md §9
 * Implementation: docs/rmhbox/implementation/phase-3.md §4
 */

import { Server, Socket } from 'socket.io';
import { logger } from './logger';
import { LobbyManager } from './lobby-manager';
import { StateSyncService } from './state-sync';
import { S2C } from '../../lib/rmhbox/events';

export class ReconnectionHandler {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;
  private readonly stateSync: StateSyncService;

  constructor(io: Server, lobbyManager: LobbyManager, stateSync: StateSyncService) {
    this.io = io;
    this.lobbyManager = lobbyManager;
    this.stateSync = stateSync;
  }

  // ─── Reconnect Attempt (§4.2) ─────────────────────────────────

  /**
   * Called at the START of every new connection (before lobby handlers).
   * Checks if this userId was previously in a lobby and re-associates
   * the socket with their existing player/spectator slot.
   *
   * Also handles duplicate session detection: if the user already has
   * an active socket, the old socket is force-disconnected.
   */
  attemptReconnect(socket: Socket): void {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);
    if (!lobby) return; // Not in a lobby — normal fresh connection

    const player = lobby.players.get(userId);
    const spectator = lobby.spectators.get(userId);
    const member = player ?? spectator;
    if (!member) return;

    // ─── Handle Duplicate Session (§9.4) ─────────────────────
    const existingSocketId = member.socketId;
    if (existingSocketId && existingSocketId !== socket.id) {
      const oldSocket = this.io.sockets.sockets?.get(existingSocketId);
      if (oldSocket) {
        oldSocket.emit(S2C.ERROR, {
          code: 'DUPLICATE_SESSION',
          message: 'Connected from another device',
        });
        oldSocket.disconnect(true);
        logger.info({ event: 'duplicate_session_disconnected', userId, oldSocketId: existingSocketId, newSocketId: socket.id });
      }
    }

    // ─── Update Member Record ────────────────────────────────
    member.socketId = socket.id;
    member.isConnected = true;
    if ('lastSeenAt' in member) {
      (member as { lastSeenAt: number }).lastSeenAt = Date.now();
    }

    // ─── Cancel Grace Period Timer ───────────────────────────
    this.lobbyManager.cancelGraceTimer(userId);

    // ─── Re-join Socket.io Rooms ─────────────────────────────
    socket.join(`lobby:${lobby.id}`);
    if (player) {
      socket.join(`lobby:${lobby.id}:players`);
    } else {
      socket.join(`lobby:${lobby.id}:spectators`);
    }
    socket.join(`lobby:${lobby.id}:player:${userId}`);

    // ─── Send Full State Snapshot ────────────────────────────
    const clientState = this.stateSync.buildClientState(lobby, userId);
    socket.emit(S2C.LOBBY_STATE_SNAPSHOT, clientState);

    // ─── Game-Specific State ─────────────────────────────────
    if (lobby.currentGame?.handler && lobby.state === 'PLAYING') {
      try {
        if (player) {
          const gameState = lobby.currentGame.handler.getStateForPlayer(userId);
          socket.emit(S2C.GAME_STATE_SNAPSHOT, gameState);
          lobby.currentGame.handler.handlePlayerReconnect(userId);
        } else {
          const gameState = lobby.currentGame.handler.getStateForSpectator();
          socket.emit(S2C.GAME_STATE_SNAPSHOT, gameState);
        }
      } catch (err) {
        logger.error({ event: 'reconnect_game_state_error', userId, lobbyId: lobby.id, error: String(err) });
      }
    }

    // ─── Broadcast Reconnection ──────────────────────────────
    this.lobbyManager.broadcastAction(lobby.id, {
      type: 'PLAYER_CONNECTED',
      payload: { userId, userName: member.userName },
    });

    this.lobbyManager.addSystemChat(lobby.id, `${userName} reconnected`);

    logger.info({ event: 'player_reconnected', userId, userName, lobbyId: lobby.id, socketId: socket.id });
  }

  // ─── Disconnect Handler (§4.3) ────────────────────────────────

  /**
   * Called when a socket disconnects. Additional reconnection-specific
   * logic beyond what LobbyManager.handleDisconnect() provides.
   *
   * Note: Grace period management is handled in LobbyManager.handleDisconnect().
   * This handler is kept for any additional reconnection-specific bookkeeping.
   */
  handleDisconnect(_socket: Socket): void {
    // Grace period management is handled in LobbyManager.handleDisconnect()
    // This is a hook for future reconnection-specific cleanup if needed
  }
}
