/**
 * Party system (§5) — socket handler for the unified games hub.
 *
 * Parties are ephemeral (NO schema): in-memory Maps keyed by partyId, same
 * blast radius as an in-progress match (a hub restart dissolves them). Invites
 * are also written as `Notification` rows via the hub's Prisma client
 * (fire-and-forget). The leader queues a game → the party-enabled game creates a
 * room → every member gets a short-lived HMAC `party:ticket`.
 *
 * Auth: hub soft-auth attaches socket.data.userId; all party actions require it.
 *
 * Add these rate-limit rules to `config.ts#SOCKET_RATE_LIMITS` (also the
 * inbound-event allowlist):
 *   party:create {max:10}  party:invite {max:20}  party:accept {max:20}
 *   party:leave {max:30}   party:kick {max:20}    party:transfer {max:20}
 *   party:queue {max:20}   (all windowMs 60_000)
 *
 * Registered per-connection from `index.ts`:
 *   registerPartyHandlers(io, socket)   // ctx optional/unused
 *   handlePartyDisconnect(io, socket)   // in the disconnect block
 *
 * NOTE: no games are registered as party-enabled yet — `party:queue` returns a
 * "not party-enabled" error until a game calls `registerPartyGame(...)` from its
 * own handler (rollout: RMHBox, Synapse Storm, Hold'em, Kowloon Knockout).
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { partyGames, mintPartyTicket, type PartyMember } from '../party-contract';
import { PARTY_C2S, PARTY_S2C } from '../../lib/party/events';

const MAX_PARTY_SIZE = 8;

interface PartyMemberState {
  userId: string;
  name: string;
  image: string | null;
  socketId: string;
}

interface Party {
  id: string;
  leaderId: string;
  members: Map<string, PartyMemberState>; // keyed by userId
  createdAt: number;
}

const parties = new Map<string, Party>();
const userToParty = new Map<string, string>(); // userId -> partyId

function roomName(partyId: string): string {
  return `party:${partyId}`;
}

function partyView(party: Party) {
  return {
    id: party.id,
    leaderId: party.leaderId,
    maxSize: MAX_PARTY_SIZE,
    members: Array.from(party.members.values()).map((m) => ({
      userId: m.userId,
      name: m.name,
      image: m.image,
      isLeader: m.userId === party.leaderId,
    })),
  };
}

function emitState(io: Server, party: Party): void {
  io.to(roomName(party.id)).emit(PARTY_S2C.STATE, partyView(party));
}

function socketsForUser(io: Server, userId: string): Socket[] {
  const out: Socket[] = [];
  for (const s of io.sockets.sockets.values()) {
    if ((s.data as { userId?: string }).userId === userId) out.push(s);
  }
  return out;
}

function newPartyId(): string {
  return `pty_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Remove a user from their current party, transferring leadership / disbanding. */
function leaveParty(io: Server, userId: string, disbandSocket?: Socket): void {
  const partyId = userToParty.get(userId);
  if (!partyId) return;
  const party = parties.get(partyId);
  userToParty.delete(userId);
  if (!party) return;

  const member = party.members.get(userId);
  party.members.delete(userId);
  if (member) {
    const s = disbandSocket ?? io.sockets.sockets.get(member.socketId);
    s?.leave(roomName(partyId));
  }

  if (party.members.size === 0) {
    parties.delete(partyId);
    return;
  }

  if (party.leaderId === userId) {
    const next = party.members.values().next().value as PartyMemberState | undefined;
    if (next) party.leaderId = next.userId;
  }
  emitState(io, party);
}

// ─── Registration ───────────────────────────────────────────────

