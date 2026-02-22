/**
 * RMHbox — State Synchronization Service
 *
 * Manages heartbeat broadcasting and delta-based state updates
 * to all connected lobby members.
 */

import { Server } from 'socket.io';
import { config } from './config';
import { LobbyManager } from './lobby-manager';

export class StateSyncService {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(io: Server, lobbyManager: LobbyManager) {
    this.io = io;
    this.lobbyManager = lobbyManager;
  }

  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => this.tick(), config.HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private tick(): void {
    for (const [_lobbyId, lobby] of this.lobbyManager.getLobbies()) {
      if (lobby.state !== 'PLAYING') continue;

      // Send per-player scoped state snapshots
      for (const [userId, player] of lobby.players) {
        if (player.isConnected && player.socketId) {
          const clientState = this.buildClientState(lobby, userId);
          this.io
            .to(`lobby:${lobby.id}:player:${userId}`)
            .emit('rmhbox:lobby:state_snapshot', clientState);
        }
      }

      // Spectators get the spectator view
      for (const [userId, spectator] of lobby.spectators) {
        if (spectator.isConnected && spectator.socketId) {
          const clientState = this.buildClientState(lobby, userId);
          this.io
            .to(`lobby:${lobby.id}:player:${userId}`)
            .emit('rmhbox:lobby:state_snapshot', clientState);
        }
      }
    }
  }

  /**
   * Build a client-safe state snapshot for a specific user.
   * This is the ONLY exit point for state data — it strips
   * internal fields and scopes minigame state per player role.
   */
  buildClientState(lobby: unknown, _userId: string): Record<string, unknown> {
    // TODO: Implement per core.md §8 + §24.2
    void lobby;
    return {};
  }
}
