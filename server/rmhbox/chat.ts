/**
 * RMHbox — Chat Handler
 *
 * In-lobby text chat with rate limiting, sanitization,
 * and chat history management.
 */

import { Server, Socket } from 'socket.io';
import { LobbyManager } from './lobby-manager';
import { config } from './config';

export class ChatHandler {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;

  constructor(io: Server, lobbyManager: LobbyManager) {
    this.io = io;
    this.lobbyManager = lobbyManager;
  }

  handleConnection(socket: Socket): void {
    socket.on('rmhbox:lobby:chat', (payload) => this.onChat(socket, payload));
  }

  private onChat(_socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §6 (chat section)
    void config;
  }
}
