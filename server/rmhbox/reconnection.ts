/**
 * RMHbox — Reconnection Handler
 *
 * Manages the 120-second grace period for disconnected players
 * and re-associates returning sockets with their lobby/game state.
 */

import { Server, Socket } from 'socket.io';
import { config } from './config';
import { LobbyManager } from './lobby-manager';
import { StateSyncService } from './state-sync';

export class ReconnectionHandler {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;
  private readonly stateSync: StateSyncService;
  private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    const timer = this.graceTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(userId);
    }

    // Re-associate socket
    player.socketId = socket.id;
    player.isConnected = true;

    // Re-join Socket.io rooms
    socket.join(`lobby:${lobby.id}`);
    socket.join(`lobby:${lobby.id}:players`);
    socket.join(`lobby:${lobby.id}:player:${userId}`);

    // Send full state snapshot
    const clientState = this.stateSync.buildClientState(lobby, userId);
    socket.emit('rmhbox:lobby:state_snapshot', clientState);

    // Broadcast reconnection to lobby
    this.io.to(`lobby:${lobby.id}`).emit('rmhbox:game:action', {
      type: 'PLAYER_CONNECTED',
      payload: { userId, userName: player.userName },
      seq: Date.now(),
      timestamp: Date.now(),
    });

    console.log(`[RMHbox] Reconnected: ${player.userName} (${userId}) to lobby ${lobby.id}`);
  }

  /**
   * Called when a socket disconnects. Starts the grace period
   * timer — if the player doesn't reconnect in time, they are
   * removed from the lobby.
   */
  handleDisconnect(socket: Socket): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);
    if (!lobby) return;

    const player = lobby.players.get(userId);
    if (!player) return;

    // Broadcast disconnection
    this.io.to(`lobby:${lobby.id}`).emit('rmhbox:game:action', {
      type: 'PLAYER_DISCONNECTED',
      payload: { userId, userName: player.userName },
      seq: Date.now(),
      timestamp: Date.now(),
    });

    // Start grace timer
    const timer = setTimeout(() => {
      this.graceTimers.delete(userId);
      // Remove player from lobby after grace period expires
      lobby.players.delete(userId);
      console.log(`[RMHbox] Grace period expired for ${userId} in lobby ${lobby.id}`);

      // If lobby is now empty, let GC handle it
      // If the disconnected player was host, transfer host
      if (lobby.hostUserId === userId && lobby.players.size > 0) {
        lobby.hostUserId = lobby.players.keys().next().value!;
      }
    }, config.DISCONNECT_GRACE_PERIOD_MS);

    this.graceTimers.set(userId, timer);
  }
}
