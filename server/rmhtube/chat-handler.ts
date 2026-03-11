/**
 * RmhTube — Chat Handler
 *
 * Handles in-room text chat with rate limiting, sanitization,
 * ring buffer history, and DB persistence.
 *
 * Also handles: message replies, @mentions, timestamp sharing,
 * typing indicators, chat reactions, and pinned messages.
 */

import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { config } from './config';
import { logger } from './logger';
import { getPrismaClient } from './prisma-client';
import { validated } from './schemas';
import { C2S, S2C } from '../../lib/rmhtube/events';
import { ChatSchema, ChatReactSchema, ChatPinSchema } from '../../lib/rmhtube/schemas';
import { sanitizeString } from '../../lib/rmhtube/utils';
import type { RoomManager } from './room-manager';
import type { ChatMessage } from './types';

const EmptySchema = z.object({}).optional();

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

    socket.on(
      C2S.CHAT_TYPING,
      validated(socket, C2S.CHAT_TYPING, EmptySchema, (s) => this.onTyping(s)),
    );

    socket.on(
      C2S.CHAT_REACT,
      validated(socket, C2S.CHAT_REACT, ChatReactSchema, (s, p) => this.onChatReact(s, p)),
    );

    socket.on(
      C2S.CHAT_PIN,
      validated(socket, C2S.CHAT_PIN, ChatPinSchema, (s, p) => this.onChatPin(s, p)),
    );
  }

  // ─── Chat Message ───────────────────────────────────────────

  private async onChat(
    socket: Socket,
    payload: { content: string; replyToId?: string; mentions?: string[]; timestamp?: number | null },
  ): Promise<void> {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    const content = sanitizeString(payload.content, config.CHAT_MAX_LENGTH);
    if (!content) return;

    // ── Reply resolution ──
    let replyToId: string | null = null;
    let replyToContent: string | null = null;
    let replyToUserName: string | null = null;

    if (payload.replyToId) {
      const referencedMessage = room.chat.find((m) => m.id === payload.replyToId);
      if (referencedMessage) {
        replyToId = referencedMessage.id;
        replyToContent = referencedMessage.content.slice(0, 80);
        replyToUserName = referencedMessage.userName;
      }
    }

    // ── Mentions validation ──
    let mentions: string[] = [];
    if (payload.mentions && payload.mentions.length > 0) {
      mentions = payload.mentions.filter((mentionedUserId) => room.members.has(mentionedUserId));
    }

    // ── Timestamp pass-through ──
    const timestamp: number | null = payload.timestamp ?? null;

    const now = Date.now();
    const message: ChatMessage = {
      id: nanoid(12),
      userId,
      userName,
      content,
      createdAt: now,
      replyToId,
      replyToContent,
      replyToUserName,
      mentions,
      timestamp,
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

  // ─── Typing Indicators ─────────────────────────────────────

  private onTyping(socket: Socket): void {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    // Clear any existing typing timer for this user
    const existingTimer = room.typingTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Broadcast typing indicator to other room members (not the sender)
    socket.to(room.id).emit(S2C.CHAT_TYPING_INDICATOR, { userId, userName });

    // Auto-clear after 3 seconds
    const timer = setTimeout(() => {
      room.typingTimers.delete(userId);
    }, 3_000);
    room.typingTimers.set(userId, timer);
  }

  // ─── Chat Reactions ─────────────────────────────────────────

  private onChatReact(socket: Socket, payload: { messageId: string; emoji: string }): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    const { messageId, emoji } = payload;

    // Verify the message exists in the chat history
    const messageExists = room.chat.some((m) => m.id === messageId);
    if (!messageExists) return;

    // Get or create the reactions map for this message
    if (!room.chatReactions.has(messageId)) {
      room.chatReactions.set(messageId, new Map());
    }
    const messageReactions = room.chatReactions.get(messageId)!;

    // Get or create the set of users for this emoji
    if (!messageReactions.has(emoji)) {
      messageReactions.set(emoji, new Set());
    }
    const emojiUsers = messageReactions.get(emoji)!;

    // Toggle: if user already reacted with this emoji, remove; otherwise add
    if (emojiUsers.has(userId)) {
      emojiUsers.delete(userId);
      // Clean up empty sets
      if (emojiUsers.size === 0) {
        messageReactions.delete(emoji);
      }
      // Clean up empty maps
      if (messageReactions.size === 0) {
        room.chatReactions.delete(messageId);
      }
    } else {
      emojiUsers.add(userId);
    }

    // Build the serialized reactions: Record<string, string[]>
    const reactions: Record<string, string[]> = {};
    const currentReactions = room.chatReactions.get(messageId);
    if (currentReactions) {
      for (const [emojiKey, userSet] of currentReactions) {
        reactions[emojiKey] = Array.from(userSet);
      }
    }

    this.roomManager.broadcastAction(room, 'CHAT_REACTION', { messageId, reactions });
  }

  // ─── Pinned Messages ───────────────────────────────────────

  private onChatPin(socket: Socket, payload: { messageId: string | null }): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    // Host-only
    if (room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can pin messages.' });
      return;
    }

    if (payload.messageId === null) {
      // Unpin
      room.pinnedMessage = null;
      this.roomManager.broadcastAction(room, 'MESSAGE_UNPINNED', {});
    } else {
      // Find the message to pin
      const message = room.chat.find((m) => m.id === payload.messageId);
      if (!message) {
        socket.emit(S2C.ERROR, { code: 'MESSAGE_NOT_FOUND', message: 'Message not found.' });
        return;
      }

      room.pinnedMessage = message;
      this.roomManager.broadcastAction(room, 'MESSAGE_PINNED', { message });
    }
  }

  // ─── Database Persistence ──────────────────────────────────

  private async persistMessage(
    roomId: string,
    message: ChatMessage,
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
