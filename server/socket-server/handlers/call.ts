/**
 * 1:1 voice calls — signalling relay.
 *
 * This handler never sees audio. Two participants means the browsers connect
 * peer-to-peer, so the server's whole job is to pass SDP and ICE between two
 * sockets and to be the authority on three things a client cannot be trusted
 * with: whether the caller is allowed to ring at all, whether the callee is
 * already busy, and when an unanswered call gives up.
 *
 * Rate-limit rules live in `config.ts#SOCKET_RATE_LIMITS`, which is also the
 * inbound allowlist — an event missing from it is dropped before it reaches
 * here.
 *
 * Registered per-connection from `index.ts`:
 *   registerCallHandlers(io, socket)
 *   handleCallDisconnect(io, socket)   // in the disconnect block
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { CALL_C2S, CALL_S2C, RING_TIMEOUT_MS, MAX_SDP_BYTES, MAX_ICE_BYTES } from '../../../lib/call/events';
import type { CallEndReason, CallRejectReason } from '../../../lib/call/events';
import { canCall, persistedStatus, isCallPrivacy, type CallPrivacy } from '../../../lib/call/state';

/** A call in flight, keyed by callId. Ephemeral by design — a restart drops
 *  live calls, and the peers notice through ICE rather than through us. */
interface LiveCall {
  id: string;
  callerId: string;
  calleeId: string;
  conversationId: string | null;
  connectedAt: number | null;
  /** Fires if nobody answers. */
  ringTimer: ReturnType<typeof setTimeout> | null;
}

const calls = new Map<string, LiveCall>();
/** userId → callId, so "are you busy?" is O(1) and a disconnect can find it. */
const byUser = new Map<string, string>();

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function otherParty(call: LiveCall, userId: string): string {
  return call.callerId === userId ? call.calleeId : call.callerId;
}

function clearCall(call: LiveCall): void {
  if (call.ringTimer) clearTimeout(call.ringTimer);
  calls.delete(call.id);
  if (byUser.get(call.callerId) === call.id) byUser.delete(call.callerId);
  if (byUser.get(call.calleeId) === call.id) byUser.delete(call.calleeId);
}

/** Persist the outcome. Fire-and-forget: a history row must never delay teardown. */
function persist(call: LiveCall, reason: CallEndReason): void {
  const connected = call.connectedAt !== null;
  const endedAt = new Date();
  const durationSec = connected
    ? Math.max(0, Math.round((endedAt.getTime() - (call.connectedAt as number)) / 1000))
    : 0;

  getPrismaClient()
    .call.update({
      where: { id: call.id },
      data: {
        status: persistedStatus(reason, connected),
        endedAt,
        durationSec,
        ...(connected ? { connectedAt: new Date(call.connectedAt as number) } : {}),
      },
    })
    .catch((err: unknown) =>
      logger.warn({ event: 'call_persist_failed', callId: call.id, error: String(err) }),
    );
}

/** End a call and tell both sides once. */
function endCall(io: Server, call: LiveCall, reason: CallEndReason): void {
  const connected = call.connectedAt !== null;
  const durationSec = connected
    ? Math.max(0, Math.round((Date.now() - (call.connectedAt as number)) / 1000))
    : 0;

  clearCall(call);
  persist(call, reason);

  for (const uid of [call.callerId, call.calleeId]) {
    io.to(userRoom(uid)).emit(CALL_S2C.ENDED, {
      callId: call.id,
      reason,
      ...(connected ? { durationSec } : {}),
    });
  }
}

async function loadCallPermission(
  callerId: string,
  calleeId: string,
): Promise<{ allowed: true } | { allowed: false; reason: CallRejectReason }> {
  const prisma = getPrismaClient();

  const [block, prefs, follow] = await Promise.all([
    // Either direction bars the call.
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: callerId, blockedId: calleeId },
          { blockerId: calleeId, blockedId: callerId },
        ],
      },
      select: { blockerId: true },
    }),
    prisma.notificationPreference.findUnique({
      where: { userId: calleeId },
      select: { callPrivacy: true },
    }),
    // Does the CALLEE follow the CALLER? Permission is granted by the person
    // being called, never claimed by the caller.
    prisma.follow.findFirst({
      where: { followerId: calleeId, followingId: callerId },
      select: { followerId: true },
    }),
  ]);

  const raw = prefs?.callPrivacy;
  const privacy: CallPrivacy = isCallPrivacy(raw) ? raw : 'following';

  const verdict = canCall({
    privacy,
    blocked: Boolean(block),
    calleeFollowsCaller: Boolean(follow),
  });
  return verdict.allowed ? { allowed: true } : { allowed: false, reason: verdict.reason };
}

