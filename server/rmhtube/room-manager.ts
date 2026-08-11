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
  SetLeaderSchema,
  BanSchema,
  UnbanSchema,
  CreateInviteSchema,
  SetStatusSchema,
  CheckHistorySchema,
} from '../../lib/rmhtube/schemas';
import { z } from 'zod';
import { generateRoomCode, sanitizeString } from '../../lib/rmhtube/utils';
import { parseMedia } from '../../lib/rmhtube/media';
import { reanchor, initialVideoState } from '../../lib/rmhtube/sync-math';
import { createPeerWaitRuntime } from './types';
import type { RmhTubeRoom, RmhTubeMember, RoomSettings, ChatMessage, QueueItem, BannedUser, InviteLink } from './types';
import type { ClientRoomState, ClientMemberInfo, QueueBroadcastItem, PublicRoomInfo } from '../../lib/rmhtube/types';

/**
 * The database row `hydrateRoom` reads. Spelled out rather than inferred from
 * Prisma's generics so the shape a restore depends on is visible here.
 */
interface DbRoomRow {
  id: string;
  name: string | null;
  hostId: string;
  isPublic: boolean;
  password: string | null;
  maxMembers: number;
  allowMemberQueue: boolean;
  allowMemberSkip: boolean;
  autoPlay: boolean;
  queueVoting: boolean;
  autoSortByVotes: boolean;
  loopQueue: boolean;
  customReactions: string[];
  waitForSlowPeers: boolean;
  createdAt: Date;
  updatedAt: Date;
  members: {
    userId: string;
    joinedAt: Date;
    user: { id: string; name: string | null; image: string | null };
  }[];
  queue: {
    id: string;
    url: string;
    mediaType: string;
    title: string;
    duration: number | null;
    thumbnailUrl: string | null;
    addedById: string;
    addedByName: string;
    position: number;
    createdAt: Date;
  }[];
  messages: {
    id: string;
    userId: string;
    userName: string;
    content: string;
    replyToId: string | null;
    createdAt: Date;
  }[];
}

/**
 * An empty stored list means "this room never chose custom reactions", which
 * the app models as null (fall back to the defaults). The zod schema requires
 * at least four when a room does choose, so an empty array is unambiguous.
 */
function parseCustomReactions(stored: string[]): string[] | null {
  return stored.length > 0 ? stored : null;
}

