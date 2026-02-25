/**
 * RmhTube — Room Manager
 *
 * Handles room lifecycle: create, join, leave, kick, host transfer,
 * settings, browsing, and garbage collection.
 *
 * Persists room metadata, members, and queue to the database.
 * Keeps an in-memory cache for fast reads during real-time operations.
 */

import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { config } from './config';
import { logger } from './logger';
import { getPrismaClient } from './prisma-client';
import { validated } from './schemas';
import { C2S, S2C } from '../../lib/rmhtube/events';
import {
  CreateRoomSchema,
  JoinRoomSchema,
  KickMemberSchema,
  TransferHostSchema,
  UpdateSettingsSchema,
  BrowseRoomsSchema,
} from '../../lib/rmhtube/schemas';
import { generateRoomCode, sanitizeString } from '../../lib/rmhtube/utils';
import type { RmhTubeRoom, RmhTubeMember, VideoState, RoomSettings, ChatMessage, QueueItem } from './types';
import type { ClientRoomState, ClientMemberInfo, ClientQueueItem, PublicRoomInfo } from '../../lib/rmhtube/types';

export class RoomManager {
  /** All active rooms in memory */
  readonly rooms = new Map<string, RmhTubeRoom>();
  /** userId → roomId index for fast lookup */
  readonly userRoomIndex = new Map<string, string>();
  /** Disconnection grace period timers (userId → timeout handle) */
  readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private gcInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private io: Server) {}

  // ─── Connection Handler ──────────────────────────────────────

  handleConnection(socket: Socket): void {
    socket.on(C2S.ROOM_CREATE, validated(socket, C2S.ROOM_CREATE, CreateRoomSchema, (s, p) => this.createRoom(s, p)));
    socket.on(C2S.ROOM_JOIN, validated(socket, C2S.ROOM_JOIN, JoinRoomSchema, (s, p) => this.joinRoom(s, p)));
    socket.on(C2S.ROOM_LEAVE, () => this.leaveRoom(socket));
    socket.on(C2S.ROOM_KICK, validated(socket, C2S.ROOM_KICK, KickMemberSchema, (s, p) => this.kickMember(s, p)));
    socket.on(C2S.ROOM_TRANSFER_HOST, validated(socket, C2S.ROOM_TRANSFER_HOST, TransferHostSchema, (s, p) => this.transferHost(s, p)));
    socket.on(C2S.ROOM_UPDATE_SETTINGS, validated(socket, C2S.ROOM_UPDATE_SETTINGS, UpdateSettingsSchema, (s, p) => this.updateSettings(s, p)));
    socket.on(C2S.ROOM_BROWSE, validated(socket, C2S.ROOM_BROWSE, BrowseRoomsSchema, (s, p) => this.browseRooms(s, p)));
  }

  handleDisconnect(socket: Socket): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(userId);
    if (!member) return;

    // Mark disconnected, start grace period
    member.isConnected = false;
    member.socketId = null;
    room.lastActivityAt = Date.now();

    this.broadcastAction(room, 'MEMBER_DISCONNECTED', { userId });

    // Grace period: auto-remove after timeout
    const timer = setTimeout(() => {
      this.removeMember(roomId, userId, 'grace_expired');
    }, config.DISCONNECT_GRACE_PERIOD_MS);
    this.graceTimers.set(userId, timer);

    logger.info({ event: 'member_disconnected', roomId, userId, grace: config.DISCONNECT_GRACE_PERIOD_MS });
  }

  // ─── Room CRUD ───────────────────────────────────────────────

  private async createRoom(
    socket: Socket,
    payload: { settings?: Partial<RoomSettings>; name?: string },
  ): Promise<void> {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const avatarUrl = socket.data.avatarUrl as string | null;

    // If user is already in a room, leave it first
    const existingRoomId = this.userRoomIndex.get(userId);
    if (existingRoomId) {
      this.removeMember(existingRoomId, userId, 'left');
    }

    // Generate unique room code
    let roomId = generateRoomCode();
    let attempts = 0;
    while (this.rooms.has(roomId) && attempts < 10) {
      roomId = generateRoomCode();
      attempts++;
    }

    const settings: RoomSettings = {
      isPublic: payload.settings?.isPublic ?? true,
      maxMembers: Math.min(payload.settings?.maxMembers ?? config.DEFAULT_MAX_MEMBERS, config.ABSOLUTE_MAX_MEMBERS),
      allowMemberQueue: payload.settings?.allowMemberQueue ?? true,
      allowMemberSkip: payload.settings?.allowMemberSkip ?? true,
      autoPlay: payload.settings?.autoPlay ?? true,
      password: payload.settings?.password ?? null,
    };

    const now = Date.now();
    const host: RmhTubeMember = {
      userId,
      userName,
      avatarUrl,
      socketId: socket.id,
      isConnected: true,
      joinedAt: now,
      lastSeenAt: now,
      role: 'host',
    };

    const room: RmhTubeRoom = {
      id: roomId,
      name: payload.name ? sanitizeString(payload.name, 64) : null,
      hostUserId: userId,
      settings,
      members: new Map([[userId, host]]),
      queue: [],
      currentItem: null,
      currentIndex: -1,
      videoState: { playing: false, currentTime: 0, playbackRate: 1, updatedAt: now },
      chat: [],
      skipVotes: new Set(),
      createdAt: now,
      lastActivityAt: now,
      seq: 0,
    };

    this.rooms.set(roomId, room);
    this.userRoomIndex.set(userId, roomId);

    socket.join(roomId);

    // Persist to DB
    this.persistRoomCreate(room).catch((err) => {
      logger.error({ event: 'db_room_create_failed', roomId, error: String(err) });
    });

    socket.emit(S2C.ROOM_CREATED, { roomId });
    socket.emit(S2C.ROOM_STATE_SNAPSHOT, this.buildClientState(room, userId));

    logger.info({ event: 'room_created', roomId, userId, userName });
  }

  private async joinRoom(
    socket: Socket,
    payload: { roomId: string; password?: string },
  ): Promise<void> {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const avatarUrl = socket.data.avatarUrl as string | null;
    const roomId = payload.roomId.toUpperCase();

    // If user is already tracked in a room, handle gracefully
    const existingRoomId = this.userRoomIndex.get(userId);
    if (existingRoomId) {
      if (existingRoomId === roomId) {
        // Same room — treat as rejoin (refresh, navigation, reconnect)
        const room = this.rooms.get(roomId);
        if (room) {
          const member = room.members.get(userId);
          if (member) {
            // Clear any pending grace timer
            const timer = this.graceTimers.get(userId);
            if (timer) {
              clearTimeout(timer);
              this.graceTimers.delete(userId);
            }

            member.socketId = socket.id;
            member.isConnected = true;
            member.lastSeenAt = Date.now();
            room.lastActivityAt = Date.now();

            socket.join(roomId);
            socket.emit(S2C.ROOM_STATE_SNAPSHOT, this.buildClientState(room, userId));
            this.broadcastAction(room, 'MEMBER_CONNECTED', { userId });

            logger.info({ event: 'member_rejoined', roomId, userId, userName });
            return;
          }
        }
        // Room or member not found despite index — clean up stale index
        this.userRoomIndex.delete(userId);
      } else {
        // In a different room — leave the old one first
        this.removeMember(existingRoomId, userId, 'left');
      }
    }

    let room = this.rooms.get(roomId);

    // If not in memory, try loading from DB
    if (!room) {
      room = await this.loadRoomFromDb(roomId) ?? undefined;
    }

    if (!room) {
      socket.emit(S2C.ERROR, { code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
      return;
    }

    if (room.settings.password && room.settings.password !== payload.password) {
      socket.emit(S2C.ERROR, { code: 'WRONG_PASSWORD', message: 'Incorrect room password.' });
      return;
    }

    const activeMembers = Array.from(room.members.values()).filter((m) => m.isConnected);
    if (activeMembers.length >= room.settings.maxMembers) {
      socket.emit(S2C.ERROR, { code: 'ROOM_FULL', message: 'Room is full.' });
      return;
    }

    const now = Date.now();
    const member: RmhTubeMember = {
      userId,
      userName,
      avatarUrl,
      socketId: socket.id,
      isConnected: true,
      joinedAt: now,
      lastSeenAt: now,
      role: 'member',
    };

    room.members.set(userId, member);
    this.userRoomIndex.set(userId, roomId);
    room.lastActivityAt = now;

    socket.join(roomId);

    // Persist member join
    this.persistMemberJoin(roomId, userId).catch((err) => {
      logger.error({ event: 'db_member_join_failed', roomId, userId, error: String(err) });
    });

    this.broadcastAction(room, 'MEMBER_JOINED', { userId, userName, avatarUrl });
    socket.emit(S2C.ROOM_STATE_SNAPSHOT, this.buildClientState(room, userId));

    logger.info({ event: 'member_joined', roomId, userId, userName });
  }

  leaveRoom(socket: Socket): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    this.removeMember(roomId, userId, 'left');
    socket.leave(roomId);
  }

  private removeMember(roomId: string, userId: string, reason: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(userId);
    if (!member) return;

    // Clear grace timer if any
    const timer = this.graceTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(userId);
    }

    // Leave socket room
    if (member.socketId) {
      const memberSocket = this.io.sockets.sockets.get(member.socketId);
      memberSocket?.leave(roomId);
    }

    room.members.delete(userId);
    this.userRoomIndex.delete(userId);
    room.lastActivityAt = Date.now();

    // Persist member leave
    this.persistMemberLeave(roomId, userId).catch((err) => {
      logger.error({ event: 'db_member_leave_failed', roomId, userId, error: String(err) });
    });

    // If room is now empty, schedule cleanup
    if (room.members.size === 0) {
      setTimeout(() => {
        if (this.rooms.has(roomId) && this.rooms.get(roomId)!.members.size === 0) {
          this.disbandRoom(roomId, 'empty');
        }
      }, config.ROOM_EMPTY_TIMEOUT_MS);
      return;
    }

    this.broadcastAction(room, reason === 'kicked' ? 'MEMBER_KICKED' : 'MEMBER_LEFT', { userId });

    // Transfer host if the host left
    if (userId === room.hostUserId) {
      const nextHost = Array.from(room.members.values()).find((m) => m.isConnected) ?? room.members.values().next().value;
      if (nextHost) {
        room.hostUserId = nextHost.userId;
        nextHost.role = 'host';
        this.broadcastAction(room, 'HOST_TRANSFERRED', { newHostUserId: nextHost.userId, newHostUserName: nextHost.userName });

        // Update DB
        this.persistHostTransfer(roomId, nextHost.userId).catch((err) => {
          logger.error({ event: 'db_host_transfer_failed', roomId, error: String(err) });
        });
      }
    }

    logger.info({ event: 'member_removed', roomId, userId, reason });
  }

  private kickMember(socket: Socket, payload: { targetUserId: string }): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room || room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can kick members.' });
      return;
    }

    const target = room.members.get(payload.targetUserId);
    if (!target) return;

    // Notify the kicked user
    if (target.socketId) {
      const targetSocket = this.io.sockets.sockets.get(target.socketId);
      targetSocket?.emit(S2C.ROOM_KICKED);
    }

    this.removeMember(roomId, payload.targetUserId, 'kicked');
  }

  private transferHost(socket: Socket, payload: { targetUserId: string }): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room || room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can transfer host.' });
      return;
    }

    const target = room.members.get(payload.targetUserId);
    if (!target) return;

    // Update roles
    const oldHost = room.members.get(userId);
    if (oldHost) oldHost.role = 'member';
    target.role = 'host';
    room.hostUserId = payload.targetUserId;

    this.broadcastAction(room, 'HOST_TRANSFERRED', {
      newHostUserId: payload.targetUserId,
      newHostUserName: target.userName,
    });

    this.persistHostTransfer(roomId, payload.targetUserId).catch((err) => {
      logger.error({ event: 'db_host_transfer_failed', roomId, error: String(err) });
    });
  }

  private updateSettings(socket: Socket, payload: { settings: Partial<RoomSettings> }): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room || room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can update settings.' });
      return;
    }

    const s = payload.settings;
    if (s.isPublic !== undefined) room.settings.isPublic = s.isPublic;
    if (s.maxMembers !== undefined) room.settings.maxMembers = Math.min(s.maxMembers, config.ABSOLUTE_MAX_MEMBERS);
    if (s.allowMemberQueue !== undefined) room.settings.allowMemberQueue = s.allowMemberQueue;
    if (s.allowMemberSkip !== undefined) room.settings.allowMemberSkip = s.allowMemberSkip;
    if (s.autoPlay !== undefined) room.settings.autoPlay = s.autoPlay;
    if (s.password !== undefined) room.settings.password = s.password;

    room.lastActivityAt = Date.now();

    this.broadcastAction(room, 'SETTINGS_UPDATED', room.settings);

    // Persist settings change
    this.persistSettingsUpdate(roomId, room.settings).catch((err) => {
      logger.error({ event: 'db_settings_update_failed', roomId, error: String(err) });
    });
  }

  private browseRooms(socket: Socket, payload: { limit: number }): void {
    const publicRooms: PublicRoomInfo[] = [];

    for (const room of this.rooms.values()) {
      if (!room.settings.isPublic) continue;
      if (publicRooms.length >= payload.limit) break;

      const host = room.members.get(room.hostUserId);
      const activeCount = Array.from(room.members.values()).filter((m) => m.isConnected).length;

      publicRooms.push({
        roomId: room.id,
        name: room.name,
        hostName: host?.userName ?? 'Unknown',
        memberCount: activeCount,
        maxMembers: room.settings.maxMembers,
        currentVideo: room.currentItem?.title ?? null,
        hasPassword: !!room.settings.password,
      });
    }

    socket.emit(S2C.ROOM_BROWSE_RESULT, { rooms: publicRooms });
  }

  // ─── Disband ─────────────────────────────────────────────────

  private disbandRoom(roomId: string, reason: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Notify all members
    this.io.to(roomId).emit(S2C.ROOM_DISBANDED);

    // Clean up indexes
    for (const member of room.members.values()) {
      this.userRoomIndex.delete(member.userId);
      const timer = this.graceTimers.get(member.userId);
      if (timer) {
        clearTimeout(timer);
        this.graceTimers.delete(member.userId);
      }
    }

    this.rooms.delete(roomId);

    // Mark as closed in DB
    this.persistRoomClose(roomId).catch((err) => {
      logger.error({ event: 'db_room_close_failed', roomId, error: String(err) });
    });

    logger.info({ event: 'room_disbanded', roomId, reason });
  }

  // ─── Broadcasting ────────────────────────────────────────────

  broadcastAction(room: RmhTubeRoom, type: string, payload: unknown): void {
    room.seq++;
    const action = {
      type,
      payload,
      seq: room.seq,
      timestamp: Date.now(),
    };
    this.io.to(room.id).emit(S2C.ROOM_ACTION, action);
  }

  // ─── State Snapshots ─────────────────────────────────────────

  buildClientState(room: RmhTubeRoom, forUserId: string): ClientRoomState {
    const members: ClientMemberInfo[] = Array.from(room.members.values()).map((m) => ({
      userId: m.userId,
      userName: m.userName,
      avatarUrl: m.avatarUrl,
      isConnected: m.isConnected,
      isHost: m.userId === room.hostUserId,
    }));

    const queue: ClientQueueItem[] = room.queue.map((q) => ({
      id: q.id,
      url: q.url,
      mediaType: q.mediaType,
      title: q.title,
      duration: q.duration,
      thumbnailUrl: q.thumbnailUrl,
      addedBy: q.addedBy,
      addedByName: q.addedByName,
      addedAt: q.addedAt,
      position: q.position,
    }));

    const currentItem: ClientQueueItem | null = room.currentItem
      ? {
          id: room.currentItem.id,
          url: room.currentItem.url,
          mediaType: room.currentItem.mediaType,
          title: room.currentItem.title,
          duration: room.currentItem.duration,
          thumbnailUrl: room.currentItem.thumbnailUrl,
          addedBy: room.currentItem.addedBy,
          addedByName: room.currentItem.addedByName,
          addedAt: room.currentItem.addedAt,
          position: room.currentItem.position,
        }
      : null;

    return {
      roomId: room.id,
      name: room.name,
      hostUserId: room.hostUserId,
      settings: { ...room.settings },
      members,
      queue,
      currentItem,
      currentIndex: room.currentIndex,
      videoState: { ...room.videoState },
      chat: room.chat.slice(-200),
      skipVotes: Array.from(room.skipVotes),
      myUserId: forUserId,
      seq: room.seq,
    };
  }

  // ─── Garbage Collector ───────────────────────────────────────

  startGarbageCollector(): void {
    this.gcInterval = setInterval(() => {
      const now = Date.now();
      for (const [roomId, room] of this.rooms) {
        const activeMembers = Array.from(room.members.values()).filter((m) => m.isConnected).length;

        // Empty rooms past timeout
        if (activeMembers === 0 && now - room.lastActivityAt > config.ROOM_EMPTY_TIMEOUT_MS) {
          this.disbandRoom(roomId, 'gc_empty');
          continue;
        }

        // Idle rooms past timeout
        if (now - room.lastActivityAt > config.ROOM_IDLE_TIMEOUT_MS) {
          this.disbandRoom(roomId, 'gc_idle');
        }
      }
    }, config.ROOM_GC_INTERVAL_MS);
  }

  stopGarbageCollector(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  getRoomForUser(userId: string): RmhTubeRoom | null {
    const roomId = this.userRoomIndex.get(userId);
    return roomId ? this.rooms.get(roomId) ?? null : null;
  }

  // ─── Database Restoration ────────────────────────────────────

  /**
   * Load all active (non-closed) rooms from the database into memory.
   * Called once on server startup so rooms survive restarts.
   * Members start as disconnected — they reconnect via socket.
   */
  async restoreRoomsFromDb(): Promise<void> {
    const prisma = getPrismaClient();

    const dbRooms = await prisma.rmhTubeRoom.findMany({
      where: { closedAt: null },
      include: {
        members: {
          where: { leftAt: null },
          include: { user: { select: { id: true, name: true, image: true } } },
        },
        queue: {
          where: { playedAt: null },
          orderBy: { position: 'asc' },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: config.CHAT_HISTORY_LENGTH,
        },
      },
    });

    let restored = 0;

    for (const dbRoom of dbRooms) {
      // Skip if already in memory (shouldn't happen on fresh startup)
      if (this.rooms.has(dbRoom.id)) continue;

      // Skip rooms with no members
      if (dbRoom.members.length === 0) continue;

      const now = Date.now();

      const members = new Map<string, RmhTubeMember>();
      for (const dbMember of dbRoom.members) {
        members.set(dbMember.userId, {
          userId: dbMember.userId,
          userName: dbMember.user.name ?? 'Unknown',
          avatarUrl: dbMember.user.image ?? null,
          socketId: null,
          isConnected: false,
          joinedAt: dbMember.joinedAt.getTime(),
          lastSeenAt: now,
          role: dbMember.userId === dbRoom.hostId ? 'host' : 'member',
        });
      }

      const queue: QueueItem[] = dbRoom.queue.map((q) => ({
        id: q.id,
        url: q.url,
        mediaType: q.mediaType as QueueItem['mediaType'],
        title: q.title,
        duration: q.duration,
        thumbnailUrl: q.thumbnailUrl,
        addedBy: q.addedById,
        addedByName: q.addedByName,
        addedAt: q.createdAt.getTime(),
        position: q.position,
      }));

      const chat: ChatMessage[] = dbRoom.messages
        .map((m) => ({
          id: m.id,
          userId: m.userId,
          userName: m.userName,
          content: m.content,
          createdAt: m.createdAt.getTime(),
        }))
        .reverse(); // DB ordered desc, we need asc

      const room: RmhTubeRoom = {
        id: dbRoom.id,
        name: dbRoom.name,
        hostUserId: dbRoom.hostId,
        settings: {
          isPublic: dbRoom.isPublic,
          maxMembers: dbRoom.maxMembers,
          allowMemberQueue: dbRoom.allowMemberQueue,
          allowMemberSkip: dbRoom.allowMemberSkip,
          autoPlay: dbRoom.autoPlay,
          password: dbRoom.password,
        },
        members,
        queue,
        currentItem: null,
        currentIndex: -1,
        videoState: { playing: false, currentTime: 0, playbackRate: 1, updatedAt: now },
        chat,
        skipVotes: new Set(),
        createdAt: dbRoom.createdAt.getTime(),
        lastActivityAt: dbRoom.updatedAt.getTime(),
        seq: 0,
      };

      this.rooms.set(dbRoom.id, room);

      // Index all members so they can reconnect
      for (const dbMember of dbRoom.members) {
        this.userRoomIndex.set(dbMember.userId, dbRoom.id);
      }

      restored++;
    }

    if (restored > 0) {
      logger.info({ event: 'rooms_restored_from_db', count: restored });
    }
  }

  /**
   * Try to load a single room from the database into memory.
   * Used when a user joins a room that's not in the in-memory cache.
   * Returns the room if found and active, null otherwise.
   */
  async loadRoomFromDb(roomId: string): Promise<RmhTubeRoom | null> {
    if (this.rooms.has(roomId)) return this.rooms.get(roomId)!;

    const prisma = getPrismaClient();

    const dbRoom = await prisma.rmhTubeRoom.findUnique({
      where: { id: roomId, closedAt: null },
      include: {
        members: {
          where: { leftAt: null },
          include: { user: { select: { id: true, name: true, image: true } } },
        },
        queue: {
          where: { playedAt: null },
          orderBy: { position: 'asc' },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: config.CHAT_HISTORY_LENGTH,
        },
      },
    });

    if (!dbRoom) return null;

    const now = Date.now();

    const members = new Map<string, RmhTubeMember>();
    for (const dbMember of dbRoom.members) {
      members.set(dbMember.userId, {
        userId: dbMember.userId,
        userName: dbMember.user.name ?? 'Unknown',
        avatarUrl: dbMember.user.image ?? null,
        socketId: null,
        isConnected: false,
        joinedAt: dbMember.joinedAt.getTime(),
        lastSeenAt: now,
        role: dbMember.userId === dbRoom.hostId ? 'host' : 'member',
      });
    }

    const queue: QueueItem[] = dbRoom.queue.map((q) => ({
      id: q.id,
      url: q.url,
      mediaType: q.mediaType as QueueItem['mediaType'],
      title: q.title,
      duration: q.duration,
      thumbnailUrl: q.thumbnailUrl,
      addedBy: q.addedById,
      addedByName: q.addedByName,
      addedAt: q.createdAt.getTime(),
      position: q.position,
    }));

    const chat: ChatMessage[] = dbRoom.messages
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.userName,
        content: m.content,
        createdAt: m.createdAt.getTime(),
      }))
      .reverse();

    const room: RmhTubeRoom = {
      id: dbRoom.id,
      name: dbRoom.name,
      hostUserId: dbRoom.hostId,
      settings: {
        isPublic: dbRoom.isPublic,
        maxMembers: dbRoom.maxMembers,
        allowMemberQueue: dbRoom.allowMemberQueue,
        allowMemberSkip: dbRoom.allowMemberSkip,
        autoPlay: dbRoom.autoPlay,
        password: dbRoom.password,
      },
      members,
      queue,
      currentItem: null,
      currentIndex: -1,
      videoState: { playing: false, currentTime: 0, playbackRate: 1, updatedAt: now },
      chat,
      skipVotes: new Set(),
      createdAt: dbRoom.createdAt.getTime(),
      lastActivityAt: dbRoom.updatedAt.getTime(),
      seq: 0,
    };

    this.rooms.set(dbRoom.id, room);

    // Index all existing members
    for (const dbMember of dbRoom.members) {
      this.userRoomIndex.set(dbMember.userId, dbRoom.id);
    }

    logger.info({ event: 'room_loaded_from_db', roomId });
    return room;
  }

  // ─── Database Persistence ────────────────────────────────────

  private async persistRoomCreate(room: RmhTubeRoom): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeRoom.create({
      data: {
        id: room.id,
        name: room.name,
        hostId: room.hostUserId,
        isPublic: room.settings.isPublic,
        password: room.settings.password,
        maxMembers: room.settings.maxMembers,
        allowMemberQueue: room.settings.allowMemberQueue,
        allowMemberSkip: room.settings.allowMemberSkip,
        autoPlay: room.settings.autoPlay,
        members: {
          create: {
            userId: room.hostUserId,
          },
        },
      },
    });
  }

  private async persistMemberJoin(roomId: string, userId: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeRoomMember.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId },
      update: { leftAt: null },
    });
  }

  private async persistMemberLeave(roomId: string, userId: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeRoomMember.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
  }

  private async persistHostTransfer(roomId: string, newHostId: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeRoom.update({
      where: { id: roomId },
      data: { hostId: newHostId },
    });
  }

  private async persistSettingsUpdate(roomId: string, settings: RoomSettings): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeRoom.update({
      where: { id: roomId },
      data: {
        isPublic: settings.isPublic,
        password: settings.password,
        maxMembers: settings.maxMembers,
        allowMemberQueue: settings.allowMemberQueue,
        allowMemberSkip: settings.allowMemberSkip,
        autoPlay: settings.autoPlay,
      },
    });
  }

  private async persistRoomClose(roomId: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeRoom.update({
      where: { id: roomId },
      data: { closedAt: new Date() },
    });
  }
}
