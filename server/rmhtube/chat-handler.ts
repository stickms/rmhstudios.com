/**
 * RmhTube — Chat Handler
 *
 * Handles in-room text chat with rate limiting, sanitization,
 * ring buffer history, and DB persistence.
 */

import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { config } from './config';
import { logger } from './logger';
import { getPrismaClient } from './prisma-client';
import { validated } from './schemas';
import { C2S } from '../../lib/rmhtube/events';
import { ChatSchema } from '../../lib/rmhtube/schemas';
import { sanitizeString } from '../../lib/rmhtube/utils';
import type { RoomManager } from './room-manager';

export class ChatHandler {
  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {}

  handleConnection(socket: Socket): void {
    socket.on(
      C2S.ROOM_CHAT,
      validated(socket, C2S.ROOM_CHAT, ChatSchema, (s, p) => this.onChat(s, p)),
    );
  }

  private async onChat(socket: Socket, payload: { content: string }): Promise<void> {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    const content = sanitizeString(payload.content, config.CHAT_MAX_LENGTH);
    if (!content) return;

    const now = Date.now();
    const message = {
      id: nanoid(12),
      userId,
      userName,
      content,
      createdAt: now,
    };

    // Ring buffer: trim to max history
    room.chat.push(message);
    if (room.chat.length > config.CHAT_HISTORY_LENGTH) {
      room.chat.splice(0, room.chat.length - config.CHAT_HISTORY_LENGTH);
    }

    room.lastActivityAt = now;

    this.roomManager.broadcastAction(room, 'CHAT_MESSAGE', message);

    // Persist to DB (fire-and-forget)
    this.persistMessage(room.id, message).catch((err) => {
      logger.error({ event: 'db_chat_persist_failed', roomId: room.id, error: String(err) });
    });
  }

  private async persistMessage(
    roomId: string,
    message: { id: string; userId: string; userName: string; content: string; createdAt: number },
  ): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeChatMessage.create({
      data: {
        id: message.id,
        roomId,
        userId: message.userId,
        userName: message.userName,
        content: message.content,
        createdAt: new Date(message.createdAt),
      },
    });
  }
}