export function registerPartyHandlers(io: Server, socket: Socket, _ctx?: unknown): void {
  const selfId = (): string => (typeof socket.data.userId === 'string' ? socket.data.userId : '');
  const selfName = (): string => (socket.data.userName as string) || 'Player';
  const selfImage = (): string | null => (socket.data.avatarUrl as string) ?? null;

  // ─── Create ───
  socket.on(PARTY_C2S.CREATE, () => {
    if (!checkRateLimit(socket.id, PARTY_C2S.CREATE)) return;
    const userId = selfId();
    if (!userId) {
      socket.emit(PARTY_S2C.ERROR, { message: 'Sign in to start a party' });
      return;
    }

    // Leave any existing party first.
    if (userToParty.has(userId)) leaveParty(io, userId, socket);

    const id = newPartyId();
    const party: Party = {
      id,
      leaderId: userId,
      members: new Map([[userId, { userId, name: selfName(), image: selfImage(), socketId: socket.id }]]),
      createdAt: Date.now(),
    };
    parties.set(id, party);
    userToParty.set(userId, id);
    socket.join(roomName(id));
    emitState(io, party);
    logger.info({ event: 'party_created', partyId: id, leaderId: userId });
  });

  // ─── Invite (followers / mutuals only) ───
  socket.on(PARTY_C2S.INVITE, async (payload: { userId?: string }) => {
    if (!checkRateLimit(socket.id, PARTY_C2S.INVITE)) return;
    const inviterId = selfId();
    const targetId = typeof payload?.userId === 'string' ? payload.userId : '';
    if (!inviterId || !targetId || targetId === inviterId) return;

    const partyId = userToParty.get(inviterId);
    const party = partyId ? parties.get(partyId) : null;
    if (!party) {
      socket.emit(PARTY_S2C.ERROR, { message: 'Start a party first' });
      return;
    }
    if (party.members.size >= MAX_PARTY_SIZE) {
      socket.emit(PARTY_S2C.ERROR, { message: 'Party is full' });
      return;
    }

    // Only invite followers / mutuals (anti-spam). The hub has DB access.
    const prisma = getPrismaClient();
    const rel = await prisma.follow
      .findFirst({
        where: {
          OR: [
            { followerId: inviterId, followingId: targetId },
            { followerId: targetId, followingId: inviterId },
          ],
        },
        select: { id: true },
      })
      .catch(() => null);
    if (!rel) {
      socket.emit(PARTY_S2C.ERROR, { message: 'You can only invite people you follow or who follow you' });
      return;
    }

    const invite = {
      partyId: party.id,
      from: { userId: inviterId, name: selfName(), image: selfImage() },
    };
    for (const s of socketsForUser(io, targetId)) s.emit(PARTY_S2C.INVITED, invite);

    // Also drop a Notification row (fire-and-forget) so offline invitees see it.
    prisma.notification
      .create({
        data: {
          userId: targetId,
          actorId: inviterId,
          type: 'SYSTEM',
          entityType: 'party',
          entityId: party.id,
          preview: `${selfName()} invited you to a party`,
          link: '/',
        },
      })
      .catch(() => {});
  });

  // ─── Accept ───
  socket.on(PARTY_C2S.ACCEPT, (payload: { partyId?: string }) => {
    if (!checkRateLimit(socket.id, PARTY_C2S.ACCEPT)) return;
    const userId = selfId();
    const partyId = typeof payload?.partyId === 'string' ? payload.partyId : '';
    if (!userId || !partyId) return;

    const party = parties.get(partyId);
    if (!party) {
      socket.emit(PARTY_S2C.ERROR, { message: 'That party no longer exists' });
      return;
    }
    if (party.members.size >= MAX_PARTY_SIZE && !party.members.has(userId)) {
      socket.emit(PARTY_S2C.ERROR, { message: 'Party is full' });
      return;
    }

    // Leave a different party if in one.
    const current = userToParty.get(userId);
    if (current && current !== partyId) leaveParty(io, userId, socket);

    party.members.set(userId, { userId, name: selfName(), image: selfImage(), socketId: socket.id });
    userToParty.set(userId, partyId);
    socket.join(roomName(partyId));
    emitState(io, party);
  });

  // ─── Leave ───
  socket.on(PARTY_C2S.LEAVE, () => {
    if (!checkRateLimit(socket.id, PARTY_C2S.LEAVE)) return;
    const userId = selfId();
    if (userId) leaveParty(io, userId, socket);
  });

  // ─── Kick (leader only) ───
  socket.on(PARTY_C2S.KICK, (payload: { userId?: string }) => {
    if (!checkRateLimit(socket.id, PARTY_C2S.KICK)) return;
    const userId = selfId();
    const targetId = typeof payload?.userId === 'string' ? payload.userId : '';
    const partyId = userToParty.get(userId);
    const party = partyId ? parties.get(partyId) : null;
    if (!party || party.leaderId !== userId || !targetId || targetId === userId) return;
    if (!party.members.has(targetId)) return;

    for (const s of socketsForUser(io, targetId)) {
      s.leave(roomName(party.id));
      s.emit(PARTY_S2C.DISBANDED, { reason: 'kicked' });
    }
    leaveParty(io, targetId);
  });

  // ─── Transfer leadership (leader only) ───
  socket.on(PARTY_C2S.TRANSFER, (payload: { userId?: string }) => {
    if (!checkRateLimit(socket.id, PARTY_C2S.TRANSFER)) return;
    const userId = selfId();
    const targetId = typeof payload?.userId === 'string' ? payload.userId : '';
    const partyId = userToParty.get(userId);
    const party = partyId ? parties.get(partyId) : null;
    if (!party || party.leaderId !== userId || !party.members.has(targetId)) return;
    party.leaderId = targetId;
    emitState(io, party);
  });

  // ─── Queue a game (leader only) ───
  socket.on(PARTY_C2S.QUEUE, async (payload: { game?: string }) => {
    if (!checkRateLimit(socket.id, PARTY_C2S.QUEUE)) return;
    const userId = selfId();
    const game = typeof payload?.game === 'string' ? payload.game : '';
    const partyId = userToParty.get(userId);
    const party = partyId ? parties.get(partyId) : null;
    if (!party) return;
    if (party.leaderId !== userId) {
      socket.emit(PARTY_S2C.ERROR, { message: 'Only the party leader can pick a game' });
      return;
    }

    const impl = partyGames.get(game);
    if (!impl) {
      socket.emit(PARTY_S2C.ERROR, { message: 'That game does not support parties yet' });
      return;
    }
    if (party.members.size > impl.maxPartySize) {
      socket.emit(PARTY_S2C.ERROR, {
        message: `Your party is too big for this game (max ${impl.maxPartySize})`,
      });
      return;
    }

    const members: PartyMember[] = Array.from(party.members.values()).map((m) => ({
      userId: m.userId,
      name: m.name,
    }));

    let ref;
    try {
      ref = await impl.createRoomForParty(members);
    } catch (err) {
      logger.warn({ event: 'party_queue_room_failed', game, error: String(err) });
      socket.emit(PARTY_S2C.ERROR, { message: 'Could not create the game room' });
      return;
    }

    // Hand every member a single-use ticket to the same room.
    for (const m of party.members.values()) {
      const token = mintPartyTicket({ partyId: party.id, userId: m.userId, game, roomId: ref.roomId });
      const msg = { game, roomId: ref.roomId, token };
      for (const s of socketsForUser(io, m.userId)) s.emit(PARTY_S2C.TICKET, msg);
    }
    logger.info({ event: 'party_queued', partyId: party.id, game, roomId: ref.roomId });
  });

  // Self-contained cleanup (idempotent; `handlePartyDisconnect` may also run).
  socket.on('disconnect', () => handlePartyDisconnect(io, socket));
}

export function handlePartyDisconnect(io: Server, socket: Socket): void {
  const userId = (socket.data as { userId?: string }).userId;
  if (!userId) return;
  // Only drop the member if this is the socket currently seated for them.
  const partyId = userToParty.get(userId);
  if (!partyId) return;
  const party = parties.get(partyId);
  const member = party?.members.get(userId);
  if (member && member.socketId === socket.id) {
    leaveParty(io, userId, socket);
  }
}