/** `room:leave` carries nothing, but still needs a schema to be rate-limited. */
const EmptyPayloadSchema = z.object({}).optional();

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
    socket.on(C2S.ROOM_LEAVE, validated(socket, C2S.ROOM_LEAVE, EmptyPayloadSchema, (s) => this.leaveRoom(s)));
    socket.on(C2S.ROOM_KICK, validated(socket, C2S.ROOM_KICK, KickMemberSchema, (s, p) => this.kickMember(s, p)));
    socket.on(C2S.ROOM_TRANSFER_HOST, validated(socket, C2S.ROOM_TRANSFER_HOST, TransferHostSchema, (s, p) => this.transferHost(s, p)));
    socket.on(C2S.ROOM_UPDATE_SETTINGS, validated(socket, C2S.ROOM_UPDATE_SETTINGS, UpdateSettingsSchema, (s, p) => this.updateSettings(s, p)));
    socket.on(C2S.ROOM_BROWSE, validated(socket, C2S.ROOM_BROWSE, BrowseRoomsSchema, (s, p) => this.browseRooms(s, p)));

    // Phase 4: Leader management, bans, invites, status
    socket.on(C2S.ROOM_SET_LEADER, validated(socket, C2S.ROOM_SET_LEADER, SetLeaderSchema, (s, p) => this.setLeader(s, p)));
    socket.on(C2S.ROOM_BAN, validated(socket, C2S.ROOM_BAN, BanSchema, (s, p) => this.banMember(s, p)));
    socket.on(C2S.ROOM_UNBAN, validated(socket, C2S.ROOM_UNBAN, UnbanSchema, (s, p) => this.unbanMember(s, p)));
    socket.on(C2S.ROOM_CREATE_INVITE, validated(socket, C2S.ROOM_CREATE_INVITE, CreateInviteSchema, (s, p) => this.createInvite(s, p)));
    socket.on(C2S.ROOM_SET_STATUS, validated(socket, C2S.ROOM_SET_STATUS, SetStatusSchema, (s, p) => this.setStatus(s, p)));
    socket.on(C2S.ROOM_CHECK_HISTORY, validated(socket, C2S.ROOM_CHECK_HISTORY, CheckHistorySchema, (s, p) => this.checkHistory(s, p)));
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
      queueVoting: payload.settings?.queueVoting ?? false,
      autoSortByVotes: payload.settings?.autoSortByVotes ?? false,
      loopQueue: payload.settings?.loopQueue ?? false,
      customReactions: payload.settings?.customReactions ?? null,
      waitForSlowPeers: payload.settings?.waitForSlowPeers ?? true,
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
      status: 'watching',
    };

    const room: RmhTubeRoom = {
      id: roomId,
      name: payload.name ? sanitizeString(payload.name, 64) : null,
      hostUserId: userId,
      leaderUserId: userId,
      settings,
      members: new Map([[userId, host]]),
      queue: [],
      currentItem: null,
      currentIndex: -1,
      videoState: initialVideoState(now),
      chat: [],
      skipVotes: new Set(),
      createdAt: now,
      lastActivityAt: now,
      seq: 0,
      pinnedMessage: null,
      typingTimers: new Map(),
      chatReactions: new Map(),
      queueVotes: new Map(),
      playedItems: [],
      bannedUsers: [],
      inviteLinks: [],
      peerWait: createPeerWaitRuntime(),
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
      socket.emit(S2C.ERROR, { code: 'ROOM_NOT_FOUND', message: 'Room not found.', roomId });
      return;
    }

    // Check ban list before allowing entry
    if (room.bannedUsers.some((b) => b.userId === userId)) {
      socket.emit(S2C.ERROR, { code: 'BANNED', message: 'You are banned from this room.' });
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
    // Restore host role if this user is the room's host (e.g. solo host left and rejoined)
    const isReturningHost = room.hostUserId === userId;
    const member: RmhTubeMember = {
      userId,
      userName,
      avatarUrl,
      socketId: socket.id,
      isConnected: true,
      joinedAt: now,
      lastSeenAt: now,
      role: isReturningHost ? 'host' : 'member',
      status: 'watching',
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
      // Pick the longest-in-room connected member (or any remaining member)
      const nextHost = this.getLongestConnectedMember(room);
      if (nextHost) {
        room.hostUserId = nextHost.userId;
        nextHost.role = 'host';

        // Leader also transfers to the new host
        room.leaderUserId = nextHost.userId;

        this.broadcastAction(room, 'HOST_TRANSFERRED', {
          newHostUserId: nextHost.userId,
          newHostUserName: nextHost.userName,
          newLeaderUserId: nextHost.userId,
        });

        // Update DB
        this.persistHostTransfer(roomId, nextHost.userId).catch((err) => {
          logger.error({ event: 'db_host_transfer_failed', roomId, error: String(err) });
        });
      }
    } else if (userId === room.leaderUserId) {
      // Leader left but host is still here — give leader to host,
      // or longest-in-room member if host is disconnected
      const host = room.members.get(room.hostUserId);
      const nextLeader = (host?.isConnected ? host : null) ?? this.getLongestConnectedMember(room);
      if (nextLeader) {
        room.leaderUserId = nextLeader.userId;
        this.broadcastAction(room, 'LEADER_CHANGED', {
          newLeaderUserId: nextLeader.userId,
          newLeaderUserName: nextLeader.userName,
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
    if (!room) return;

    // Host-only
    if (room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can kick members.' });
      return;
    }

    const target = room.members.get(payload.targetUserId);
    if (!target) return;

    // Cannot kick yourself
    if (payload.targetUserId === userId) return;

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

    // Also transfer leader to the new host
    room.leaderUserId = payload.targetUserId;

    this.broadcastAction(room, 'HOST_TRANSFERRED', {
      newHostUserId: payload.targetUserId,
      newHostUserName: target.userName,
      newLeaderUserId: payload.targetUserId,
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
    if (s.queueVoting !== undefined) room.settings.queueVoting = s.queueVoting;
    if (s.autoSortByVotes !== undefined) room.settings.autoSortByVotes = s.autoSortByVotes;
    if (s.loopQueue !== undefined) room.settings.loopQueue = s.loopQueue;
    if (s.customReactions !== undefined) room.settings.customReactions = s.customReactions;
    if (s.waitForSlowPeers !== undefined) room.settings.waitForSlowPeers = s.waitForSlowPeers;

    room.lastActivityAt = Date.now();

    this.broadcastAction(room, 'SETTINGS_UPDATED', room.settings);

    // Persist settings change
    this.persistSettingsUpdate(roomId, room.settings).catch((err) => {
      logger.error({ event: 'db_settings_update_failed', roomId, error: String(err) });
    });
  }

  // ─── Leader Management ───────────────────────────────────────

  private setLeader(
    socket: Socket,
    payload: { targetUserId: string },
  ): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    // Only the current leader or host can set a new leader
    if (room.leaderUserId !== userId && room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_LEADER', message: 'Only the current leader or host can transfer leadership.' });
      return;
    }

    const target = room.members.get(payload.targetUserId);
    if (!target) return;

    room.leaderUserId = payload.targetUserId;
    room.lastActivityAt = Date.now();

    this.broadcastAction(room, 'LEADER_CHANGED', {
      newLeaderUserId: payload.targetUserId,
      newLeaderUserName: target.userName,
    });

    logger.info({ event: 'leader_changed', roomId, newLeaderUserId: payload.targetUserId, byUserId: userId });
  }

  // ─── Phase 4.2: Ban List ──────────────────────────────────────

  private banMember(
    socket: Socket,
    payload: { targetUserId: string; reason?: string },
  ): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    // Host-only
    if (room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can ban members.' });
      return;
    }

    // Cannot ban yourself
    if (payload.targetUserId === userId) return;

    // Check if already banned
    if (room.bannedUsers.some((b) => b.userId === payload.targetUserId)) {
      socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'User is already banned.' });
      return;
    }

    const targetMember = room.members.get(payload.targetUserId);
    const bannedUser: BannedUser = {
      userId: payload.targetUserId,
      userName: targetMember?.userName ?? 'Unknown',
      bannedAt: Date.now(),
      bannedBy: userId,
      reason: payload.reason ?? null,
    };

    room.bannedUsers.push(bannedUser);

    // Notify the banned user and disconnect them
    if (targetMember?.socketId) {
      const targetSocket = this.io.sockets.sockets.get(targetMember.socketId);
      targetSocket?.emit(S2C.ROOM_KICKED, { reason: 'banned' });
    }

    // Remove from room (this also handles socket leave and index cleanup)
    if (room.members.has(payload.targetUserId)) {
      this.removeMember(roomId, payload.targetUserId, 'kicked');
    }

    this.broadcastAction(room, 'MEMBER_BANNED', {
      userId: payload.targetUserId,
      userName: bannedUser.userName,
      reason: payload.reason ?? null,
    });

    room.lastActivityAt = Date.now();

    logger.info({ event: 'member_banned', roomId, targetUserId: payload.targetUserId, byUserId: userId });
  }

  private unbanMember(
    socket: Socket,
    payload: { targetUserId: string },
  ): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can unban members.' });
      return;
    }

    const idx = room.bannedUsers.findIndex((b) => b.userId === payload.targetUserId);
    if (idx === -1) {
      socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'User is not banned.' });
      return;
    }

    const unbannedUser = room.bannedUsers[idx];
    room.bannedUsers.splice(idx, 1);

    this.broadcastAction(room, 'MEMBER_UNBANNED', {
      userId: payload.targetUserId,
      userName: unbannedUser.userName,
    });

    room.lastActivityAt = Date.now();

    logger.info({ event: 'member_unbanned', roomId, targetUserId: payload.targetUserId, byUserId: userId });
  }

  // ─── Phase 4.3: Invite Links ──────────────────────────────────

  private createInvite(
    socket: Socket,
    payload: { expiresIn: '1h' | '6h' | '24h' | '7d' | 'never'; maxUses: number },
  ): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can create invites.' });
      return;
    }

    // Max 10 active invites
    if (room.inviteLinks.length >= 10) {
      socket.emit(S2C.ERROR, { code: 'INVALID_PAYLOAD', message: 'Maximum of 10 active invites reached.' });
      return;
    }

    const expiresInMs: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      'never': 0,
    };

    const now = Date.now();
    const ttl = expiresInMs[payload.expiresIn] ?? expiresInMs['24h'];
    const expiresAt = ttl === 0 ? 0 : now + ttl;

    const invite: InviteLink = {
      code: nanoid(8),
      roomId,
      createdBy: userId,
      expiresAt,
      maxUses: payload.maxUses,
      useCount: 0,
    };

    room.inviteLinks.push(invite);

    socket.emit(S2C.ROOM_INVITE_CREATED, invite);

    room.lastActivityAt = Date.now();

    logger.info({ event: 'invite_created', roomId, code: invite.code, byUserId: userId });
  }

  // ─── Phase 4.7: User Presence Status ──────────────────────────

  private setStatus(
    socket: Socket,
    payload: { status: 'watching' | 'afk' | 'brb' },
  ): void {
    const userId = socket.data.userId as string;
    const roomId = this.userRoomIndex.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(userId);
    if (!member) return;

    member.status = payload.status;
    room.lastActivityAt = Date.now();

    this.broadcastAction(room, 'MEMBER_STATUS_CHANGED', {
      userId,
      status: payload.status,
    });

    logger.info({ event: 'status_changed', roomId, userId, status: payload.status });
  }

  // ─── Room Browsing ────────────────────────────────────────────

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
        scheduledFor: null,
      });
    }

    socket.emit(S2C.ROOM_BROWSE_RESULT, { rooms: publicRooms });
  }

  // ─── Room History Check ──────────────────────────────────────

  private checkHistory(socket: Socket, payload: { roomIds: string[] }): void {
    const results = payload.roomIds.map((roomId) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        return { roomId, isOpen: false, memberCount: 0, maxMembers: 0, hostName: null, currentVideo: null };
      }
      const activeCount = Array.from(room.members.values()).filter((m) => m.isConnected).length;
      const host = room.members.get(room.hostUserId);
      return {
        roomId,
        isOpen: true,
        memberCount: activeCount,
        maxMembers: room.settings.maxMembers,
        hostName: host?.userName ?? 'Unknown',
        currentVideo: room.currentItem?.title ?? null,
      };
    });

    socket.emit(S2C.ROOM_HISTORY_STATUS, { rooms: results });
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

  /**
   * A queue item in the shape every broadcast and snapshot uses.
   *
   * One mapper, because there used to be four inline ones — in `reorder`,
   * `shuffle`, `sortByVotes` and the history broadcast — and none of them
   * carried the vote fields. Every reorder therefore replaced each client's
   * queue with items whose vote counts were gone.
   */
  toBroadcastItem(room: RmhTubeRoom, q: QueueItem): QueueBroadcastItem {
    const voters = room.queueVotes.get(q.id);
    return {
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
      live: q.live,
      votes: voters?.size ?? 0,
      voters: voters ? Array.from(voters) : [],
    };
  }

  broadcastQueue(room: RmhTubeRoom): QueueBroadcastItem[] {
    return room.queue.map((q) => this.toBroadcastItem(room, q));
  }

  buildClientState(room: RmhTubeRoom, forUserId: string): ClientRoomState {
    const members: ClientMemberInfo[] = Array.from(room.members.values()).map((m) => ({
      userId: m.userId,
      userName: m.userName,
      avatarUrl: m.avatarUrl,
      isConnected: m.isConnected,
      isHost: m.userId === room.hostUserId,
      isLeader: m.userId === room.leaderUserId,
      role: m.role,
      status: m.status,
    }));

    const mapQueueItem = (q: QueueItem) => {
      const { voters, ...item } = this.toBroadcastItem(room, q);
      return { ...item, votedByMe: voters.includes(forUserId) };
    };

    const queue = room.queue.map(mapQueueItem);
    const currentItem = room.currentItem ? mapQueueItem(room.currentItem) : null;

    // Only expose ban list to the host
    const isHost = room.hostUserId === forUserId;

    return {
      roomId: room.id,
      name: room.name,
      hostUserId: room.hostUserId,
      leaderUserId: room.leaderUserId,
      settings: { ...room.settings },
      members,
      queue,
      currentItem,
      currentIndex: room.currentIndex,
      // Send the effective (extrapolated) position so joining/reconnecting
      // users land where the room actually is, not where the last report was.
      videoState: reanchor(room.videoState, Date.now()),
      chat: room.chat.slice(-200).map((msg) => {
        const reactions: Record<string, string[]> = {};
        const msgReactions = room.chatReactions.get(msg.id);
        if (msgReactions) {
          for (const [emoji, users] of msgReactions) {
            reactions[emoji] = Array.from(users);
          }
        }
        return { ...msg, reactions };
      }),
      skipVotes: Array.from(room.skipVotes),
      myUserId: forUserId,
      seq: room.seq,
      typingUsers: [],
      pinnedMessage: room.pinnedMessage ? (() => {
        const reactions: Record<string, string[]> = {};
        const msgReactions = room.chatReactions.get(room.pinnedMessage!.id);
        if (msgReactions) {
          for (const [emoji, users] of msgReactions) {
            reactions[emoji] = Array.from(users);
          }
        }
        return { ...room.pinnedMessage!, reactions };
      })() : null,
      playedItems: room.playedItems.slice(-50).map(mapQueueItem),
      bannedUsers: isHost ? room.bannedUsers : [],
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

  /** Returns true if the user is the current room leader. */
  isLeader(room: RmhTubeRoom, userId: string): boolean {
    return room.leaderUserId === userId;
  }

  /** Returns the longest-in-room connected member (for leader/host fallback). */
  private getLongestConnectedMember(room: RmhTubeRoom): RmhTubeMember | undefined {
    let oldest: RmhTubeMember | undefined;
    for (const m of room.members.values()) {
      if (!m.isConnected) continue;
      if (!oldest || m.joinedAt < oldest.joinedAt) {
        oldest = m;
      }
    }
    return oldest ?? room.members.values().next().value;
  }

  // ─── Database Restoration ────────────────────────────────────

  /** The room shape both restore paths read out of Postgres. */
  private static readonly DB_INCLUDE = {
    members: {
      where: { leftAt: null },
      include: { user: { select: { id: true, name: true, image: true } } },
    },
    queue: { where: { playedAt: null }, orderBy: { position: 'asc' } },
    messages: { orderBy: { createdAt: 'desc' }, take: config.CHAT_HISTORY_LENGTH },
  } as const;

  /**
   * Build the in-memory room from its database row.
   *
   * Boot-restore and join-time load used to carry a copy of this each, and the
   * copies had drifted: both hardcoded `queueVoting`, `autoSortByVotes`,
   * `loopQueue` and `customReactions` to their defaults, so every one of those
   * settings silently reverted whenever the hub restarted — the host set them,
   * saw them apply, and found them off again the next evening.
   */
  private hydrateRoom(dbRoom: DbRoomRow): RmhTubeRoom {
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
        status: 'watching',
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
      // Liveness is a runtime observation, not a stored fact — the leader's
      // player reports it once the item loads. The URL hint is the seed.
      live: parseMedia(q.url)?.liveHint === 'live',
    }));

    const chat: ChatMessage[] = dbRoom.messages
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.userName,
        content: m.content,
        createdAt: m.createdAt.getTime(),
        replyToId: m.replyToId ?? null,
        replyToContent: null,
        replyToUserName: null,
        mentions: [],
        timestamp: null,
      }))
      .reverse(); // DB ordered desc, we need asc

    return {
      id: dbRoom.id,
      name: dbRoom.name,
      hostUserId: dbRoom.hostId,
      leaderUserId: dbRoom.hostId,
      settings: {
        isPublic: dbRoom.isPublic,
        maxMembers: dbRoom.maxMembers,
        allowMemberQueue: dbRoom.allowMemberQueue,
        allowMemberSkip: dbRoom.allowMemberSkip,
        autoPlay: dbRoom.autoPlay,
        password: dbRoom.password,
        queueVoting: dbRoom.queueVoting,
        autoSortByVotes: dbRoom.autoSortByVotes,
        loopQueue: dbRoom.loopQueue,
        customReactions: parseCustomReactions(dbRoom.customReactions),
        waitForSlowPeers: dbRoom.waitForSlowPeers,
      },
      members,
      queue,
      currentItem: null,
      currentIndex: -1,
      videoState: initialVideoState(now),
      chat,
      skipVotes: new Set(),
      createdAt: dbRoom.createdAt.getTime(),
      lastActivityAt: dbRoom.updatedAt.getTime(),
      seq: 0,
      pinnedMessage: null,
      typingTimers: new Map(),
      chatReactions: new Map(),
      queueVotes: new Map(),
      playedItems: [],
      bannedUsers: [],
      inviteLinks: [],
      peerWait: createPeerWaitRuntime(),
    };
  }

  /** Register a hydrated room and index its members so they can reconnect. */
  private adoptRoom(room: RmhTubeRoom): RmhTubeRoom {
    this.rooms.set(room.id, room);
    for (const userId of room.members.keys()) this.userRoomIndex.set(userId, room.id);
    return room;
  }

  /**
   * Load all active (non-closed) rooms from the database into memory.
   * Called once on server startup so rooms survive restarts.
   * Members start as disconnected — they reconnect via socket.
   */
  async restoreRoomsFromDb(): Promise<void> {
    const prisma = getPrismaClient();

    const dbRooms = await prisma.rmhTubeRoom.findMany({
      where: { closedAt: null },
      include: RoomManager.DB_INCLUDE,
    });

    let restored = 0;
    for (const dbRoom of dbRooms) {
      // Skip rooms already in memory (shouldn't happen on a fresh start) and
      // rooms nobody is left in.
      if (this.rooms.has(dbRoom.id)) continue;
      if (dbRoom.members.length === 0) continue;
      this.adoptRoom(this.hydrateRoom(dbRoom));
      restored++;
    }

    if (restored > 0) {
      logger.info({ event: 'rooms_restored_from_db', count: restored });
    }
  }

  /**
   * Load a single room from the database into memory. Used when a user joins a
   * room that is not in the in-memory cache. Null when it is gone or closed.
   */
  async loadRoomFromDb(roomId: string): Promise<RmhTubeRoom | null> {
    const cached = this.rooms.get(roomId);
    if (cached) return cached;

    const prisma = getPrismaClient();
    const dbRoom = await prisma.rmhTubeRoom.findUnique({
      where: { id: roomId, closedAt: null },
      include: RoomManager.DB_INCLUDE,
    });
    if (!dbRoom) return null;

    logger.info({ event: 'room_loaded_from_db', roomId });
    return this.adoptRoom(this.hydrateRoom(dbRoom));
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
        queueVoting: room.settings.queueVoting,
        autoSortByVotes: room.settings.autoSortByVotes,
        loopQueue: room.settings.loopQueue,
        customReactions: room.settings.customReactions ?? [],
        waitForSlowPeers: room.settings.waitForSlowPeers,
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
        queueVoting: settings.queueVoting,
        autoSortByVotes: settings.autoSortByVotes,
        loopQueue: settings.loopQueue,
        customReactions: settings.customReactions ?? [],
        waitForSlowPeers: settings.waitForSlowPeers,
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
