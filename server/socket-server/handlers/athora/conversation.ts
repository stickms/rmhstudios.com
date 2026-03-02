/**
 * Athora — Conversation Bubble Socket Handlers
 *
 * Manages the lifecycle of conversation bubbles within rooms:
 * create, join/request, respond, leave.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../../prisma-client';
import { logger } from '../../logger';

export function registerAthoraConversationHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string | undefined;
  const userName = (socket.data.userName as string) || 'Player';
  const avatarUrl = (socket.data.avatarUrl as string) || null;

  if (!userId) return;

  // ── CREATE CONVERSATION ────────────────────────────────────────

  socket.on(
    'athora:conversation:create',
    async ({
      roomId,
      topic,
      isOpen,
      targetUserId,
    }: {
      roomId: string;
      topic?: string;
      isOpen?: boolean;
      targetUserId?: string;
    }) => {
      try {
        const prisma = getPrismaClient();

        // Get user's current position for anchor
        const member = await prisma.athoraRoomMember.findUnique({
          where: { roomId_userId: { roomId, userId } },
        });
        if (!member) return;

        const conversation = await prisma.athoraConversation.create({
          data: {
            roomId,
            topic,
            isOpen: isOpen ?? false,
            anchorX: member.posX,
            anchorY: member.posY,
            members: {
              create: { userId },
            },
          },
        });

        // Join socket sub-room
        socket.join(`athora:conversation:${conversation.id}`);

        // If targeting a specific user, send them an invite
        if (targetUserId) {
          await prisma.athoraConversationJoinRequest.create({
            data: {
              conversationId: conversation.id,
              requesterId: userId,
              status: 'PENDING',
              message: `${userName} wants to chat with you`,
            },
          });

          // Find target's socket and send invite
          const targetSockets = await io.in(`athora:room:${roomId}`).fetchSockets();
          for (const s of targetSockets) {
            if (s.data.userId === targetUserId) {
              s.emit('athora:conversation:request_received', {
                requestId: conversation.id,
                conversationId: conversation.id,
                requester: { id: userId, name: userName, image: avatarUrl },
                topic: topic || null,
                message: `${userName} wants to chat`,
              });
            }
          }
        }

        // Broadcast bubble creation to room
        io.to(`athora:room:${roomId}`).emit('athora:conversation:created', {
          id: conversation.id,
          topic: topic || null,
          isOpen: isOpen ?? false,
          anchorX: member.posX,
          anchorY: member.posY,
          members: [{ id: userId, name: userName, image: avatarUrl }],
        });

        logger.info({
          event: 'athora:conversation:created',
          userId,
          conversationId: conversation.id,
          roomId,
        });
      } catch (err) {
        logger.error({
          event: 'athora:conversation:create_error',
          userId,
          error: String(err),
        });
      }
    },
  );

  // ── REQUEST TO JOIN ────────────────────────────────────────────

  socket.on(
    'athora:conversation:request',
    async ({
      conversationId,
      message,
    }: {
      conversationId: string;
      message?: string;
    }) => {
      try {
        const prisma = getPrismaClient();

        const conversation = await prisma.athoraConversation.findUnique({
          where: { id: conversationId },
          include: { members: { where: { leftAt: null } } },
        });
        if (!conversation || conversation.endedAt) return;

        if (conversation.isOpen) {
          // Open conversations: auto-join
          await joinConversation(io, socket, conversationId, userId, userName, avatarUrl);
        } else {
          // Closed: create join request
          const request = await prisma.athoraConversationJoinRequest.create({
            data: { conversationId, requesterId: userId, message },
          });

          io.to(`athora:conversation:${conversationId}`).emit(
            'athora:conversation:request_received',
            {
              requestId: request.id,
              conversationId,
              requester: { id: userId, name: userName, image: avatarUrl },
              topic: conversation.topic,
              message: message || null,
            },
          );
        }
      } catch (err) {
        logger.error({
          event: 'athora:conversation:request_error',
          userId,
          error: String(err),
        });
      }
    },
  );

  // ── RESPOND TO JOIN REQUEST ────────────────────────────────────

  socket.on(
    'athora:conversation:respond',
    async ({ requestId, accept }: { requestId: string; accept: boolean }) => {
      try {
        const prisma = getPrismaClient();

        const request = await prisma.athoraConversationJoinRequest.update({
          where: { id: requestId },
          data: {
            status: accept ? 'ACCEPTED' : 'DECLINED',
            respondedAt: new Date(),
          },
          include: { requester: true },
        });

        if (accept) {
          // Find requester's socket and add them
          const sockets = await io.fetchSockets();
          for (const s of sockets) {
            if (s.data.userId === request.requesterId) {
              await joinConversation(
                io,
                s as unknown as Socket,
                request.conversationId,
                request.requesterId,
                request.requester.name || 'Player',
                request.requester.image,
              );
              break;
            }
          }
        }

        // Notify requester of response
        const requesterSockets = await io.fetchSockets();
        for (const s of requesterSockets) {
          if (s.data.userId === request.requesterId) {
            s.emit('athora:conversation:request_response', {
              requestId,
              accepted: accept,
            });
          }
        }
      } catch (err) {
        logger.error({
          event: 'athora:conversation:respond_error',
          userId,
          error: String(err),
        });
      }
    },
  );

  // ── LEAVE CONVERSATION ─────────────────────────────────────────

  socket.on(
    'athora:conversation:leave',
    async ({ conversationId }: { conversationId: string }) => {
      try {
        const prisma = getPrismaClient();

        await prisma.athoraConversationMember.updateMany({
          where: { conversationId, userId, leftAt: null },
          data: { leftAt: new Date() },
        });

        socket.leave(`athora:conversation:${conversationId}`);

        io.to(`athora:conversation:${conversationId}`).emit(
          'athora:conversation:user_left',
          { conversationId, userId },
        );

        // Check if conversation is now empty
        const remaining = await prisma.athoraConversationMember.count({
          where: { conversationId, leftAt: null },
        });

        if (remaining === 0) {
          await prisma.athoraConversation.update({
            where: { id: conversationId },
            data: { endedAt: new Date() },
          });

          const conv = await prisma.athoraConversation.findUnique({
            where: { id: conversationId },
          });
          if (conv) {
            io.to(`athora:room:${conv.roomId}`).emit(
              'athora:conversation:ended',
              { conversationId },
            );
          }
        }
      } catch (err) {
        logger.error({
          event: 'athora:conversation:leave_error',
          userId,
          error: String(err),
        });
      }
    },
  );
}

// ── HELPER: Join a conversation ──────────────────────────────────

async function joinConversation(
  io: Server,
  socket: Socket,
  conversationId: string,
  userId: string,
  userName: string,
  avatarUrl: string | null,
): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.athoraConversationMember.create({
    data: { conversationId, userId },
  });

  socket.join(`athora:conversation:${conversationId}`);

  const userBrief = { id: userId, name: userName, image: avatarUrl };

  io.to(`athora:conversation:${conversationId}`).emit(
    'athora:conversation:user_joined',
    { conversationId, user: userBrief },
  );

  // Also update the room-level bubble
  const conv = await prisma.athoraConversation.findUnique({
    where: { id: conversationId },
  });
  if (conv) {
    io.to(`athora:room:${conv.roomId}`).emit(
      'athora:conversation:user_joined',
      { conversationId, user: userBrief },
    );
  }
}
