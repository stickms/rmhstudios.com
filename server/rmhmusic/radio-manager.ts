import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { C2S, S2C } from '../../lib/rmhmusic/events';
import { RadioQueueSchema, RadioVoteSchema } from '../../lib/rmhmusic/schemas';
import { RADIO_MAX_DJS, RADIO_TURN_MAX_MS } from '../../lib/rmhmusic/constants';
import type { RadioView, TrackInfo } from '../../lib/rmhmusic/types';
import { validated } from './schemas';
import type { RoomManager } from './room-manager';
import type { ServerRoom } from './types';

/** Minimum gap between a socket's radio events; DJ/queue/vote churn is cheap but not free. */
const MIN_EVENT_GAP_MS = 400;

interface NowPlaying {
  id: string;
  djUserId: string;
  djName: string;
  track: TrackInfo;
  startedAt: number;
}

/**
 * Community radio (T4): one always-on room whose playback the server drives.
 * Members join a DJ rotation and queue one track per turn; the rotation
 * advances when a track ends or a majority of listeners vote "meh".
 */
export class RadioManager {
  private room: ServerRoom;
  private djs: string[] = [];
  private pending = new Map<string, TrackInfo>();
  private current: NowPlaying | null = null;
  private woots = new Set<string>();
  private mehs = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastEvent = new Map<string, number>();

  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {
    this.room = roomManager.createRadioRoom();
    roomManager.onMemberJoined = (room, socket) => {
      if (room !== this.room) return;
      socket.emit(S2C.RADIO_STATE, this.view());
      if (this.current) {
        const positionMs = Math.min(Date.now() - this.current.startedAt, RADIO_TURN_MAX_MS);
        socket.emit(S2C.MUSIC_PLAY, {
          trackUri: this.current.track.spotifyUri,
          positionMs,
          track: this.current.track,
        });
      } else {
        socket.emit(S2C.MUSIC_TRACK_CHANGED, { track: null });
      }
      this.broadcast();
    };
    // Listener counts also move on disconnects, which fire no hook: refresh while anyone is tuned in.
    setInterval(() => {
      if (this.room.members.size > 0) this.broadcast();
    }, 15_000).unref();
    roomManager.onMemberRemoved = (room, userId) => {
      if (room !== this.room) return;
      this.djs = this.djs.filter((id) => id !== userId);
      this.pending.delete(userId);
      this.woots.delete(userId);
      this.mehs.delete(userId);
      this.broadcast();
    };
  }

  handleConnection(socket: Socket): void {
    const guard =
      <T>(fn: (userId: string, payload: T) => void) =>
      (_s: Socket, payload: T) => {
        const userId = this.roomManager.getUserIdForSocket(socket.id);
        if (!userId || this.roomManager.getRoomForSocket(socket.id) !== this.room) return;
        const now = Date.now();
        if (now - (this.lastEvent.get(socket.id) ?? 0) < MIN_EVENT_GAP_MS) return;
        this.lastEvent.set(socket.id, now);
        fn(userId, payload);
      };
    socket.on(C2S.RADIO_DJ_JOIN, () => guard<void>((u) => this.djJoin(u))(socket, undefined));
    socket.on(C2S.RADIO_DJ_LEAVE, () => guard<void>((u) => this.djLeave(u))(socket, undefined));
    socket.on(
      C2S.RADIO_QUEUE,
      validated(
        socket,
        C2S.RADIO_QUEUE,
        RadioQueueSchema,
        guard((u, p: TrackInfo) => this.queue(u, p)),
      ),
    );
    socket.on(
      C2S.RADIO_VOTE,
      validated(
        socket,
        C2S.RADIO_VOTE,
        RadioVoteSchema,
        guard((u, p: { vote: 'woot' | 'meh' }) => this.vote(u, p.vote)),
      ),
    );
    socket.on('disconnect', () => this.lastEvent.delete(socket.id));
  }

