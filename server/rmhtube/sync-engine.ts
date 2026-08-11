/**
 * RmhTube — the room timeline, server side.
 *
 * The leader's player is the source of truth; this holds the room's canonical
 * anchor, projects it forward between the leader's reports so the room does not
 * freeze when the leader's tab is throttled, and broadcasts it.
 *
 * Three things here are what the room's sync actually depends on:
 *
 * **The anchor is stamped by the leader, not by us.** The leader sends the
 * server-clock instant at which it read its own playhead (it knows the offset
 * from the ping/pong handshake). Anchoring on the arrival time instead folded
 * one-way network latency into every anchor the room was built on, and did it
 * again on the next report, and the next.
 *
 * **A stalled leader stops the clock.** `playing` stays true while a player
 * buffers, so projecting unconditionally ran the room ahead of the person it
 * was following; the leader's next report then yanked everyone back. The
 * oscillation looked exactly like everyone else's connection being bad. When
 * the leader reports `stalled`, the timeline holds.
 *
 * **A live source has no timeline.** A broadcast's position is a sliding
 * window that means something different on each viewer's machine, so live rooms
 * mirror play/pause and never project or seek a position.
 *
 * On top of that the room can *wait* for a member who is buffering
 * (`waitForSlowPeers`) instead of leaving them to be seek-chased for the rest
 * of the video, which is what "it constantly buffers for everyone else" was.
 */

import type { Server, Socket } from 'socket.io';
import { config } from './config';
import { logger } from './logger';
import { validated } from './schemas';
import { C2S, S2C } from '../../lib/rmhtube/events';
import {
  HostStateSchema,
  SeekSchema,
  SetSpeedSchema,
  PingSchema,
  StallSchema,
} from '../../lib/rmhtube/schemas';
import { extrapolate, reanchor, initialVideoState } from '../../lib/rmhtube/sync-math';
import { PEER_WAIT_MAX_MS, PEER_WAIT_COOLDOWN_MS } from '../../lib/rmhtube/constants';
import type { VideoState } from '../../lib/rmhtube/types';
import type { RoomManager } from './room-manager';
import type { RmhTubeRoom } from './types';
import { z } from 'zod';

const EmptySchema = z.object({}).optional();

/**
 * How far the leader's own timestamp may sit from ours before we distrust it.
 * The handshake normally lands the two within tens of milliseconds; a gap this
 * wide means a broken clock or a forged payload, and a bad anchor moves every
 * viewer in the room.
 */
const ANCHOR_SKEW_TOLERANCE_MS = 5_000;

export class SyncEngine {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {}

