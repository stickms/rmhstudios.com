/**
 * RMHbox — Reconnection Handler
 *
 * Manages the 120-second grace period for disconnected players
 * and re-associates returning sockets with their lobby/game state.
 *
 * Reference: docs/rmhbox/design-spec/core.md §9
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

  /**
   * Called when a new socket connects. Checks if this userId
   * was previously in a lobby and re-associates the socket.
   */
  attemptReconnect(socket: Socket): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);
    if (!lobby) return;

    const player = lobby.players.get(userId);
    if (!player) return;

    // Cancel grace timer
    this.lobbyManager.cancelGraceTimer(userId);

    // Re-associate socket
    player.socketId = socket.id;
    player.isConnected = true;
    player.lastSeenAt = Date.now();

    // Re-join Socket.io rooms
    socket.join(`lobby:${lobby.id}`);
    socket.join(`lobby:${lobby.id}:players`);
    socket.join(`lobby:${lobby.id}:player:${userId}`);

    // Send full state snapshot
    const clientState = this.stateSync.buildClientState(lobby, userId);
    socket.emit(S2C.LOBBY_STATE_SNAPSHOT, clientState);

    // Broadcast reconnection to lobby
    this.lobbyManager.broadcastAction(lobby.id, {
      type: 'PLAYER_CONNECTED',
      payload: { userId, userName: player.userName },
    });

    logger.info({ event: 'player_reconnected', userId, userName: player.userName, lobbyId: lobby.id });
  }

  /**
   * Called when a socket disconnects. The grace period is now
   * managed by LobbyManager.handleDisconnect(), so this handler
   * is kept for any additional reconnection-specific logic.
   */
  handleDisconnect(socket: Socket): void {
    void socket;
    // Grace period management is handled in LobbyManager.handleDisconnect()
  }
}
