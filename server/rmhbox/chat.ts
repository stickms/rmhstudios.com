/**
 * RMHbox — Chat Handler
 *
 * In-lobby text chat with rate limiting, sanitization,
 * and ring buffer chat history management.
 *
 * Reference: docs/rmhbox/design-spec/core.md §6 (chat)
 * Implementation: docs/rmhbox/implementation/phase-2.md §6
 */

import { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { LobbyManager } from './lobby-manager';
import { config } from './config';
import { logger } from './logger';
import { sanitizeString } from '../../lib/rmhbox/utils';
import { S2C } from '../../lib/rmhbox/events';
import { ChatSchema, validated } from './schemas';
import type { ChatMessage } from '../../lib/rmhbox/types';

export class ChatHandler {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;

  constructor(io: Server, lobbyManager: LobbyManager) {
    this.io = io;
    this.lobbyManager = lobbyManager;
  }

  handleConnection(socket: Socket): void {
    socket.on(
      'rmhbox:lobby:chat',
      validated('rmhbox:lobby:chat', ChatSchema, (s, d) => this.onChat(s, d)),
    );
  }

  private onChat(socket: Socket, payload: { lobbyId: string; content: string }): void {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;

    const lobby = this.lobbyManager.getLobbyByUserId(userId);
    if (!lobby) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in a lobby.' });
      return;
    }

    // Validate user is in the lobby (player or spectator)
    if (!lobby.players.has(userId) && !lobby.spectators.has(userId)) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in this lobby.' });
      return;
    }

    // Sanitize content
    const content = sanitizeString(payload.content, config.CHAT_MAX_LENGTH);
    if (content.length === 0) return;

    const chatMsg: ChatMessage = {
      id: nanoid(),
      userId,
      userName,
      content,
      timestamp: Date.now(),
      type: 'user',
    };

    // Add to chat history (ring buffer)
    lobby.chat.push(chatMsg);
    if (lobby.chat.length > config.CHAT_HISTORY_LENGTH) {
      lobby.chat.splice(0, lobby.chat.length - config.CHAT_HISTORY_LENGTH);
    }

    // Broadcast to all lobby members
    this.lobbyManager.broadcastAction(lobby.id, {
      type: 'CHAT_MESSAGE',
      payload: chatMsg,
    });

    lobby.lastActivityAt = Date.now();

    logger.debug({ event: 'chat_message', lobbyId: lobby.id, userId, contentLength: content.length });
  }
}
