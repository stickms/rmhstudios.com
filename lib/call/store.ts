/**
 * Call orchestration: the socket, the peer connection and the UI state,
 * joined up.
 *
 * The transitions live in `lib/call/state.ts` (pure, tested); the WebRTC
 * mechanics live in `lib/call/peer.ts` (no framework). This file is the seam
 * between them and the one place that talks to the socket.
 *
 * There is exactly one call at a time, so this is a module singleton rather
 * than something instantiated per component — an incoming call has to ring
 * wherever the user happens to be on the site, which means the state cannot
 * belong to any particular screen.
 */

'use client';

import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import {
  CALL_C2S,
  CALL_S2C,
  type CallEndReason,
  type CallPeer as CallPeerInfo,
} from '@/lib/call/events';
import { IDLE, isBusy, reduce, type CallEvent, type CallState } from '@/lib/call/state';
import { CallPeer, callSupported } from '@/lib/call/peer';
import type { IceServer } from '@/lib/call/ice';

interface CallStore extends CallState {
  /** Who we are talking to, for the UI. */
  peer: CallPeerInfo | null;
  /** True once `openMicrophone` has been refused — shows the permission hint. */
  micDenied: boolean;
  dispatch: (event: CallEvent) => void;
  setPeer: (peer: CallPeerInfo | null) => void;
  setMicDenied: (denied: boolean) => void;
}

export const useCallStore = create<CallStore>((set) => ({
  ...IDLE,
  peer: null,
  micDenied: false,
  dispatch: (event) => set((s) => reduce(s, event)),
  setPeer: (peer) => set({ peer }),
  setMicDenied: (micDenied) => set({ micDenied }),
}));

const store = () => useCallStore.getState();

let client: RealtimeClient | null = null;
let peerConn: CallPeer | null = null;
let iceServers: IceServer[] = [];

/** Fetch relay credentials. Short-lived, so they are fetched per call. */
async function loadIceServers(): Promise<IceServer[]> {
  try {
    const res = await fetch('/api/calls/ice');
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { iceServers?: IceServer[] };
    return body.iceServers ?? [];
  } catch {
    // A STUN-only fallback still connects for most pairs, which is better than
    // refusing to place the call.
    return [{ urls: ['stun:stun.l.google.com:19302'] }];
  }
}

function teardownPeer(): void {
  peerConn?.close();
  peerConn = null;
}

/** End locally and tell the server, without waiting for the round trip. */
function finish(reason: CallEndReason): void {
  const { callId } = store();
  const event =
    reason === 'declined'
      ? CALL_C2S.DECLINE
      : reason === 'cancelled'
        ? CALL_C2S.CANCEL
        : CALL_C2S.HANGUP;
  if (callId) client?.emit(event, { callId });
  teardownPeer();
  store().dispatch({ type: 'end', reason });
}

function bindPeer(callId: string): CallPeer {
  const peer = new CallPeer(iceServers, {
    onDescription: (description) => client?.emit(CALL_C2S.SIGNAL, { callId, description }),
    onCandidate: (candidate) => client?.emit(CALL_C2S.ICE, { callId, candidate }),
    onConnected: () => store().dispatch({ type: 'media-connected', at: Date.now() }),
    // A failed ICE negotiation is the honest outcome when there is no relay and
    // both peers are behind symmetric NAT — say so rather than hanging on a
    // "connecting" spinner forever.
    onFailed: () => finish('failed'),
  });
  peerConn = peer;
  return peer;
}

/**
 * Connect the signalling socket and start listening for incoming calls.
 *
 * Idempotent, and safe to call for a signed-out visitor (it no-ops): the
 * global mount calls it on every page.
 */