  // ─── Wiring ──────────────────────────────────────────────────

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
    socket.on(
      C2S.SYNC_PING,
      validated(socket, C2S.SYNC_PING, PingSchema, (s, p) => this.onPing(s, p)),
    );
    socket.on(
      C2S.SYNC_REQUEST,
      validated(socket, C2S.SYNC_REQUEST, EmptySchema, (s) => this.onSyncRequest(s)),
    );
    socket.on(
      C2S.SYNC_STALL,
      validated(socket, C2S.SYNC_STALL, StallSchema, (s, p) => this.onStall(s, p)),
    );
  }

  /** The leader for this socket's room, or null when it is not the leader. */
  private leaderRoom(socket: Socket): RmhTubeRoom | null {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room || room.leaderUserId !== userId) return null;
    return room;
  }

  // ─── Clock sync ──────────────────────────────────────────────

  /** Reply immediately so the client can measure RTT and its clock offset. */
  private onPing(socket: Socket, payload: { clientTime: number }): void {
    socket.emit(S2C.SYNC_PONG, { clientTime: payload.clientTime, serverTime: Date.now() });
  }

  /** On-demand resync — the current anchor, to one socket only. */
  private onSyncRequest(socket: Socket): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room || !room.currentItem) return;
    socket.emit(S2C.SYNC_STATE, reanchor(room.videoState, Date.now()));
  }

  // ─── Leader state reports ────────────────────────────────────

  /**
   * The leader's periodic report. This is a *correction*, not the only thing
   * that moves the room — the heartbeat projects between reports.
   */
  private onHostState(
    socket: Socket,
    payload: {
      playing: boolean;
      currentTime: number;
      playbackRate: number;
      timestamp: number;
      stalled: boolean;
      live: boolean;
    },
  ): void {
    const room = this.leaderRoom(socket);
    if (!room) return;

    const now = Date.now();
    // Trust the leader's stamp inside a sane window, fall back to ours outside
    // it. A wrong anchor time moves every viewer, so a clock we cannot believe
    // is worse than the latency we are trying to remove.
    const skew = Math.abs(now - payload.timestamp);
    const anchoredAt = skew <= ANCHOR_SKEW_TOLERANCE_MS ? payload.timestamp : now;

    const previous = room.videoState;
    const mode = payload.live ? 'live' : 'vod';

    // `rev` marks a DELIBERATE change to the room, not merely a fresher
    // measurement of it — a routine report re-anchors the same intent, so it
    // leaves `rev` alone and lets `updatedAt` order it. The leader's client
    // relies on exactly that distinction: a changed `rev` means "somebody moved
    // the room, follow it", and bumping it twice a second would have had the
    // leader's own report echo back and undo whatever it had just done.
    const changed =
      previous.playing !== payload.playing ||
      previous.mode !== mode ||
      previous.stalled !== payload.stalled ||
      Math.abs(previous.playbackRate - payload.playbackRate) > 0.01;

    room.videoState = {
      mode,
      playing: payload.playing,
      currentTime: payload.currentTime,
      playbackRate: payload.playbackRate,
      updatedAt: anchoredAt,
      stalled: payload.stalled,
      rev: changed ? previous.rev + 1 : previous.rev,
    };

    // A stalled leader is a room-wide event: viewers must stop projecting past
    // it, and the heartbeat alone is up to two seconds away.
    if (changed) this.broadcastState(room, now);
  }

  // ─── Leader edges ────────────────────────────────────────────

  private onPlay(socket: Socket): void {
    const room = this.leaderRoom(socket);
    if (!room) return;
    const now = Date.now();
    // Resume from the effective position, so a pause of any length does not
    // move the playhead.
    this.setState(room, {
      currentTime: extrapolate(room.videoState, now),
      playing: true,
      stalled: false,
    }, now);
    room.lastActivityAt = now;

    // An explicit play outranks a wait. Whoever we were holding for has to
    // re-report before the room pauses for them again — otherwise a stale
    // stall would re-pause the room within a tick of the leader pressing play,
    // and the button would look broken.
    if (room.peerWait.startedAt !== null) {
      this.endPeerWait(room, 'leader_played', now);
    } else if (room.peerWait.stalled.size > 0) {
      room.peerWait.stalled.clear();
      this.broadcastPeersWaiting(room);
    }
  }

  private onPause(socket: Socket): void {
    const room = this.leaderRoom(socket);
    if (!room) return;
    const now = Date.now();
    this.setState(room, {
      currentTime: extrapolate(room.videoState, now),
      playing: false,
    }, now);
    room.lastActivityAt = now;
    // A deliberate pause by the leader supersedes any wait the room was in.
    if (room.peerWait.startedAt !== null) this.endPeerWait(room, 'leader_paused', now);
  }

  private onSeek(socket: Socket, payload: { time: number }): void {
    const room = this.leaderRoom(socket);
    if (!room) return;
    // There is nothing to seek to on a live source, and broadcasting one would
    // scatter every viewer across their own DVR window.
    if (room.videoState.mode === 'live') return;
    const now = Date.now();
    this.setState(room, { currentTime: payload.time, stalled: false }, now);
    room.lastActivityAt = now;
  }

  private onSetSpeed(socket: Socket, payload: { speed: number }): void {
    const room = this.leaderRoom(socket);
    if (!room) return;
    const now = Date.now();
    // Re-anchor first so the position stays continuous across the rate change.
    this.setState(room, {
      currentTime: extrapolate(room.videoState, now),
      playbackRate: payload.speed,
    }, now);
    room.lastActivityAt = now;
  }

  // ─── Wait for slow peers ─────────────────────────────────────

  /**
   * A member reporting that it is (or is no longer) starved of data.
   *
   * Without this a viewer whose connection cannot keep up is simply left
   * behind: they fall past the drift threshold, get seeked forward, which drops
   * whatever they had buffered, which stalls them again, one seek deeper. The
   * room pausing for a few seconds is the only thing that actually lets them
   * catch up.
   */
  private onStall(socket: Socket, payload: { stalled: boolean }): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room || !room.members.has(userId)) return;

    const wait = room.peerWait;
    if (payload.stalled) {
      if (!wait.stalled.has(userId)) wait.stalled.set(userId, Date.now());
    } else {
      wait.stalled.delete(userId);
    }

    this.evaluatePeerWait(room, Date.now());
  }

  /**
   * Pause for buffering members, or resume once they are back — the room's half
   * of the wait. Runs on every stall report, on resume, and on the heartbeat,
   * because the timeout that ends a wait has no inbound event of its own.
   */
  private evaluatePeerWait(room: RmhTubeRoom, now: number): void {
    const wait = room.peerWait;

    if (!room.settings.waitForSlowPeers || !room.currentItem) {
      if (wait.startedAt !== null) this.endPeerWait(room, 'disabled', now);
      return;
    }

    // Members who left or dropped cannot be waited for.
    for (const userId of [...wait.stalled.keys()]) {
      const member = room.members.get(userId);
      if (!member || !member.isConnected) wait.stalled.delete(userId);
    }

    const anyStalled = wait.stalled.size > 0;

    if (wait.startedAt === null) {
      // Not waiting. Start only if somebody is stalled, the room is actually
      // moving, and we are not inside the post-timeout cooldown.
      if (anyStalled && room.videoState.playing && now >= wait.cooldownUntil) {
        wait.startedAt = now;
        wait.resumeAfter = true;
        this.setState(room, { currentTime: extrapolate(room.videoState, now), playing: false }, now);
        logger.info({ event: 'peer_wait_started', roomId: room.id, peers: wait.stalled.size });
      }
      this.broadcastPeersWaiting(room);
      return;
    }

    if (!anyStalled) {
      this.endPeerWait(room, 'recovered', now);
      return;
    }

    if (now - wait.startedAt >= PEER_WAIT_MAX_MS) {
      // One connection that never recovers must not hold a watch party for the
      // rest of the evening.
      wait.cooldownUntil = now + PEER_WAIT_COOLDOWN_MS;
      this.endPeerWait(room, 'timeout', now);
      return;
    }

    this.broadcastPeersWaiting(room);
  }

  private endPeerWait(room: RmhTubeRoom, reason: string, now: number): void {
    const wait = room.peerWait;
    // A leader who pressed pause during a wait means it: do not resume behind
    // them when the wait clears.
    const resume = wait.resumeAfter && reason !== 'leader_paused' && !room.videoState.playing;

    wait.startedAt = null;
    wait.resumeAfter = false;
    wait.stalled.clear();

    if (resume) {
      this.setState(room, { currentTime: extrapolate(room.videoState, now), playing: true }, now);
    }
    this.broadcastPeersWaiting(room);
    logger.info({ event: 'peer_wait_ended', roomId: room.id, reason, resumed: resume });
  }

  /** Broadcast the waited-for peers, but only when the set actually changed. */
  private broadcastPeersWaiting(room: RmhTubeRoom): void {
    const wait = room.peerWait;
    const peers = [...wait.stalled.keys()]
      .map((userId) => room.members.get(userId))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({ userId: m.userId, userName: m.userName }));

    const signature = peers.map((p) => p.userId).sort().join(',');
    if (signature === wait.signature) return;
    wait.signature = signature;

    this.io.to(room.id).emit(
      S2C.PEERS_WAITING,
      peers.length ? { peers, since: wait.startedAt ?? Date.now() } : null,
    );
  }

  // ─── State mutation + broadcast ──────────────────────────────

  /**
   * Write a new anchor and broadcast it. Every timeline change goes through
   * here so `rev` advances exactly once per change and nothing can broadcast a
   * state it did not stamp.
   */
  private setState(room: RmhTubeRoom, patch: Partial<VideoState>, now: number): VideoState {
    room.videoState = {
      ...room.videoState,
      ...patch,
      updatedAt: now,
      rev: room.videoState.rev + 1,
    };
    this.broadcastState(room, now);
    return room.videoState;
  }

  private broadcastState(room: RmhTubeRoom, now: number): void {
    this.io.to(room.id).emit(S2C.SYNC_STATE, reanchor(room.videoState, now));
  }

  // ─── Heartbeat ───────────────────────────────────────────────

  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const room of this.roomManager.rooms.values()) {
        if (!room.currentItem) continue;

        // A wait can end on a timeout, which has no inbound event to trigger it.
        if (room.peerWait.startedAt !== null) this.evaluatePeerWait(room, now);

        if (room.members.size <= 1) continue;

        // The *effective* state: the timeline keeps advancing even when the
        // leader's tab is throttled and its reports have stopped arriving.
        this.io.to(room.id).emit(S2C.SYNC_STATE, reanchor(room.videoState, now));
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

  /**
   * Switch the room between position sync and live mirroring.
   *
   * Called when the leader's player reports that the item it loaded is (or is
   * not) a broadcast — which is the only place that can be known, since
   * `/watch?v=…` is equally how YouTube addresses a live stream.
   */
  setMode(room: RmhTubeRoom, mode: VideoState['mode']): void {
    if (room.videoState.mode === mode) return;
    const now = Date.now();
    this.setState(room, { mode, currentTime: mode === 'live' ? 0 : room.videoState.currentTime }, now);
    // Nothing to wait for on a live source: it has no position to catch up to.
    if (mode === 'live' && room.peerWait.startedAt !== null) {
      this.endPeerWait(room, 'live', now);
    }
    logger.info({ event: 'sync_mode_changed', roomId: room.id, mode });
  }

  // ─── Media change ────────────────────────────────────────────

  /**
   * The playing item changed. Returns the fresh anchor so the caller can put it
   * in the same `NOW_PLAYING` action that announces the item — one message, so
   * a client can never hold a new item against the old item's timeline.
   */
  onMediaChanged(room: RmhTubeRoom): VideoState {
    const now = Date.now();
    room.videoState = {
      ...initialVideoState(now, room.currentItem?.live ? 'live' : 'vod'),
      rev: room.videoState.rev + 1,
    };
    // A new item invalidates whoever was buffering the old one — including the
    // cooldown, since the next source may be perfectly playable for them.
    room.peerWait.stalled.clear();
    room.peerWait.startedAt = null;
    room.peerWait.resumeAfter = false;
    room.peerWait.cooldownUntil = 0;
    this.broadcastPeersWaiting(room);
    return room.videoState;
  }
}
