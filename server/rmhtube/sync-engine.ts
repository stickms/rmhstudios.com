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
import { HostStateSchema, SeekSchema, SetSpeedSchema, PingSchema } from '../../lib/rmhtube/schemas';
import { extrapolate, reanchor } from '../../lib/rmhtube/sync-math';
import type { VideoState } from '../../lib/rmhtube/types';
import type { RoomManager } from './room-manager';
import type { RmhTubeRoom } from './types';
import { z } from 'zod';

const EmptySchema = z.object({}).optional();

/** Reanchored video state + serverTime, ready to broadcast. */
function syncStatePayload(vs: VideoState, now: number): VideoState & { serverTime: number } {
  return { ...reanchor(vs, now), serverTime: now };
}

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
    // ─── Robustness: clock sync + on-demand resync ───
    socket.on(
      C2S.SYNC_PING,
      validated(socket, C2S.SYNC_PING, PingSchema, (s, p) => this.onPing(s, p)),
    );
    socket.on(
      C2S.SYNC_REQUEST,
      validated(socket, C2S.SYNC_REQUEST, EmptySchema, (s) => this.onSyncRequest(s)),
    );
  }

  // ─── Clock Sync (NTP-lite) ───────────────────────────────────

  /** Reply immediately so the client can measure RTT and clock offset. */
  private onPing(socket: Socket, payload: { clientTime: number }): void {
    socket.emit(S2C.SYNC_PONG, { clientTime: payload.clientTime, serverTime: Date.now() });
  }

  /** On-demand resync — send the current effective state to one socket only. */
  private onSyncRequest(socket: Socket): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room || !room.currentItem) return;
    socket.emit(S2C.SYNC_STATE, syncStatePayload(room.videoState, Date.now()));
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

    const now = Date.now();
    // Resume from the current effective position (no jump if it was paused).
    room.videoState.currentTime = extrapolate(room.videoState, now);
    room.videoState.playing = true;
    room.videoState.updatedAt = now;
    room.lastActivityAt = now;

    // Snappy edge event + authoritative anchor for everyone.
    socket.to(room.id).emit(S2C.SYNC_PLAY);
    this.broadcastState(room, now);
  }

  private onPause(socket: Socket): void {
    const userId = socket.data.userId as string;
    const result = this.checkLeader(userId);
    if (!result?.allowed) return;
    const { room } = result;

    const now = Date.now();
    // Capture the precise position at the pause edge.
    room.videoState.currentTime = extrapolate(room.videoState, now);
    room.videoState.playing = false;
    room.videoState.updatedAt = now;
    room.lastActivityAt = now;

    socket.to(room.id).emit(S2C.SYNC_PAUSE);
    this.broadcastState(room, now);
  }

  private onSeek(socket: Socket, payload: { time: number }): void {
    const userId = socket.data.userId as string;
    const result = this.checkLeader(userId);
    if (!result?.allowed) return;
    const { room } = result;

    const now = Date.now();
    room.videoState.currentTime = payload.time;
    room.videoState.updatedAt = now;
    room.lastActivityAt = now;

    socket.to(room.id).emit(S2C.SYNC_SEEK, { time: payload.time });
    this.broadcastState(room, now);
  }

  private onSetSpeed(socket: Socket, payload: { speed: number }): void {
    const userId = socket.data.userId as string;
    const result = this.checkLeader(userId);
    if (!result?.allowed) return;
    const { room } = result;

    const now = Date.now();
    // Keep position continuous across a rate change.
    room.videoState.currentTime = extrapolate(room.videoState, now);
    room.videoState.playbackRate = payload.speed;
    room.videoState.updatedAt = now;
    room.lastActivityAt = now;

    this.io.to(room.id).emit(S2C.SYNC_SPEED_CHANGED, { speed: payload.speed });
    this.broadcastState(room, now);
  }

  /** Broadcast a freshly reanchored state to the whole room. */
  private broadcastState(room: RmhTubeRoom, now: number): void {
    this.io.to(room.id).emit(S2C.SYNC_STATE, syncStatePayload(room.videoState, now));
  }

  // ─── Heartbeat ───────────────────────────────────────────────

  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const room of this.roomManager.rooms.values()) {
        if (!room.currentItem) continue;
        if (room.members.size <= 1) continue;

        // Broadcast the *effective* (server-extrapolated) state. This keeps the
        // room's timeline advancing even when the leader's tab is throttled or
        // frozen and its host-state reports have stalled.
        this.io.to(room.id).emit(S2C.SYNC_STATE, syncStatePayload(room.videoState, now));
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