  private djJoin(userId: string) {
    if (this.djs.includes(userId)) return;
    if (this.djs.length >= RADIO_MAX_DJS) {
      this.io.to(this.room.members.get(userId)?.socketId ?? '').emit(S2C.ERROR, {
        code: 'ROOM_FULL',
        message: 'The DJ rotation is full',
      });
      return;
    }
    this.djs.push(userId);
    this.broadcast();
  }

  private djLeave(userId: string) {
    this.djs = this.djs.filter((id) => id !== userId);
    this.pending.delete(userId);
    this.broadcast();
  }

  private queue(userId: string, track: TrackInfo) {
    if (!this.djs.includes(userId)) return;
    // One track per turn: a new pick replaces the one waiting.
    this.pending.set(userId, {
      spotifyUri: track.spotifyUri,
      title: track.title,
      artist: track.artist,
      albumArt: track.albumArt,
      durationMs: track.durationMs,
      previewUrl: track.previewUrl,
    });
    if (!this.current) this.advance();
    else this.broadcast();
  }

  private vote(userId: string, vote: 'woot' | 'meh') {
    if (!this.current || this.current.djUserId === userId) return;
    this.woots.delete(userId);
    this.mehs.delete(userId);
    (vote === 'woot' ? this.woots : this.mehs).add(userId);
    // Meh majority of the other connected listeners skips the track.
    let voters = 0;
    for (const m of this.room.members.values()) {
      if (m.isConnected && m.userId !== this.current.djUserId) voters++;
    }
    if (this.mehs.size * 2 > voters) {
      this.advance();
      return;
    }
    this.broadcast();
  }

  /** Start the next DJ's queued track, or go quiet when nobody has one. */
  private advance() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.woots.clear();
    this.mehs.clear();

    let next: { userId: string; track: TrackInfo } | null = null;
    for (let i = 0; i < this.djs.length && !next; i++) {
      const userId = this.djs.shift()!;
      this.djs.push(userId); // taken or not, the DJ moves to the back
      const track = this.pending.get(userId);
      const member = this.room.members.get(userId);
      if (track && member?.isConnected) next = { userId, track };
    }

    const now = Date.now();
    if (!next) {
      this.current = null;
      this.room.currentTrack = null;
      this.room.playback = { trackUri: null, positionMs: 0, isPlaying: false, updatedAt: now };
      this.io.to(this.room.id).emit(S2C.MUSIC_TRACK_CHANGED, { track: null });
      this.broadcast();
      return;
    }

    this.pending.delete(next.userId);
    this.current = {
      id: nanoid(8),
      djUserId: next.userId,
      djName: this.room.members.get(next.userId)?.userName ?? 'DJ',
      track: next.track,
      startedAt: now,
    };
    this.room.currentTrack = next.track;
    this.room.playback = {
      trackUri: next.track.spotifyUri,
      positionMs: 0,
      isPlaying: true,
      updatedAt: now,
    };
    this.io.to(this.room.id).emit(S2C.MUSIC_PLAY, {
      trackUri: next.track.spotifyUri,
      positionMs: 0,
      track: next.track,
    });
    this.roomManager.broadcastAction(this.room, 'NOW_PLAYING', { track: next.track });
    this.timer = setTimeout(
      () => this.advance(),
      Math.min(next.track.durationMs || RADIO_TURN_MAX_MS, RADIO_TURN_MAX_MS) + 1000,
    );
    this.broadcast();
  }

  private view(): RadioView {
    let listeners = 0;
    for (const m of this.room.members.values()) if (m.isConnected) listeners++;
    return {
      listeners,
      djs: this.djs.map((userId) => ({
        userId,
        userName: this.room.members.get(userId)?.userName ?? 'DJ',
        queued: this.pending.has(userId),
      })),
      current: this.current,
      woots: this.woots.size,
      mehs: this.mehs.size,
    };
  }

  private broadcast() {
    this.io.to(this.room.id).emit(S2C.RADIO_STATE, this.view());
  }
}
