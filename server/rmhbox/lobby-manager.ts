/**
 * RMHbox — Lobby Manager
 *
 * Handles lobby CRUD, player joins/leaves, host controls,
 * lobby browsing, and garbage collection of idle lobbies.
 */

import { Server, Socket } from 'socket.io';
import { config } from './config';
import type { RMHboxLobby, LobbySettings, RMHboxPlayer, RMHboxSpectator } from './types';

export class LobbyManager {
  private readonly io: Server;
  private readonly lobbies = new Map<string, RMHboxLobby>();
  private gcInterval: ReturnType<typeof setInterval> | null = null;

  constructor(io: Server) {
    this.io = io;
  }

  // ─── Lobby accessors ────────────────────────────────────────

  getLobbies(): Map<string, RMHboxLobby> {
    return this.lobbies;
  }

  getLobby(lobbyId: string): RMHboxLobby | undefined {
    return this.lobbies.get(lobbyId);
  }

  getLobbyByUserId(userId: string): RMHboxLobby | undefined {
    for (const lobby of this.lobbies.values()) {
      if (lobby.players.has(userId) || lobby.spectators.has(userId)) {
        return lobby;
      }
    }
    return undefined;
  }

  // ─── Connection event wiring ────────────────────────────────

  handleConnection(socket: Socket): void {
    socket.on('rmhbox:lobby:create', (payload) => this.onCreate(socket, payload));
    socket.on('rmhbox:lobby:join', (payload) => this.onJoin(socket, payload));
    socket.on('rmhbox:lobby:leave', (payload) => this.onLeave(socket, payload));
    socket.on('rmhbox:lobby:kick', (payload) => this.onKick(socket, payload));
    socket.on('rmhbox:lobby:transfer_host', (payload) => this.onTransferHost(socket, payload));
    socket.on('rmhbox:lobby:update_settings', (payload) => this.onUpdateSettings(socket, payload));
    socket.on('rmhbox:lobby:end_session', (payload) => this.onEndSession(socket, payload));
    socket.on('rmhbox:lobby:toggle_ready', (payload) => this.onToggleReady(socket, payload));
    socket.on('rmhbox:lobby:request_promotion', (payload) => this.onRequestPromotion(socket, payload));
    socket.on('rmhbox:lobby:browse', (payload) => this.onBrowse(socket, payload));
  }

  handleDisconnect(socket: Socket): void {
    const userId = socket.data.userId as string;
    const lobby = this.getLobbyByUserId(userId);
    if (!lobby) return;

    const player = lobby.players.get(userId);
    if (player) {
      player.isConnected = false;
      player.socketId = null;
      lobby.lastActivityAt = Date.now();
      // Broadcast disconnect to lobby (reconnection handler starts grace timer)
    }

    const spectator = lobby.spectators.get(userId);
    if (spectator) {
      // Spectators are removed immediately — no grace period
      lobby.spectators.delete(userId);
    }
  }

  // ─── Garbage collector ──────────────────────────────────────

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
      const isEmpty = lobby.players.size === 0 && lobby.spectators.size === 0;
      const isIdle = now - lobby.lastActivityAt > config.LOBBY_IDLE_TIMEOUT_MS;
      const isExpired = now - lobby.createdAt > config.LOBBY_ABSOLUTE_TIMEOUT_MS;
      const isEmptyTooLong = isEmpty && now - lobby.lastActivityAt > config.LOBBY_EMPTY_TIMEOUT_MS;

      if (isExpired || isIdle || isEmptyTooLong) {
        this.disband(id, 'Lobby timed out');
      }
    }
  }

  // ─── Private handlers (stubs — full logic per core.md §6) ──

  private onCreate(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §6.2
    void socket;
  }

  private onJoin(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §6.3
    void socket;
  }

  private onLeave(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §6.4
    void socket;
  }

  private onKick(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §6.5
    void socket;
  }

  private onTransferHost(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §6.5
    void socket;
  }

  private onUpdateSettings(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §6.5
    void socket;
  }

  private onEndSession(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §6.5
    void socket;
  }

  private onToggleReady(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §11
    void socket;
  }

  private onRequestPromotion(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §10
    void socket;
  }

  private onBrowse(socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §6.6
    void socket;
  }

  private disband(lobbyId: string, reason: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    this.io.to(`lobby:${lobbyId}`).emit('rmhbox:lobby:disbanded', { reason });
    this.lobbies.delete(lobbyId);
  }
}
