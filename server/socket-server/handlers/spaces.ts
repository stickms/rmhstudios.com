/**
 * Live Spaces (§4 Phase 1) — socket handler for the unified games hub.
 *
 * Mirrors the other room-based handlers (rmhstudy / rmhmusic): module-level
 * in-memory Maps for ephemeral live state (audience, pinned, status), keyed by
 * spaceId. The DB is the source of truth for lifecycle (host/status/recordChat)
 * and for the chat transcript when `recordChat` is set — chat is persisted
 * fire-and-forget (never blocks the broadcast, per server/CLAUDE.md §Gotchas 4).
 *
 * Auth: the hub soft-authenticates on handshake (socket.data.userId). Reading
 * broadcasts is allowed for anyone who joins the socket room; posting chat /
 * reactions and host controls require an authenticated userId.
 *
 * Event isolation is by the `space:*` prefix (no namespaces) — the same
 * convention every other handler uses. Add the rate-limit rules below to
 * `config.ts#SOCKET_RATE_LIMITS` (that map is also the inbound-event allowlist):
 *   space:join {max:20}  space:chat {max:30}  space:react {max:60}
 *   space:pin {max:20}   space:end {max:10}   (all windowMs 60_000)
 *
 * Registered per-connection from `index.ts`:
 *   registerSpacesHandlers(io, socket)   // ctx is optional/unused here
 *   handleSpacesDisconnect(io, socket)   // in the disconnect block
 */

import type { Server, Socket } from 'socket.io';
import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { config } from '../config';
import { sanitizeString } from '../utils';
import { SPACE_C2S, SPACE_S2C } from '../../lib/spaces/events';
import type { SpacePinned } from '../../lib/spaces/types';

// ─── Ephemeral in-memory state ──────────────────────────────────

interface SpaceMember {
  userId: string;
  name: string;
  image: string | null;
  socketId: string;
}

interface LiveSpace {
  id: string;
  hostId: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED';
  recordChat: boolean;
  pinned: SpacePinned | null;
  /** keyed by userId — audience members with a live socket */
  members: Map<string, SpaceMember>;
}

const spaces = new Map<string, LiveSpace>();
const socketToSpace = new Map<string, string>(); // socketId -> spaceId

function roomName(spaceId: string): string {
  return `space:${spaceId}`;
}

function isPinned(value: unknown): value is SpacePinned {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ref === 'string' &&
    v.ref.length > 0 &&
    v.ref.length <= 500 &&
    (v.kind === 'post' || v.kind === 'url' || v.kind === 'music_room' || v.kind === 'tube_room')
  );
}

function emitState(io: Server, space: LiveSpace): void {
  const audience = Array.from(space.members.values()).map((m) => ({
    userId: m.userId,
    name: m.name,
    image: m.image,
  }));
  io.to(roomName(space.id)).emit(SPACE_S2C.STATE, {
    spaceId: space.id,
    hostId: space.hostId,
    status: space.status,
    pinned: space.pinned,
    audience,
    audienceCount: audience.length,
  });
}

/**
 * Load the live-space record into memory on first touch (from the DB). Returns
 * null if the space doesn't exist or has already ended.
 */
async function ensureSpace(spaceId: string): Promise<LiveSpace | null> {
  const cached = spaces.get(spaceId);
  if (cached) return cached.status === 'ENDED' ? null : cached;

  const prisma = getPrismaClient();
  const row = await prisma.space
    .findUnique({
      where: { id: spaceId },
      select: { id: true, hostId: true, status: true, recordChat: true, pinned: true },
    })
    .catch((err: Error) => {
      logger.warn({ event: 'space_load_failed', spaceId, error: err.message });
      return null;
    });

  if (!row || row.status === 'ENDED') return null;

  const space: LiveSpace = {
    id: row.id,
    hostId: row.hostId,
    status: row.status as LiveSpace['status'],
    recordChat: row.recordChat,
    pinned: isPinned(row.pinned) ? (row.pinned as SpacePinned) : null,
    members: new Map(),
  };
  spaces.set(spaceId, space);
  return space;
}

function removeSocketFromSpace(io: Server, socketId: string): void {
  const spaceId = socketToSpace.get(socketId);
  if (!spaceId) return;
  socketToSpace.delete(socketId);

  const space = spaces.get(spaceId);
  if (!space) return;

  // Only drop the member if this socket is the one currently seated for them.
  for (const [userId, m] of space.members) {
    if (m.socketId === socketId) {
      space.members.delete(userId);
      break;
    }
  }

  if (space.members.size === 0 && space.status !== 'LIVE') {
    spaces.delete(spaceId);
    return;
  }
  emitState(io, space);
}

// ─── Registration ───────────────────────────────────────────────

