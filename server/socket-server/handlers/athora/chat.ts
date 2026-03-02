/**
 * Athora — Chat Socket Handlers
 *
 * Handles proximity chat and conversation-scoped messaging.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../../prisma-client';
import { logger } from '../../logger';

export function registerAthoraChatHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string | undefined;
  const userName = (socket.data.userName as string) || 'Player';
  const avatarUrl = (socket.data.avatarUrl as string) || null;

  if (!userId) return;

  // ── PROXIMITY CHAT ─────────────────────────────────────────────

  socket.on(
    'athora:chat:proximity',
    async ({ roomId, content }: { roomId: string; content: string }) => {
      if (!content.trim() || content.length > 500) return;

      const prisma = getPrismaClient();

      const message = await prisma.athoraMessage.create({
        data: {
          senderId: userId,
          content: content.trim(),
          type: 'TEXT',
          isProximity: true,
          roomId,
        },
      });

      // Broadcast to entire room — clients filter by proximity distance
      io.to(`athora:room:${roomId}`).emit('athora:chat:proximity_msg', {
        id: message.id,
        senderId: userId,
        senderName: userName,
        senderImage: avatarUrl,
        content: content.trim(),
        timestamp: message.createdAt.toISOString(),
      });
    },
  );

  // ── CONVERSATION CHAT ──────────────────────────────────────────

  socket.on(
    'athora:chat:conversation',
    async ({
      conversationId,
      content,
      type,
    }: {
      conversationId: string;
      content: string;
      type?: string;
    }) => {
      if (!content.trim()) return;

      const prisma = getPrismaClient();

      // Verify sender is a member
      const membership = await prisma.athoraConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!membership || membership.leftAt) return;

      const message = await prisma.athoraMessage.create({
        data: {
          conversationId,
          senderId: userId,
          content: content.trim(),
          type: (type as any) || 'TEXT',
        },
      });

      // Broadcast to conversation members
      io.to(`athora:conversation:${conversationId}`).emit(
        'athora:chat:conversation_msg',
        {
          id: message.id,
          conversationId,
          senderId: userId,
          senderName: userName,
          senderImage: avatarUrl,
          content: content.trim(),
          type: (type as any) || 'TEXT',
          timestamp: message.createdAt.toISOString(),
        },
      );
    },
  );

  // ── TYPING INDICATOR ───────────────────────────────────────────

  socket.on(
    'athora:chat:typing',
    ({ conversationId, roomId }: { conversationId?: string; roomId?: string }) => {
      if (conversationId) {
        socket
          .to(`athora:conversation:${conversationId}`)
          .emit('athora:chat:typing', { userId, conversationId });
      } else if (roomId) {
        socket
          .to(`athora:room:${roomId}`)
          .emit('athora:chat:typing', { userId });
      }
    },
  );
}