export function initCalls(): void {
  if (client || typeof window === 'undefined' || !callSupported()) return;

  client = createRealtimeClient({
    name: 'calls',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      // `token`, not a user id: the hub authenticates the Better Auth session
      // token against the `session` table and derives the user from it. A
      // client-supplied id would be an impersonation hole, so the server
      // ignores one — leaving the socket anonymous, which silently disables
      // every call handler and the `user:<id>` room an incoming call rings.
      const session = await authClient.getSession();
      return { token: session?.data?.session?.token };
    },
  });

  const socket: Socket = client.socket;

  socket.on(
    CALL_S2C.INCOMING,
    (payload: { callId: string; from: CallPeerInfo; conversationId: string | null }) => {
      const s = store();
      // Already busy: the server also guards this, but a second ring must never
      // replace the call on screen.
      if (s.phase !== 'idle' && s.phase !== 'ended') return;
      s.setPeer(payload.from);
      s.dispatch({
        type: 'incoming',
        callId: payload.callId,
        peerId: payload.from.id,
        conversationId: payload.conversationId,
      });
    },
  );

  socket.on(CALL_S2C.RINGING, ({ callId }: { callId: string }) => {
    const s = store();
    if (s.phase === 'outgoing' && s.callId === null) {
      s.dispatch({ type: 'ringing', callId });
      return;
    }
    // Already ours: a duplicate confirmation, nothing to do.
    if (s.callId === callId) return;
    // We gave up (or the mic failed) while the invite was still in flight. The
    // server has since created the call and is ringing them, so cancel it —
    // otherwise the callee rings for 45 seconds at a caller who has left.
    client?.emit(CALL_C2S.CANCEL, { callId });
  });

  socket.on(CALL_S2C.ACCEPTED, async ({ callId }: { callId: string }) => {
    const s = store();
    if (s.callId !== callId) return;
    const wasCaller = s.phase === 'outgoing';
    s.dispatch({ type: 'accepted' });

    // The caller makes the offer. There is no glare to resolve: the roles are
    // fixed by who dialled.
    if (wasCaller) {
      try {
        const peer = peerConn ?? bindPeer(callId);
        await peer.openMicrophone();
        await peer.createOffer();
      } catch {
        store().setMicDenied(true);
        finish('failed');
      }
    }
  });

  socket.on(
    CALL_S2C.SIGNAL,
    async ({ callId, description }: { callId: string; description: RTCSessionDescriptionInit }) => {
      if (store().callId !== callId) return;
      try {
        await (peerConn ?? bindPeer(callId)).acceptDescription(description);
      } catch {
        finish('failed');
      }
    },
  );

  socket.on(
    CALL_S2C.ICE,
    async ({ callId, candidate }: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (store().callId !== callId) return;
      await peerConn?.addCandidate(candidate);
    },
  );

  socket.on(CALL_S2C.MUTE, ({ callId, muted }: { callId: string; muted: boolean }) => {
    if (store().callId !== callId) return;
    store().dispatch({ type: 'peer-muted', muted });
  });

  socket.on(CALL_S2C.ENDED, ({ callId, reason }: { callId: string; reason: CallEndReason }) => {
    if (store().callId !== callId) return;
    teardownPeer();
    store().dispatch({ type: 'end', reason });
  });

  socket.on(CALL_S2C.REJECTED, ({ reason }: { reason: CallEndReason }) => {
    teardownPeer();
    store().dispatch({ type: 'end', reason });
  });
}

/** Place a call. */
export async function startCall(callee: CallPeerInfo, conversationId?: string): Promise<void> {
  initCalls();
  const s = store();
  if (isBusy(s)) return;

  s.setMicDenied(false);
  s.setPeer(callee);
  // Dial before the round trip, so the overlay is on screen while we wait and
  // so a refusal has a call to end. The server answers with `ringing` (which
  // carries the real call id) or `rejected`.
  s.dispatch({ type: 'dial', peerId: callee.id, conversationId: conversationId ?? null });

  iceServers = await loadIceServers();
  // Hanging up during that fetch is a normal thing to do, and an invite sent
  // afterwards would ring someone we already stopped calling.
  if (store().phase !== 'outgoing') return;

  // `emit` returns false when the socket is down, and drops the event. Saying
  // so beats dialling forever against a reply that is never coming.
  const sent = client?.emit(CALL_C2S.INVITE, { calleeId: callee.id, conversationId }) ?? false;
  if (!sent) store().dispatch({ type: 'end', reason: 'failed' });
}

/** Answer a ringing call. Opens the microphone — this is the permission moment. */
export async function acceptCall(): Promise<void> {
  const s = store();
  if (s.phase !== 'incoming' || !s.callId) return;

  try {
    iceServers = await loadIceServers();
    const peer = bindPeer(s.callId);
    await peer.openMicrophone();
  } catch {
    // Refusing the mic prompt must decline the call rather than leave the
    // caller ringing into a tab that will never answer.
    store().setMicDenied(true);
    finish('declined');
    return;
  }
  client?.emit(CALL_C2S.ACCEPT, { callId: s.callId });
}

export function declineCall(): void {
  if (store().phase !== 'incoming') return;
  finish('declined');
}

export function hangUp(): void {
  const { phase } = store();
  if (phase === 'idle' || phase === 'ended') return;
  finish(phase === 'outgoing' ? 'cancelled' : 'hangup');
}

export function toggleMute(): void {
  const s = store();
  if (s.phase !== 'connected' && s.phase !== 'connecting') return;
  const muted = !s.muted;
  peerConn?.setMuted(muted);
  s.dispatch({ type: 'set-muted', muted });
  if (s.callId) client?.emit(CALL_C2S.MUTE, { callId: s.callId, muted });
}

/** Dismiss the ended-call card. */
export function dismissCall(): void {
  teardownPeer();
  store().dispatch({ type: 'reset' });
  store().setPeer(null);
}
