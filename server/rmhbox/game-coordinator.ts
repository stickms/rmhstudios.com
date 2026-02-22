/**
 * RMHbox — Game Coordinator
 *
 * Orchestrates the minigame lifecycle state machine:
 * LOBBY → VOTING → INSTRUCTIONS → PRELOADING → COUNTDOWN → PLAYING → RESULTS → LOBBY
 */

import { Server, Socket } from 'socket.io';
import { LobbyManager } from './lobby-manager';
import { StateSyncService } from './state-sync';

export class GameCoordinator {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;
  private readonly stateSync: StateSyncService;

  constructor(io: Server, lobbyManager: LobbyManager, stateSync: StateSyncService) {
    this.io = io;
    this.lobbyManager = lobbyManager;
    this.stateSync = stateSync;
  }

  handleConnection(socket: Socket): void {
    socket.on('rmhbox:game:select', (payload) => this.onSelect(socket, payload));
    socket.on('rmhbox:game:force_skip', (payload) => this.onForceSkip(socket, payload));
    socket.on('rmhbox:game:ready_to_render', (payload) => this.onReadyToRender(socket, payload));
    socket.on('rmhbox:game:input', (payload) => this.onInput(socket, payload));
  }

  handleDisconnect(socket: Socket): void {
    // Handle in-game disconnection (pause logic, AI takeover, etc.)
    void socket;
  }

  // ─── Stubs (full logic per core.md §7) ──────────────────────

  private onSelect(_socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §7.2
  }

  private onForceSkip(_socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §7
  }

  private onReadyToRender(_socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §7.4
  }

  private onInput(_socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §7.6
  }
}
