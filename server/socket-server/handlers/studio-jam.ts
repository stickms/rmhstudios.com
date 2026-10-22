/**
 * Studio live jam (F13): 2–4 members edit one project over the socket tier.
 *
 * The server holds the authoritative copy of the project in memory (that is
 * what a late joiner receives). Edits are whole-track replacements: a member
 * must hold the lock on a track to change it (one editor per track), and
 * within a track the last write wins. Locks drop when their holder leaves or
 * disconnects. The host saves the snapshot to their own project library.
 */
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import {
  JAM_C2S,
  JAM_MAX_MEMBERS,
  JAM_MAX_PATTERNS,
  JAM_MAX_PROJECT_CHARS,
  JAM_MAX_TRACKS,
  JAM_MAX_TRACK_CHARS,
  JAM_S2C,
  jamCodeSchema,
  jamCreateSchema,
  jamMetaSchema,
  jamPatternSchema,
  jamTrackIdSchema,
  jamTrackSchema,
  type JamJoinAck,
  type JamLocks,
  type JamOp,
  type JamPeer,
  type JamProject,
} from '../../../lib/studio/jam/shared';
import { ROOM_CODE_ALPHABET } from '../../../lib/rmhmusic/constants';

interface JamRoom {
  code: string;
  hostUserId: string;
  project: JamProject;
  members: Map<string, { name: string; socketId: string }>;
  locks: Map<string, string>;
}

const rooms = new Map<string, JamRoom>();
const socketRoom = new Map<string, string>(); // socket.id → code

function makeCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++)
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

const roomName = (code: string) => `studio-jam:${code}`;
const peersOf = (r: JamRoom): JamPeer[] =>
  [...r.members].map(([userId, m]) => ({ userId, name: m.name, isHost: userId === r.hostUserId }));
const locksOf = (r: JamRoom): JamLocks => Object.fromEntries(r.locks);
const tooBig = (v: unknown, max: number) => JSON.stringify(v).length > max;

function leave(io: Server, socket: Socket) {
  const code = socketRoom.get(socket.id);
  if (!code) return;
  socketRoom.delete(socket.id);
  socket.leave(roomName(code));
  const room = rooms.get(code);
  const userId = socket.data.userId as string | undefined;
  if (!room || !userId) return;
  // A reconnecting member may already be on a newer socket.
  if (room.members.get(userId)?.socketId !== socket.id) return;
  room.members.delete(userId);
  for (const [trackId, holder] of room.locks) if (holder === userId) room.locks.delete(trackId);
  if (room.members.size === 0) {
    rooms.delete(code);
    return;
  }
  if (room.hostUserId === userId) {
    // Host left: the jam ends rather than silently handing over the save role.
    io.to(roomName(code)).emit(JAM_S2C.CLOSED, { reason: 'host-left' });
    for (const m of room.members.values())
      io.sockets.sockets.get(m.socketId)?.leave(roomName(code));
    for (const m of room.members.values()) socketRoom.delete(m.socketId);
    rooms.delete(code);
    return;
  }
  io.to(roomName(code)).emit(JAM_S2C.PEERS, peersOf(room));
  io.to(roomName(code)).emit(JAM_S2C.LOCKS, locksOf(room));
}