export function registerCallHandlers(io: Server, socket: Socket): void {
  const uid = (): string => (typeof socket.data.userId === 'string' ? socket.data.userId : '');

  // Every authenticated socket joins its own user room, so a call can reach a
  // person rather than a tab — they may have the site open in several.
  const self = uid();
  if (self) void socket.join(userRoom(self));

  socket.on(CALL_C2S.INVITE, async (payload: { calleeId?: unknown; conversationId?: unknown }) => {
    const callerId = uid();
    if (!callerId) return;
    if (!checkRateLimit(socket.id, CALL_C2S.INVITE)) return;

    const calleeId = typeof payload?.calleeId === 'string' ? payload.calleeId : '';
    if (!calleeId || calleeId === callerId) return;
    const conversationId =
      typeof payload?.conversationId === 'string' ? payload.conversationId : null;

    const reject = (reason: CallRejectReason) =>
      socket.emit(CALL_S2C.REJECTED, { reason });

    // Busy on either side. Checked before the DB round trip.
    if (byUser.has(callerId)) return reject('busy');
    if (byUser.has(calleeId)) return reject('busy');

    let permission;
    try {
      permission = await loadCallPermission(callerId, calleeId);
    } catch (err) {
      logger.warn({ event: 'call_permission_failed', error: String(err) });
      return reject('offline');
    }
    if (!permission.allowed) {
      // 'blocked' and 'privacy' are reported to the caller identically as a
      // refusal by the client, so a block cannot be probed for.
      return reject(permission.reason);
    }

    // Is anyone actually there? A call to a closed tab should say so rather
    // than ring for 45 seconds into nothing.
    const sockets = await io.in(userRoom(calleeId)).fetchSockets();
    if (sockets.length === 0) return reject('offline');

    const prisma = getPrismaClient();
    let row;
    try {
      row = await prisma.call.create({
        data: { callerId, calleeId, conversationId, status: 'RINGING' },
        select: { id: true },
      });
    } catch (err) {
      logger.warn({ event: 'call_create_failed', error: String(err) });
      return reject('offline');
    }

    const call: LiveCall = {
      id: row.id,
      callerId,
      calleeId,
      conversationId,
      connectedAt: null,
      ringTimer: null,
    };
    // The server owns the ring timeout, so a client that ignores its own timer
    // cannot ring someone indefinitely.
    call.ringTimer = setTimeout(() => {
      const live = calls.get(call.id);
      if (live) endCall(io, live, 'missed');
    }, RING_TIMEOUT_MS);

    calls.set(call.id, call);
    byUser.set(callerId, call.id);
    byUser.set(calleeId, call.id);

    const caller = await prisma.user
      .findUnique({
        where: { id: callerId },
        select: { id: true, name: true, image: true, handle: true },
      })
      .catch(() => null);

    io.to(userRoom(calleeId)).emit(CALL_S2C.INCOMING, {
      callId: call.id,
      from: {
        id: callerId,
        name: caller?.name ?? 'Someone',
        image: caller?.image ?? null,
        handle: caller?.handle ?? null,
      },
      conversationId,
    });
    socket.emit(CALL_S2C.RINGING, { callId: call.id, calleeId });
  });

  socket.on(CALL_C2S.ACCEPT, (payload: { callId?: unknown }) => {
    const userId = uid();
    if (!userId || !checkRateLimit(socket.id, CALL_C2S.ACCEPT)) return;
    const call = calls.get(String(payload?.callId ?? ''));
    // Only the callee can accept, and only while it is still ringing.
    if (!call || call.calleeId !== userId || call.connectedAt !== null) return;

    if (call.ringTimer) {
      clearTimeout(call.ringTimer);
      call.ringTimer = null;
    }
    call.connectedAt = Date.now();

    getPrismaClient()
      .call.update({
        where: { id: call.id },
        data: { status: 'CONNECTED', connectedAt: new Date(call.connectedAt) },
      })
      .catch((err: unknown) =>
        logger.warn({ event: 'call_connect_persist_failed', error: String(err) }),
      );

    // Both sides hear it: the caller starts the WebRTC offer, the callee's other
    // tabs stop ringing.
    io.to(userRoom(call.callerId)).emit(CALL_S2C.ACCEPTED, { callId: call.id });
    io.to(userRoom(call.calleeId)).emit(CALL_S2C.ACCEPTED, { callId: call.id });
  });

  const terminate = (event: string, reason: CallEndReason, requireCallee: boolean) => {
    socket.on(event, (payload: { callId?: unknown }) => {
      const userId = uid();
      if (!userId || !checkRateLimit(socket.id, event)) return;
      const call = calls.get(String(payload?.callId ?? ''));
      if (!call) return;
      if (call.callerId !== userId && call.calleeId !== userId) return;
      if (requireCallee && call.calleeId !== userId) return;
      endCall(io, call, reason);
    });
  };

  terminate(CALL_C2S.DECLINE, 'declined', true);
  terminate(CALL_C2S.CANCEL, 'cancelled', false);
  terminate(CALL_C2S.HANGUP, 'hangup', false);

  /**
   * SDP and ICE relay.
   *
   * The payload is passed through opaquely — we do not parse SDP — but it is
   * size-capped and only ever delivered to the *other* participant of a call
   * this socket is actually in. Without that check the relay would be a
   * general-purpose way to push arbitrary JSON at any user on the site.
   */
  const relay = (inbound: string, outbound: string, maxBytes: number, key: 'description' | 'candidate') => {
    socket.on(inbound, (payload: Record<string, unknown>) => {
      const userId = uid();
      if (!userId || !checkRateLimit(socket.id, inbound)) return;
      const call = calls.get(String(payload?.callId ?? ''));
      if (!call || (call.callerId !== userId && call.calleeId !== userId)) return;

      const body = payload?.[key];
      if (!body || typeof body !== 'object') return;
      let size = 0;
      try {
        size = JSON.stringify(body).length;
      } catch {
        return;
      }
      if (size > maxBytes) return;

      io.to(userRoom(otherParty(call, userId))).emit(outbound, {
        callId: call.id,
        [key]: body,
      });
    });
  };

  relay(CALL_C2S.SIGNAL, CALL_S2C.SIGNAL, MAX_SDP_BYTES, 'description');
  relay(CALL_C2S.ICE, CALL_S2C.ICE, MAX_ICE_BYTES, 'candidate');

  socket.on(CALL_C2S.MUTE, (payload: { callId?: unknown; muted?: unknown }) => {
    const userId = uid();
    if (!userId || !checkRateLimit(socket.id, CALL_C2S.MUTE)) return;
    const call = calls.get(String(payload?.callId ?? ''));
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) return;
    io.to(userRoom(otherParty(call, userId))).emit(CALL_S2C.MUTE, {
      callId: call.id,
      muted: Boolean(payload?.muted),
    });
  });
}

/**
 * A dropped socket ends that user's call — but only once their *last* socket
 * goes. Someone with the site open in two tabs is still reachable, and closing
 * one of them should not hang up on them.
 */
export async function handleCallDisconnect(io: Server, socket: Socket): Promise<void> {
  const userId = typeof socket.data.userId === 'string' ? socket.data.userId : '';
  if (!userId) return;
  const callId = byUser.get(userId);
  if (!callId) return;
  const call = calls.get(callId);
  if (!call) return;

  try {
    const remaining = await io.in(userRoom(userId)).fetchSockets();
    if (remaining.length > 0) return;
  } catch {
    // If we cannot tell, end the call — a stuck "in a call" state is worse
    // than an extra hang-up.
  }

  endCall(io, call, call.connectedAt ? 'hangup' : 'cancelled');
}

/** Test seam: live-call count, for assertions about cleanup. */
export function __liveCallCount(): number {
  return calls.size;
}
