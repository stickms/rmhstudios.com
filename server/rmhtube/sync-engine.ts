/**
 * RmhTube — Video Sync Engine
 *
 * Manages host-authoritative video playback synchronization.
 * The host's player state is the source of truth. The server
 * stores the canonical VideoState and broadcasts it to all
 * non-host members on a 2-second heartbeat.
 *
 * Explicit host actions (play/pause/seek) broadcast immediately.
 */

import type { Server, Socket } from 'socket.io';
import { config } from './config';
import { logger } from './logger';
import { validated } from './schemas';
import { C2S, S2C } from '../../lib/rmhtube/events';
import { HostStateSchema, SeekSchema, SetSpeedSchema } from '../../lib/rmhtube/schemas';
import type { RoomManager } from './room-manager';
import { z } from 'zod';

const EmptySchema = z.object({}).optional();

export class SyncEngine {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {}

  /** Check if user is the current room leader */
  private checkLeader(userId: string): { room: import('./types').RmhTubeRoom; allowed: boolean } | null {
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return null;
    return { room, allowed: room.leaderUserId === userId };
  }

  handleConnection(socket: Socket): void {
    socket.on(
      C2S.SYNC_HOST_STATE,
      validated(socket, C2S.SYNC_HOST_STATE, HostStateSchema, (s, p) => this.onHostState(s, p)),
    );
    socket.on(
      C2S.SYNC_PLAY,
      validated(socket, C2S.SYNC_PLAY, EmptySchema, (s) => this.onPlay(s)),
    );
    socket.on(
      C2S.SYNC_PAUSE,
      validated(socket, C2S.SYNC_PAUSE, EmptySchema, (s) => this.onPause(s)),
    );
    socket.on(
      C2S.SYNC_SEEK,
      validated(socket, C2S.SYNC_SEEK, SeekSchema, (s, p) => this.onSeek(s, p)),
    );
    socket.on(
      C2S.SYNC_SET_SPEED,
      validated(socket, C2S.SYNC_SET_SPEED, SetSpeedSchema, (s, p) => this.onSetSpeed(s, p)),
    );
  }

  // ─── Host State Report (every ~1s from host client) ──────────

  private onHostState(
    socket: Socket,
    payload: { playing: boolean; currentTime: number; playbackRate: number; timestamp: number },
  ): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room || room.leaderUserId !== userId) return;

    room.videoState = {
      playing: payload.playing,
      currentTime: payload.currentTime,
      playbackRate: payload.playbackRate,
      updatedAt: Date.now(),
    };
  }

  // ─── Explicit Host Actions (immediate broadcast) ─────────────

  private onPlay(socket: Socket): void {
    const userId = socket.data.userId as string;
    const result = this.checkLeader(userId);
    if (!result?.allowed) return;
    const { room } = result;

    room.videoState.playing = true;
    room.videoState.updatedAt = Date.now();
    room.lastActivityAt = Date.now();

    // Broadcast immediately to all other members
    socket.to(room.id).emit(S2C.SYNC_PLAY);
  }

  private onPause(socket: Socket): void {
    const userId = socket.data.userId as string;
    const result = this.checkLeader(userId);
    if (!result?.allowed) return;
    const { room } = result;

    room.videoState.playing = false;
    room.videoState.updatedAt = Date.now();
    room.lastActivityAt = Date.now();

    socket.to(room.id).emit(S2C.SYNC_PAUSE);
  }

  private onSeek(socket: Socket, payload: { time: number }): void {
    const userId = socket.data.userId as string;
    const result = this.checkLeader(userId);
    if (!result?.allowed) return;
    const { room } = result;

    room.videoState.currentTime = payload.time;
    room.videoState.updatedAt = Date.now();
    room.lastActivityAt = Date.now();

    socket.to(room.id).emit(S2C.SYNC_SEEK, { time: payload.time });
  }

  private onSetSpeed(socket: Socket, payload: { speed: number }): void {
    const userId = socket.data.userId as string;
    const result = this.checkLeader(userId);
    if (!result?.allowed) return;
    const { room } = result;

    room.videoState.playbackRate = payload.speed;
    room.videoState.updatedAt = Date.now();
    room.lastActivityAt = Date.now();

    this.io.to(room.id).emit(S2C.SYNC_SPEED_CHANGED, { speed: payload.speed });
  }

  // ─── Heartbeat ───────────────────────────────────────────────

  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const room of this.roomManager.rooms.values()) {
        if (!room.currentItem) continue;
        if (room.members.size <= 1) continue;

        // Broadcast current video state to all members in the room
        this.io.to(room.id).emit(S2C.SYNC_STATE, room.videoState);
      }
    }, config.SYNC_HEARTBEAT_INTERVAL_MS);

    logger.info({ event: 'sync_heartbeat_started', intervalMs: config.SYNC_HEARTBEAT_INTERVAL_MS });
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info({ event: 'sync_heartbeat_stopped' });
    }
  }

  // ─── Media Change ────────────────────────────────────────────

  /**
   * Called by MediaQueue when the current video changes.
   * Resets video state and notifies all clients.
   */
  onMediaChanged(room: import('./types').RmhTubeRoom): void {
    room.videoState = {
      playing: false,
      currentTime: 0,
      playbackRate: 1,
      updatedAt: Date.now(),
    };

    this.io.to(room.id).emit(S2C.SYNC_MEDIA_CHANGED, {
      currentItem: room.currentItem,
      currentIndex: room.currentIndex,
    });
  }
}
