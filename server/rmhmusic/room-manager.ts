import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { config } from './config';
import { logger } from './logger';
import { getPrismaClient } from './prisma-client';
import { validated } from './schemas';
import { C2S, S2C } from '../../lib/rmhmusic/events';
import {
  CreateRoomSchema,
  JoinRoomSchema,
  TransferHostSchema,
  BrowseRoomsSchema,
} from '../../lib/rmhmusic/schemas';
import { generateRoomCode } from '../../lib/rmhmusic/utils';
import type { ServerRoom, ServerMember } from './types';
import type { ClientRoomState, ClientMemberInfo, PublicRoomInfo } from '../../lib/rmhmusic/types';
import { CHAT_HISTORY_LENGTH } from '../../lib/rmhmusic/constants';

export class RoomManager {
  public rooms = new Map<string, ServerRoom>();
  private socketToRoom = new Map<string, string>();
  private userToSocket = new Map<string, string>();

  constructor(private io: Server) {}

  handleConnection(socket: Socket): void {
    const userId = (socket.data as any).userId as string;
    const userName = (socket.data as any).userName as string;
    const avatarUrl = (socket.data as any).avatarUrl as string | null;

    this.userToSocket.set(userId, socket.id);

    socket.on(C2S.ROOM_CREATE, validated(socket, C2S.ROOM_CREATE, CreateRoomSchema, (s, p) =>
      this.onCreate(s, p, userId, userName, avatarUrl)));

    socket.on(C2S.ROOM_JOIN, validated(socket, C2S.ROOM_JOIN, JoinRoomSchema, (s, p) =>
      this.onJoin(s, p, userId, userName, avatarUrl)));

    socket.on(C2S.ROOM_LEAVE, () => this.onLeave(socket, userId));

    socket.on(C2S.ROOM_TRANSFER_HOST, validated(socket, C2S.ROOM_TRANSFER_HOST, TransferHostSchema, (s, p) =>
      this.onTransferHost(s, p, userId)));

    socket.on(C2S.ROOM_BROWSE, validated(socket, C2S.ROOM_BROWSE, BrowseRoomsSchema, (s, p) =>
      this.onBrowse(s, p)));

    socket.on('disconnect', () => this.onDisconnect(socket, userId));
  }

  private async onCreate(
    socket: Socket,
    payload: { name?: string; isPublic?: boolean; password?: string },
    userId: string,
    userName: string,
    avatarUrl: string | null,
  ) {
    if (this.socketToRoom.has(socket.id)) {
      socket.emit(S2C.ERROR, { code: 'ALREADY_IN_ROOM', message: 'Leave current room first' });
      return;
    }

    const code = generateRoomCode();
    const roomId = nanoid();
    const name = payload.name || `${userName}'s Room`;
    const now = Date.now();

    const room: ServerRoom = {
      id: roomId,
      code,
      name,
      hostUserId: userId,
      isPublic: payload.isPublic ?? true,
      password: payload.password ?? null,
      maxMembers: 10,
      members: new Map(),
      queue: [],
      currentTrack: null,
      playback: { trackUri: null, positionMs: 0, isPlaying: false, updatedAt: now },
      chat: [],
      seq: 0,
      createdAt: now,
      lastActivityAt: now,
    };

    const member: ServerMember = {
      userId,
      userName,
      avatarUrl,
      socketId: socket.id,
      isConnected: true,
      joinedAt: now,
      disconnectedAt: null,
    };

    room.members.set(userId, member);
    this.rooms.set(roomId, room);
    this.socketToRoom.set(socket.id, roomId);

    socket.join(roomId);
    socket.emit(S2C.ROOM_CREATED, { roomId, code });
    socket.emit(S2C.ROOM_STATE_SNAPSHOT, this.toClientState(room, userId));

    const prisma = getPrismaClient();
    await prisma.rmhMusicRoom.create({
      data: { id: roomId, code, name, hostId: userId, isPublic: room.isPublic, password: room.password },
    }).catch((err: Error) => logger.error({ event: 'db_create_room_failed', error: err.message }));

    logger.info({ event: 'room_created', roomId, code, hostUserId: userId });
  }

