/**
 * Athora — Room Socket Handlers
 *
 * Handles room join/leave/move events and position broadcasting.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../../prisma-client';
import { logger } from '../../logger';
import {
  addRoomUser,
  removeRoomUser,
  getUserRoom,
  getRoomUsers,
  updateRoomUserPosition,
  getRoomUserCount,
  type AthoraRoomUser,
} from './state';

export function registerAthoraRoomHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string | undefined;
  const userName = (socket.data.userName as string) || 'Player';
  const avatarUrl = (socket.data.avatarUrl as string) || null;

  if (!userId) return; // Auth required for Athora

  // ── JOIN ROOM ──────────────────────────────────────────────────

  socket.on('athora:room:join', async ({ roomId }: { roomId: string }) => {
    try {
      const prisma = getPrismaClient();

      // 1. Verify room exists and has capacity
      const room = await prisma.athoraRoom.findUnique({
        where: { id: roomId },
        include: { stands: { include: { media: { orderBy: { sortOrder: 'asc' } } } } },
      });

      if (!room || !room.isActive) {
        return socket.emit('athora:error', {
          code: 'ROOM_NOT_FOUND',
          message: 'Room does not exist',
        });
      }

      const currentCount = getRoomUserCount(roomId);
      if (currentCount >= room.capacity) {
        return socket.emit('athora:error', {
          code: 'ROOM_FULL',
          message: 'Room is at capacity',
        });
      }

      // 2. Leave any previous room
      const prevRoom = getUserRoom(userId);
      if (prevRoom) {
        await leaveRoom(io, socket, prevRoom, userId);
      }

      // 3. Fetch user details for avatar
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          image: true,
          avatarConfig: true,
          athoraAvailability: true,
          interestTags: true,
        },
      });

      // 4. Determine spawn position
      const spawnX = 400 + Math.random() * 200;
      const spawnY = 600 + Math.random() * 100;

      // 5. Create/update membership record
      await prisma.athoraRoomMember.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: { roomId, userId, posX: spawnX, posY: spawnY },
        update: { posX: spawnX, posY: spawnY, lastSeen: new Date() },
      });

      // 6. Track in-memory state
      const roomUser: AthoraRoomUser = {
        id: userId,
        name: user?.name || userName,
        image: user?.image || avatarUrl,
        avatarConfig: user?.avatarConfig || null,
        x: spawnX,
        y: spawnY,
        facing: 'SOUTH',
        availability: user?.athoraAvailability || 'OPEN_TO_CHAT',
        interestTags: user?.interestTags || [],
        socketId: socket.id,
      };
      addRoomUser(roomId, roomUser);

      // 7. Join Socket.IO room
      socket.join(`athora:room:${roomId}`);

      // 8. Get all current users
      const users = Array.from(getRoomUsers(roomId).values()).map((u) => ({
        id: u.id,
        name: u.name,
        image: u.image,
        avatarConfig: u.avatarConfig,
        x: u.x,
        y: u.y,
        facing: u.facing,
        availability: u.availability,
        interestTags: u.interestTags,
      }));

      // 9. Get active conversations
      const conversations = await prisma.athoraConversation.findMany({
        where: { roomId, endedAt: null },
        include: {
          members: {
            where: { leftAt: null },
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      });

      // 10. Send full room state to joining user
      socket.emit('athora:room:state', {
        room: {
          id: room.id,
          name: room.name,
          mapWidth: room.mapWidth,
          mapHeight: room.mapHeight,
          template: room.template,
          tileMapData: room.tileMapData,
          backgroundUrl: room.backgroundUrl,
          ownerId: room.ownerId,
          accessType: room.accessType,
          standPermission: (room as any).standPermission || 'OWNER_ONLY',
          standAllowedUserIds: (room as any).standAllowedUserIds || [],
        },
        users,
        stands: room.stands.map((s: any) => ({
          id: s.id,
          title: s.title,
          tagline: s.tagline,
          description: s.description,
          logoUrl: s.logoUrl,
          websiteUrl: s.websiteUrl,
          posX: s.posX,
          posY: s.posY,
          width: s.width,
          height: s.height,
          tier: s.tier,
          style: s.style,
          media: s.media.map((m: any) => ({
            id: m.id,
            type: m.type,
            url: m.url,
            caption: m.caption,
          })),
          leadCaptureEnabled: s.leadCaptureEnabled,
          queueEnabled: s.queueEnabled,
        })),
        conversations: conversations.map((c: any) => ({
          id: c.id,
          topic: c.topic,
          isOpen: c.isOpen,
          anchorX: c.anchorX,
          anchorY: c.anchorY,
          members: c.members.map((m: any) => ({
            id: m.user.id,
            name: m.user.name,
            image: m.user.image,
          })),
        })),
        myPosition: { x: spawnX, y: spawnY },
      });

      // 11. Notify others in room
      socket.to(`athora:room:${roomId}`).emit('athora:room:user_joined', {
        id: userId,
        name: user?.name || userName,
        image: user?.image || avatarUrl,
        avatarConfig: user?.avatarConfig || null,
        x: spawnX,
        y: spawnY,
        facing: 'SOUTH',
        availability: user?.athoraAvailability || 'OPEN_TO_CHAT',
        interestTags: user?.interestTags || [],
      });

      // 12. Update room count in DB
      await prisma.athoraRoom.update({
        where: { id: roomId },
        data: { currentCount: { increment: 1 } },
      });

      // 13. Increment passport visits
      await prisma.user.update({
        where: { id: userId },
        data: { passportVisits: { increment: 1 } },
      });

      logger.info({
        event: 'athora:room:joined',
        userId,
        roomId,
        roomName: room.name,
      });
    } catch (err) {
      logger.error({ event: 'athora:room:join_error', userId, error: String(err) });
      socket.emit('athora:error', {
        code: 'JOIN_FAILED',
        message: 'Failed to join room',
      });
    }
  });

  // ── MOVE ───────────────────────────────────────────────────────

  socket.on(
    'athora:room:move',
    ({ roomId, x, y, facing }: { roomId: string; x: number; y: number; facing: string }) => {
      // Broadcast immediately to other users
      socket.to(`athora:room:${roomId}`).emit('athora:room:user_moved', {
        userId,
        x,
        y,
        facing,
      });

      // Update in-memory state
      updateRoomUserPosition(roomId, userId, x, y, facing);
    },
  );

  // ── STATUS CHANGE ──────────────────────────────────────────────

  socket.on(
    'athora:room:status',
    async ({ availability }: { availability: string }) => {
      const roomId = getUserRoom(userId);
      if (!roomId) return;

      const users = getRoomUsers(roomId);
      const user = users.get(userId);
      if (user) user.availability = availability;

      io.to(`athora:room:${roomId}`).emit('athora:room:user_status', {
        userId,
        availability,
      });

      // Persist
      const prisma = getPrismaClient();
      await prisma.user
        .update({
          where: { id: userId },
          data: { athoraAvailability: availability as any },
        })
        .catch(() => {});
    },
  );

  // ── ROOM SETTINGS (host only) ──────────────────────────────────

  socket.on(
    'athora:room:settings',
    async ({ roomId, accessType, isActive, standPermission, standAllowedUserIds }: {
      roomId: string;
      accessType?: string;
      isActive?: boolean;
      standPermission?: string;
      standAllowedUserIds?: string[];
    }) => {
      try {
        const prisma = getPrismaClient();

        // Verify the user is the room owner
        const room = await prisma.athoraRoom.findUnique({
          where: { id: roomId },
          select: { ownerId: true },
        });

        if (!room || room.ownerId !== userId) {
          return socket.emit('athora:error', {
            code: 'NOT_AUTHORIZED',
            message: 'Only the room host can change settings',
          });
        }

        const data: Record<string, unknown> = {};
        if (accessType) data.accessType = accessType;
        if (typeof isActive === 'boolean') data.isActive = isActive;
        if (standPermission) data.standPermission = standPermission;
        if (standAllowedUserIds) data.standAllowedUserIds = standAllowedUserIds;

        await prisma.athoraRoom.update({
          where: { id: roomId },
          data: data as any,
        });

        // Broadcast the settings change to everyone in the room
        io.to(`athora:room:${roomId}`).emit('athora:room:settings_changed', {
          roomId,
          accessType: accessType || undefined,
          isActive: typeof isActive === 'boolean' ? isActive : undefined,
          standPermission: standPermission || undefined,
          standAllowedUserIds: standAllowedUserIds || undefined,
        });

        // If room was closed, kick everyone out
        if (isActive === false) {
          const roomUsers = getRoomUsers(roomId);
          for (const [uid] of roomUsers) {
            if (uid !== userId) {
              const sockets = await io.in(`athora:room:${roomId}`).fetchSockets();
              for (const s of sockets) {
                if (s.data.userId === uid) {
                  s.emit('athora:room:closed', { roomId, message: 'The host has closed this room.' });
                }
              }
            }
          }
        }

        logger.info({ event: 'athora:room:settings_changed', userId, roomId, accessType, isActive });
      } catch (err) {
        logger.error({ event: 'athora:room:settings_error', userId, error: String(err) });
        socket.emit('athora:error', { code: 'SETTINGS_FAILED', message: 'Failed to update room settings' });
      }
    },
  );

  // ── LEAVE ROOM ─────────────────────────────────────────────────

  socket.on('athora:room:leave', ({ roomId }: { roomId: string }) => {
    leaveRoom(io, socket, roomId, userId);
  });
}

// ── DISCONNECT HANDLER ─────────────────────────────────────────

export function handleAthoraRoomDisconnect(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string | undefined;
  if (!userId) return;

  const roomId = getUserRoom(userId);
  if (roomId) {
    leaveRoom(io, socket, roomId, userId);
  }
}

// ── LEAVE ROOM HELPER ──────────────────────────────────────────

async function leaveRoom(
  io: Server,
  socket: Socket,
  roomId: string,
  userId: string,
): Promise<void> {
  socket.leave(`athora:room:${roomId}`);
  removeRoomUser(roomId, userId);

  // Notify others
  io.to(`athora:room:${roomId}`).emit('athora:room:user_left', { userId });

  // Update DB
  const prisma = getPrismaClient();
  await prisma.athoraRoom
    .update({
      where: { id: roomId },
      data: { currentCount: { decrement: 1 } },
    })
    .catch(() => {});

  await prisma.athoraRoomMember
    .updateMany({
      where: { roomId, userId },
      data: { lastSeen: new Date() },
    })
    .catch(() => {});

  logger.info({ event: 'athora:room:left', userId, roomId });
}
