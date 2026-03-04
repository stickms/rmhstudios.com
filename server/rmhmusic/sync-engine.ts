import type { Server, Socket } from 'socket.io';
import { config } from './config';
import { validated } from './schemas';
import { C2S, S2C } from '../../lib/rmhmusic/events';
import { MusicPlaySchema, MusicPauseSchema, MusicSeekSchema } from '../../lib/rmhmusic/schemas';
import type { RoomManager } from './room-manager';

export class SyncEngine {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {}

  handleConnection(socket: Socket): void {
    socket.on(C2S.MUSIC_PLAY, validated(socket, C2S.MUSIC_PLAY, MusicPlaySchema, (s, p) => this.onPlay(s, p)));
    socket.on(C2S.MUSIC_PAUSE, validated(socket, C2S.MUSIC_PAUSE, MusicPauseSchema, (s, p) => this.onPause(s, p)));
    socket.on(C2S.MUSIC_SEEK, validated(socket, C2S.MUSIC_SEEK, MusicSeekSchema, (s, p) => this.onSeek(s, p)));
    socket.on(C2S.MUSIC_SKIP, () => this.onSkip(socket));
  }

  private onPlay(socket: Socket, payload: any) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    const userId = this.roomManager.getUserIdForSocket(socket.id);
    if (!room || room.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can control playback' });
      return;
    }

    room.currentTrack = payload.track;
    room.playback = {
      trackUri: payload.trackUri,
      positionMs: payload.positionMs,
      isPlaying: true,
      updatedAt: Date.now(),
    };

    this.io.to(room.id).emit(S2C.MUSIC_PLAY, {
      trackUri: payload.trackUri,
      positionMs: payload.positionMs,
      track: payload.track,
    });

    this.roomManager.broadcastAction(room, 'NOW_PLAYING', { track: payload.track });
  }

  private onPause(socket: Socket, payload: { positionMs: number }) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    const userId = this.roomManager.getUserIdForSocket(socket.id);
    if (!room || room.hostUserId !== userId) return;

    room.playback.isPlaying = false;
    room.playback.positionMs = payload.positionMs;
    room.playback.updatedAt = Date.now();

    this.io.to(room.id).emit(S2C.MUSIC_PAUSE, { positionMs: payload.positionMs });
  }

  private onSeek(socket: Socket, payload: { positionMs: number }) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    const userId = this.roomManager.getUserIdForSocket(socket.id);
    if (!room || room.hostUserId !== userId) return;

    room.playback.positionMs = payload.positionMs;
    room.playback.updatedAt = Date.now();

    this.io.to(room.id).emit(S2C.MUSIC_SEEK, { positionMs: payload.positionMs });
  }

  private onSkip(socket: Socket) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    const userId = this.roomManager.getUserIdForSocket(socket.id);
    if (!room || room.hostUserId !== userId) return;

    if (room.queue.length === 0) {
      room.currentTrack = null;
      room.playback = { trackUri: null, positionMs: 0, isPlaying: false, updatedAt: Date.now() };
      this.io.to(room.id).emit(S2C.MUSIC_TRACK_CHANGED, { track: null });
      return;
    }

    const next = room.queue.shift()!;
    room.queue.forEach((item, i) => { item.position = i; });

    const track = {
      spotifyUri: next.spotifyUri,
      title: next.title,
      artist: next.artist,
      albumArt: next.albumArt,
      durationMs: next.durationMs,
    };

    room.currentTrack = track;
    room.playback = {
      trackUri: next.spotifyUri,
      positionMs: 0,
      isPlaying: true,
      updatedAt: Date.now(),
    };

    this.io.to(room.id).emit(S2C.MUSIC_PLAY, { trackUri: next.spotifyUri, positionMs: 0, track });
    this.io.to(room.id).emit(S2C.QUEUE_UPDATED, { queue: room.queue });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const room of this.roomManager.rooms.values()) {
        if (room.playback.isPlaying) {
          this.io.to(room.id).emit(S2C.SYNC_HEARTBEAT, {
            trackUri: room.playback.trackUri,
            positionMs: room.playback.positionMs + (Date.now() - room.playback.updatedAt),
            isPlaying: room.playback.isPlaying,
          });
        }
      }
    }, config.syncHeartbeatMs);
  }

  stop() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }
}