export function registerStudioJamHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string | undefined;
  if (!userId) return; // members only

  /** Wrap a handler: rate limit, validate, and resolve the sender's room. */
  const on = <T>(
    event: string,
    schema: z.ZodType<T>,
    fn: (room: JamRoom | null, payload: T, ack: (r: unknown) => void) => void,
    needsRoom = true,
  ) => {
    socket.on(event, (raw: unknown, ackFn?: unknown) => {
      const ack = typeof ackFn === 'function' ? (ackFn as (r: unknown) => void) : () => {};
      if (!checkRateLimit(socket.id, event)) return ack({ ok: false, error: 'Slow down' });
      const parsed = schema.safeParse(raw ?? {});
      if (!parsed.success) return ack({ ok: false, error: 'Invalid payload' });
      const code = socketRoom.get(socket.id);
      const room = code ? (rooms.get(code) ?? null) : null;
      if (needsRoom && !room) return ack({ ok: false, error: 'Not in a jam' });
      try {
        fn(room, parsed.data, ack);
      } catch (err) {
        logger.error({ event: 'studio_jam_error', jamEvent: event, error: String(err) });
        ack({ ok: false, error: 'Internal error' });
      }
    });
  };

  const broadcastOp = (room: JamRoom, op: JamOp) =>
    socket.to(roomName(room.code)).emit(JAM_S2C.OP, op);
  const holds = (room: JamRoom, trackId: string) => room.locks.get(trackId) === userId;
  const name = () => (socket.data.userName as string) || 'Member';

  on(
    JAM_C2S.CREATE,
    jamCreateSchema,
    (_r, { project }, ack) => {
      if (socketRoom.has(socket.id)) return ack({ ok: false, error: 'Already in a jam' });
      if (tooBig(project, JAM_MAX_PROJECT_CHARS))
        return ack({ ok: false, error: 'Project is too large to share' });
      const code = makeCode();
      const room: JamRoom = {
        code,
        hostUserId: userId,
        project,
        members: new Map([[userId, { name: name(), socketId: socket.id }]]),
        locks: new Map(),
      };
      rooms.set(code, room);
      socketRoom.set(socket.id, code);
      socket.join(roomName(code));
      const reply: JamJoinAck = {
        ok: true,
        code,
        hostUserId: userId,
        project,
        peers: peersOf(room),
        locks: {},
      };
      ack(reply);
    },
    false,
  );

  on(
    JAM_C2S.JOIN,
    jamCodeSchema,
    (_r, { code }, ack) => {
      if (socketRoom.has(socket.id)) return ack({ ok: false, error: 'Already in a jam' });
      const room = rooms.get(code.toUpperCase());
      if (!room) return ack({ ok: false, error: 'No jam with that code' });
      if (!room.members.has(userId) && room.members.size >= JAM_MAX_MEMBERS) {
        return ack({ ok: false, error: 'This jam is full' });
      }
      room.members.set(userId, { name: name(), socketId: socket.id });
      socketRoom.set(socket.id, room.code);
      socket.join(roomName(room.code));
      io.to(roomName(room.code)).emit(JAM_S2C.PEERS, peersOf(room));
      const reply: JamJoinAck = {
        ok: true,
        code: room.code,
        hostUserId: room.hostUserId,
        project: room.project,
        peers: peersOf(room),
        locks: locksOf(room),
      };
      ack(reply);
    },
    false,
  );

  socket.on(JAM_C2S.LEAVE, () => leave(io, socket));
  socket.on('disconnect', () => leave(io, socket));

  on(JAM_C2S.LOCK, jamTrackIdSchema, (room, { trackId }, ack) => {
    const holder = room!.locks.get(trackId);
    if (holder && holder !== userId) {
      return ack({
        ok: false,
        error: 'Locked',
        holder: room!.members.get(holder)?.name ?? 'Someone',
      });
    }
    if (!room!.project.tracks.some((t) => t.track.id === trackId))
      return ack({ ok: false, error: 'No such track' });
    room!.locks.set(trackId, userId);
    io.to(roomName(room!.code)).emit(JAM_S2C.LOCKS, locksOf(room!));
    ack({ ok: true });
  });

  on(JAM_C2S.UNLOCK, jamTrackIdSchema, (room, { trackId }, ack) => {
    if (holds(room!, trackId)) {
      room!.locks.delete(trackId);
      io.to(roomName(room!.code)).emit(JAM_S2C.LOCKS, locksOf(room!));
    }
    ack({ ok: true });
  });

  on(JAM_C2S.TRACK_SET, jamTrackSchema, (room, data, ack) => {
    if (tooBig(data, JAM_MAX_TRACK_CHARS)) return ack({ ok: false, error: 'Track is too large' });
    if (data.clips.some((c) => c.trackId !== data.track.id))
      return ack({ ok: false, error: 'Invalid clips' });
    const tracks = room!.project.tracks;
    const idx = tracks.findIndex((t) => t.track.id === data.track.id);
    if (idx === -1) {
      // A new track: the creator takes its lock.
      if (tracks.length >= JAM_MAX_TRACKS) return ack({ ok: false, error: 'Track limit reached' });
      tracks.push(data);
      room!.locks.set(data.track.id, userId);
      io.to(roomName(room!.code)).emit(JAM_S2C.LOCKS, locksOf(room!));
    } else {
      if (!holds(room!, data.track.id)) return ack({ ok: false, error: 'Locked' });
      tracks[idx] = data; // last writer wins within a track
    }
    broadcastOp(room!, { type: 'track_set', by: userId, track: data.track, clips: data.clips });
    ack({ ok: true });
  });

  on(JAM_C2S.TRACK_REMOVE, jamTrackIdSchema, (room, { trackId }, ack) => {
    if (!holds(room!, trackId)) return ack({ ok: false, error: 'Locked' });
    room!.project.tracks = room!.project.tracks.filter((t) => t.track.id !== trackId);
    room!.locks.delete(trackId);
    io.to(roomName(room!.code)).emit(JAM_S2C.LOCKS, locksOf(room!));
    broadcastOp(room!, { type: 'track_remove', by: userId, trackId });
    ack({ ok: true });
  });

  on(JAM_C2S.PATTERN_SET, jamPatternSchema, (room, { pattern }, ack) => {
    if (tooBig(pattern, JAM_MAX_TRACK_CHARS))
      return ack({ ok: false, error: 'Pattern is too large' });
    const list = room!.project.patterns;
    const idx = list.findIndex((p) => p.id === pattern.id);
    if (idx === -1) {
      if (list.length >= JAM_MAX_PATTERNS)
        return ack({ ok: false, error: 'Pattern limit reached' });
      list.push(pattern);
    } else {
      list[idx] = pattern;
    }
    broadcastOp(room!, { type: 'pattern_set', by: userId, pattern });
    ack({ ok: true });
  });

  on(JAM_C2S.META, jamMetaSchema, (room, meta, ack) => {
    if (room!.hostUserId !== userId)
      return ack({ ok: false, error: 'Only the host sets tempo and name' });
    Object.assign(room!.project, meta);
    broadcastOp(room!, { type: 'meta', by: userId, meta });
    ack({ ok: true });
  });
}