  private async onJoin(
    socket: Socket,
    payload: { code: string; password?: string },
    userId: string,
    userName: string,
    avatarUrl: string | null,
  ) {
    if (this.socketToRoom.has(socket.id)) {
      socket.emit(S2C.ERROR, { code: 'ALREADY_IN_ROOM', message: 'Leave current room first' });
      return;
    }

    const room = this.findRoomByCode(payload.code);
    if (!room) {
      socket.emit(S2C.ERROR, { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }

    if (room.password && room.password !== payload.password) {
      socket.emit(S2C.ERROR, { code: 'WRONG_PASSWORD', message: 'Wrong password' });
      return;
    }

    if (room.members.size >= room.maxMembers) {
      socket.emit(S2C.ERROR, { code: 'ROOM_FULL', message: 'Room is full' });
      return;
    }

    const existing = room.members.get(userId);
    if (existing) {
      existing.socketId = socket.id;
      existing.isConnected = true;
      existing.disconnectedAt = null;
    } else {
      room.members.set(userId, {
        userId,
        userName,
        avatarUrl,
        socketId: socket.id,
        isConnected: true,
        joinedAt: Date.now(),
        disconnectedAt: null,
      });
    }

    this.socketToRoom.set(socket.id, room.id);
    room.lastActivityAt = Date.now();
    socket.join(room.id);

    socket.emit(S2C.ROOM_STATE_SNAPSHOT, this.toClientState(room, userId));

    if (!existing) {
      this.broadcastAction(room, 'MEMBER_JOINED', { userId, userName, avatarUrl });
    }

    logger.info({ event: 'user_joined_room', roomId: room.id, userId });
  }

  private onLeave(socket: Socket, userId: string) {
    const roomId = this.socketToRoom.get(socket.id);
    if (!roomId) return;
    this.removeMember(socket, roomId, userId);
  }

  private onDisconnect(socket: Socket, userId: string) {
    const roomId = this.socketToRoom.get(socket.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(userId);
    if (!member) return;

    member.isConnected = false;
    member.disconnectedAt = Date.now();

    setTimeout(() => {
      const r = this.rooms.get(roomId);
      if (!r) return;
      const m = r.members.get(userId);
      if (m && !m.isConnected) {
        this.removeMember(socket, roomId, userId);
      }
    }, config.graceMs);

    this.socketToRoom.delete(socket.id);
    this.broadcastAction(room, 'MEMBER_DISCONNECTED', { userId });
  }

  private removeMember(socket: Socket, roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.members.delete(userId);
    this.socketToRoom.delete(socket.id);
    socket.leave(roomId);

    if (room.members.size === 0) {
      this.rooms.delete(roomId);
      logger.info({ event: 'room_deleted_empty', roomId });
      return;
    }

    this.broadcastAction(room, 'MEMBER_LEFT', { userId });

    if (room.hostUserId === userId) {
      const newHost = room.members.values().next().value;
      if (newHost) {
        room.hostUserId = newHost.userId;
        this.broadcastAction(room, 'HOST_TRANSFERRED', {
          newHostUserId: newHost.userId,
          newHostUserName: newHost.userName,
        });
      }
    }
  }

  private onTransferHost(socket: Socket, payload: { targetUserId: string }, userId: string) {
    const room = this.getRoomForSocket(socket.id);
    if (!room || room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can transfer' });
      return;
    }

    const target = room.members.get(payload.targetUserId);
    if (!target) {
      socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'User not in room' });
      return;
    }

    room.hostUserId = target.userId;
    this.broadcastAction(room, 'HOST_TRANSFERRED', {
      newHostUserId: target.userId,
      newHostUserName: target.userName,
    });
  }

  private onBrowse(socket: Socket, payload: { limit: number }) {
    const publicRooms: PublicRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (!room.isPublic) continue;
      publicRooms.push({
        roomId: room.id,
        code: room.code,
        name: room.name,
        hostName: room.members.get(room.hostUserId)?.userName ?? 'Unknown',
        memberCount: room.members.size,
        maxMembers: room.maxMembers,
        currentTrack: room.currentTrack?.title ?? null,
        hasPassword: !!room.password,
      });
      if (publicRooms.length >= payload.limit) break;
    }
    socket.emit(S2C.ROOM_BROWSE_RESULT, { rooms: publicRooms });
  }

  public getRoomForSocket(socketId: string): ServerRoom | null {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) ?? null : null;
  }

  public getUserIdForSocket(socketId: string): string | null {
    return (this.io.sockets.sockets.get(socketId)?.data as any)?.userId ?? null;
  }

  private findRoomByCode(code: string): ServerRoom | null {
    for (const room of this.rooms.values()) {
      if (room.code.toUpperCase() === code.toUpperCase()) return room;
    }
    return null;
  }

  public broadcastAction(room: ServerRoom, type: string, payload: unknown) {
    room.seq++;
    room.lastActivityAt = Date.now();
    this.io.to(room.id).emit(S2C.ROOM_ACTION, {
      type,
      payload,
      seq: room.seq,
      timestamp: Date.now(),
    });
  }

  private toClientState(room: ServerRoom, userId: string): ClientRoomState {
    const members: ClientMemberInfo[] = [];
    for (const m of room.members.values()) {
      members.push({
        userId: m.userId,
        userName: m.userName,
        avatarUrl: m.avatarUrl,
        isConnected: m.isConnected,
        isHost: m.userId === room.hostUserId,
      });
    }

    return {
      roomId: room.id,
      code: room.code,
      name: room.name,
      hostUserId: room.hostUserId,
      settings: {
        isPublic: room.isPublic,
        maxMembers: room.maxMembers,
        password: null,
      },
      members,
      queue: room.queue.map((q) => ({
        id: q.id,
        spotifyUri: q.spotifyUri,
        title: q.title,
        artist: q.artist,
        albumArt: q.albumArt,
        durationMs: q.durationMs,
        previewUrl: q.previewUrl ?? null,
        addedBy: q.addedById,
        addedByName: q.addedByName,
        addedAt: q.addedAt,
        position: q.position,
      })),
      currentTrack: room.currentTrack,
      playback: room.playback,
      chat: room.chat.slice(-CHAT_HISTORY_LENGTH),
      myUserId: userId,
      seq: room.seq,
    };
  }

  public startGC() {
    setInterval(() => {
      const now = Date.now();
      for (const [roomId, room] of this.rooms) {
        if (room.members.size === 0 && now - room.lastActivityAt > config.emptyTimeoutMs) {
          this.rooms.delete(roomId);
          logger.info({ event: 'gc_removed_empty_room', roomId });
        }
      }
    }, config.gcIntervalMs);
  }
}