export function registerSpacesHandlers(io: Server, socket: Socket, _ctx?: unknown): void {
  // ─── Join ───
  socket.on(SPACE_C2S.JOIN, async (payload: { spaceId?: string }) => {
    if (!checkRateLimit(socket.id, SPACE_C2S.JOIN)) {
      socket.emit(SPACE_S2C.ERROR, { message: 'Slow down' });
      return;
    }
    const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId : '';
    if (!spaceId) return;

    const space = await ensureSpace(spaceId);
    if (!space) {
      socket.emit(SPACE_S2C.ERROR, { message: 'Space is not live' });
      return;
    }

    // Leave any previous space this socket was in.
    const prev = socketToSpace.get(socket.id);
    if (prev && prev !== spaceId) {
      socket.leave(roomName(prev));
      removeSocketFromSpace(io, socket.id);
    }

    socket.join(roomName(spaceId));
    socketToSpace.set(socket.id, spaceId);

    // Presence membership only for authenticated sockets; anonymous viewers
    // still receive broadcasts but aren't listed in the audience strip.
    const userId = typeof socket.data.userId === 'string' ? socket.data.userId : '';
    if (userId) {
      space.members.set(userId, {
        userId,
        name: (socket.data.userName as string) || 'Player',
        image: (socket.data.avatarUrl as string) ?? null,
        socketId: socket.id,
      });
    }

    emitState(io, space);
  });

  // ─── Leave ───
  socket.on(SPACE_C2S.LEAVE, (payload: { spaceId?: string }) => {
    const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId : socketToSpace.get(socket.id);
    if (spaceId) socket.leave(roomName(spaceId));
    removeSocketFromSpace(io, socket.id);
  });

  // ─── Chat ───
  socket.on(SPACE_C2S.CHAT, (payload: { spaceId?: string; body?: string }) => {
    if (!checkRateLimit(socket.id, SPACE_C2S.CHAT)) {
      socket.emit(SPACE_S2C.ERROR, { message: 'You are sending messages too fast' });
      return;
    }
    const userId = typeof socket.data.userId === 'string' ? socket.data.userId : '';
    if (!userId) {
      socket.emit(SPACE_S2C.ERROR, { message: 'Sign in to chat' });
      return;
    }

    const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId : '';
    const body = sanitizeString(payload?.body, 500);
    if (!spaceId || !body) return;

    const space = spaces.get(spaceId);
    if (!space || space.status !== 'LIVE') return;
    if (!space.members.has(userId)) return; // must have joined

    const message = {
      id: `sm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      spaceId,
      userId,
      name: (socket.data.userName as string) || 'Player',
      image: (socket.data.avatarUrl as string) ?? null,
      body,
      createdAt: Date.now(),
    };

    io.to(roomName(spaceId)).emit(SPACE_S2C.MESSAGE, message);

    // Persist to the transcript (fire-and-forget) only when the host opted in.
    if (space.recordChat) {
      const prisma = getPrismaClient();
      prisma.spaceMessage
        .create({ data: { spaceId, userId, body } })
        .catch((err: Error) => logger.warn({ event: 'space_chat_persist_failed', spaceId, error: err.message }));
    }
  });

  // ─── Reaction (ephemeral) ───
  socket.on(SPACE_C2S.REACT, (payload: { spaceId?: string; emoji?: string }) => {
    if (!checkRateLimit(socket.id, SPACE_C2S.REACT)) return;
    const userId = typeof socket.data.userId === 'string' ? socket.data.userId : '';
    if (!userId) return;

    const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId : '';
    const emoji = typeof payload?.emoji === 'string' ? payload.emoji.slice(0, 8) : '';
    if (!spaceId || !emoji) return;

    const space = spaces.get(spaceId);
    if (!space || space.status !== 'LIVE') return;

    io.to(roomName(spaceId)).emit(SPACE_S2C.REACTION, { userId, emoji });
  });

  // ─── Pin content (host only) ───
  socket.on(SPACE_C2S.PIN, (payload: { spaceId?: string; pinned?: unknown }) => {
    if (!checkRateLimit(socket.id, SPACE_C2S.PIN)) return;
    const userId = typeof socket.data.userId === 'string' ? socket.data.userId : '';
    const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId : '';
    if (!userId || !spaceId) return;

    const space = spaces.get(spaceId);
    if (!space || space.hostId !== userId) {
      socket.emit(SPACE_S2C.ERROR, { message: 'Only the host can pin content' });
      return;
    }

    const pinned = payload?.pinned == null ? null : isPinned(payload.pinned) ? payload.pinned : undefined;
    if (pinned === undefined) return; // invalid shape
    space.pinned = pinned;

    io.to(roomName(spaceId)).emit(SPACE_S2C.PINNED, { pinned });

    // Persist the pinned choice (fire-and-forget). JsonNull clears the column
    // on unpin so a hub restart doesn't reload a stale pin.
    const prisma = getPrismaClient();
    prisma.space
      .update({
        where: { id: spaceId },
        data: { pinned: pinned === null ? Prisma.JsonNull : (pinned as unknown as Prisma.InputJsonValue) },
      })
      .catch((err: Error) => logger.warn({ event: 'space_pin_persist_failed', spaceId, error: err.message }));
  });

  // ─── End (host only) ───
  socket.on(SPACE_C2S.END, async (payload: { spaceId?: string }) => {
    if (!checkRateLimit(socket.id, SPACE_C2S.END)) return;
    const userId = typeof socket.data.userId === 'string' ? socket.data.userId : '';
    const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId : '';
    if (!userId || !spaceId) return;

    const space = await ensureSpace(spaceId);
    if (!space || space.hostId !== userId) {
      socket.emit(SPACE_S2C.ERROR, { message: 'Only the host can end this Space' });
      return;
    }

    space.status = 'ENDED';
    io.to(roomName(spaceId)).emit(SPACE_S2C.ENDED, { spaceId });
    spaces.delete(spaceId);

    const prisma = getPrismaClient();
    prisma.space
      .update({ where: { id: spaceId }, data: { status: 'ENDED', endedAt: new Date() } })
      .catch((err: Error) => logger.warn({ event: 'space_end_persist_failed', spaceId, error: err.message }));

    logger.info({ event: 'space_ended', spaceId, hostId: userId });
  });

  // Self-contained cleanup so audience leaves even if the central disconnect
  // wiring is missed. `handleSpacesDisconnect` is idempotent, so a double call
  // is harmless.
  socket.on('disconnect', () => removeSocketFromSpace(io, socket.id));
}

export function handleSpacesDisconnect(io: Server, socket: Socket): void {
  removeSocketFromSpace(io, socket.id);
}
