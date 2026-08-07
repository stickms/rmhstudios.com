/**
 * Group-call orchestration: the socket, the mesh and the UI state, joined up.
 *
 * The transitions live in `lib/groupcall/state.ts` (pure, tested); the WebRTC
 * mechanics live in `lib/groupcall/mesh.ts` (no framework). This file is the
 * seam between them and the one place that talks to the socket — the same
 * three-file shape as `lib/call/*`, for the same reason: the parts that are
 * hard to test are the parts with no sockets in them.
 *
 * There is exactly one group call at a time, so this is a module singleton
 * rather than something instantiated per component. An ad-hoc room has to ring
 * wherever the user happens to be on the site, and an open room has to keep
 * running while they browse away from the community it belongs to, so the state
 * cannot belong to any particular screen.
 *
 * ## Three invariants this file exists to keep
 *
 * 1. **The reducer owns the roster.** `participants` is only ever written by
 *    `reduce()`. Everything local — per-leg status, who is talking, how loud —
 *    lives beside it in `peers`, and is reconciled against the roster in one
 *    place ({@link reconcilePeers}) rather than patched at each call site.
 * 2. **The microphone opens before anything reaches the server.** A permission
 *    prompt answered "no" after a `JOIN` has landed leaves a participant on
 *    seven other people's rosters who will never make a sound.
 * 3. **Every inbound event is checked against the room we think we are in.**
 *    During any churn — and a room of eight churns constantly — messages about
 *    calls we have left are the steady state, not the edge case.
 */

'use client';

import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import {
  createRealtimeClient,
  type RealtimeClient,
  type RealtimeClientOptions,
} from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import type { IceServer } from '@/lib/call/ice';
import {
  GCALL_C2S,
  GCALL_S2C,
  MAX_GROUP_CALL_INVITES,
  type CallPeer,
  type GroupCallActivePayload,
  type GroupCallEndReason,
  type GroupCallEndedPayload,
  type GroupCallErrorPayload,
  type GroupCallIceRelayPayload,
  type GroupCallIncomingPayload,
  type GroupCallJoinedPayload,
  type GroupCallOrigin,
  type GroupCallParticipantView,
  type GroupCallPeerJoinedPayload,
  type GroupCallPeerLeftPayload,
  type GroupCallRejectedPayload,
  type GroupCallRosterPayload,
  type GroupCallSignalRelayPayload,
  type GroupCallStateRelayPayload,
  type OpenRoomOrigin,
} from '@/lib/groupcall/events';
import {
  IDLE_GROUP_CALL,
  isGroupCallBusy,
  isRosterFull,
  meshPeers,
  pendingInvitees,
  reduce,
  rosterList,
  shouldOffer,
  type GroupCallEvent,
  type GroupCallState,
} from '@/lib/groupcall/state';
// The mesh is loaded on DEMAND — see `bindMesh`. Only the type is imported
// statically, which erases at compile time and leaves no edge in the bundle
// graph. `describeMicrophoneError`/`groupCallSupported` live in `support.ts`
// precisely so needing them does not drag the mesh onto the critical path.
import type { GroupCallMesh } from '@/lib/groupcall/mesh';
import { describeMicrophoneError, groupCallSupported } from '@/lib/groupcall/support';
import type {
  GroupCallPeerStatus,
  GroupCallPeerView,
  GroupCallRoomSummary,
  GroupCallSelfView,
  OpenRoomRef,
} from '@/lib/groupcall/types';

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

/** Everything a UI needs, and nothing a UI has to derive twice. */
export interface GroupCallStore extends GroupCallState {
  /**
   * One entry per remote roster row, keyed by userId — **us excluded**.
   *
   * The server half is `participant`; the rest is what this browser knows about
   * its own connection to them. Kept in step with `participants` by
   * {@link reconcilePeers} on every dispatch, so a row can never outlive the
   * person it describes.
   */
  peers: Record<string, GroupCallPeerView>;
  /** Everything this browser knows about its own microphone. */
  self: GroupCallSelfView;
  /** Who started the room that is ringing us. `adhoc` only, `null` otherwise. */
  ringingFrom: CallPeer | null;
  /** Epoch ms at which the server stops ringing us. Drives the countdown on the card. */
  ringExpiresAt: number | null;
  /**
   * Epoch ms the **room** opened, for the shared call timer.
   *
   * Distinct from `joinedAt`, which is when *we* got in. Both are needed: the
   * timer in the room chrome should agree between two people who joined ten
   * minutes apart, and "how long have I been here" is a different question.
   */
  startedAt: number | null;
  /** Signalling transport health, so the UI can say "reconnecting" honestly. */
  connection: RealtimeStatus;
  /**
   * Open-room presence, keyed by {@link openRoomKey}.
   *
   * `undefined` means never looked up; `null` means looked up and there is no
   * live room. The two are different states to a "Join voice" pill: one renders
   * nothing, the other renders the "start one" affordance.
   */
  rooms: Record<string, GroupCallRoomSummary | null>;
  /** The last protocol-level error. Developer-facing; cleared by the next action. */
  lastError: GroupCallErrorPayload | null;

  /** The only way roster state changes. */
  dispatch: (event: GroupCallEvent) => void;
  setSelf: (patch: Partial<GroupCallSelfView>) => void;
  setPeerStatus: (userId: string, status: GroupCallPeerStatus) => void;
  setPeerSpeaking: (userId: string, speaking: boolean) => void;
  setLevels: (levels: Readonly<Record<string, number>>, localLevel: number) => void;
  setConnection: (status: RealtimeStatus) => void;
  setRoom: (key: string, room: GroupCallRoomSummary | null) => void;
  setRinging: (from: CallPeer | null, expiresAt: number | null) => void;
  setStartedAt: (at: number | null) => void;
  setLastError: (error: GroupCallErrorPayload | null) => void;
  /** Drop everything the mesh owned: meters, speaking flags, mic verdict. */
  clearLocalMedia: () => void;
}

const IDLE_SELF: GroupCallSelfView = {
  muted: false,
  micDenied: false,
  micAvailable: true,
  speaking: false,
  level: 0,
};

export const useGroupCallStore = create<GroupCallStore>((set) => ({
  ...IDLE_GROUP_CALL,
  peers: {},
  self: IDLE_SELF,
  ringingFrom: null,
  ringExpiresAt: null,
  startedAt: null,
  connection: 'idle',
  rooms: {},
  lastError: null,

  dispatch: (event) =>
    set((s) => {
      const next = reduce(s, event);
      return { ...next, peers: reconcilePeers(next, s.peers) };
    }),

  setSelf: (patch) =>
    set((s) => {
      const self = { ...s.self, ...patch };
      return sameSelf(self, s.self) ? s : { self };
    }),

  setPeerStatus: (userId, status) =>
    set((s) => {
      const view = s.peers[userId];
      // A status for somebody who is not on the roster is dropped rather than
      // creating a ghost tile — the same rule `setParticipantMuted` follows.
      // Nothing is lost: `reconcilePeers` reads the live status back off the
      // mesh when the roster row does arrive.
      if (!view || view.status === status) return s;
      return { peers: { ...s.peers, [userId]: { ...view, status, changedAt: Date.now() } } };
    }),

  setPeerSpeaking: (userId, speaking) =>
    set((s) => {
      const view = s.peers[userId];
      if (!view || view.speaking === speaking) return s;
      return { peers: { ...s.peers, [userId]: { ...view, speaking } } };
    }),

  setLevels: (levels, localLevel) =>
    set((s) => {
      let peers = s.peers;
      for (const userId in levels) {
        const view = peers[userId];
        const level = levels[userId];
        if (!view || view.level === level) continue;
        if (peers === s.peers) peers = { ...peers };
        peers[userId] = { ...view, level };
      }
      const selfChanged = s.self.level !== localLevel;
      if (peers === s.peers && !selfChanged) return s;
      return { peers, self: selfChanged ? { ...s.self, level: localLevel } : s.self };
    }),

  setConnection: (connection) => set((s) => (s.connection === connection ? s : { connection })),

  setRoom: (key, room) => set((s) => ({ rooms: { ...s.rooms, [key]: room } })),

  setRinging: (ringingFrom, ringExpiresAt) => set({ ringingFrom, ringExpiresAt }),

  setStartedAt: (startedAt) => set((s) => (s.startedAt === startedAt ? s : { startedAt })),

  setLastError: (lastError) => set((s) => (s.lastError === lastError ? s : { lastError })),

  clearLocalMedia: () =>
    set((s) => {
      let peers = s.peers;
      for (const userId in peers) {
        const view = peers[userId];
        if (!view.speaking && view.level === 0) continue;
        if (peers === s.peers) peers = { ...peers };
        peers[userId] = { ...view, speaking: false, level: 0 };
      }
      return { peers, self: { ...s.self, speaking: false, level: 0 } };
    }),
}));

const store = () => useGroupCallStore.getState();

/* -------------------------------------------------------------------------- */
/* Reconciliation                                                             */
/* -------------------------------------------------------------------------- */

/** Do two roster rows say the same thing? Keeps identity stable across snapshots. */
function sameParticipant(a: GroupCallParticipantView, b: GroupCallParticipantView): boolean {
  return (
    a.userId === b.userId &&
    a.name === b.name &&
    a.image === b.image &&
    a.handle === b.handle &&
    a.muted === b.muted &&
    a.host === b.host &&
    a.joinedAt === b.joinedAt
  );
}

function sameSelf(a: GroupCallSelfView, b: GroupCallSelfView): boolean {
  return (
    a.muted === b.muted &&
    a.micDenied === b.micDenied &&
    a.micAvailable === b.micAvailable &&
    a.speaking === b.speaking &&
    a.level === b.level
  );
}

/**
 * Rebuild `peers` so it holds exactly one row per remote participant.
 *
 * Called on every dispatch, which is the point: there is then no path by which
 * a roster change and the local view of it can disagree. Rows that have not
 * changed keep their object identity so a `ROSTER` snapshot repeating what the
 * deltas already said re-renders nothing, and a brand-new row takes its status
 * from the mesh rather than assuming `new` — a peer whose media connected
 * before their `PEER_JOINED` arrived would otherwise show "connecting" forever.
 */
function reconcilePeers(
  state: GroupCallState,
  previous: Record<string, GroupCallPeerView>,
): Record<string, GroupCallPeerView> {
  const next: Record<string, GroupCallPeerView> = {};
  let changed = false;
  let count = 0;

  for (const userId in state.participants) {
    if (userId === state.selfId) continue;
    const participant = state.participants[userId];
    count += 1;

    const before = previous[userId];
    if (before) {
      if (sameParticipant(before.participant, participant)) {
        next[userId] = before;
      } else {
        next[userId] = { ...before, participant };
        changed = true;
      }
      continue;
    }

    next[userId] = {
      participant,
      status: mesh?.statusOf(userId) ?? 'new',
      speaking: false,
      level: 0,
      offerer: state.selfId ? shouldOffer(state.selfId, userId) : false,
      changedAt: Date.now(),
    };
    changed = true;
  }

  if (!changed && count === Object.keys(previous).length) return previous;
  return next;
}

/* -------------------------------------------------------------------------- */
/* Module singletons                                                          */
/* -------------------------------------------------------------------------- */

let client: RealtimeClient | null = null;
let mesh: GroupCallMesh | null = null;
let iceServers: IceServer[] = [];
/**
 * Our own userId, cached from the session.
 *
 * Needed synchronously in two places the server does not name us: the `start`
 * transition (which has to record `selfId` before any room exists) and the
 * `incoming` one (whose payload names the *caller*). Refreshed on every
 * handshake, since the auth resolver already has the session in its hand.
 */
let selfUserId: string | null = null;

/** Fetch relay credentials. Short-lived, so they are fetched per call. */
async function loadIceServers(): Promise<IceServer[]> {
  try {
    const res = await fetch('/api/calls/ice');
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { iceServers?: IceServer[] };
    return body.iceServers ?? [];
  } catch {
    // A STUN-only fallback still connects for most pairs, which is better than
    // refusing to open the room. It matters more in a mesh than in a 1:1 call:
    // a room is only as complete as its worst pair.
    return [{ urls: ['stun:stun.l.google.com:19302'] }];
  }
}

async function resolveSelfId(): Promise<string | null> {
  if (selfUserId) return selfUserId;
  const session = await authClient.getSession();
  selfUserId = session?.data?.user?.id ?? null;
  return selfUserId;
}

/** Key an open room by what it is scoped to. */
export function openRoomKey(origin: OpenRoomOrigin, originId: string): string {
  return `${origin}:${originId}`;
}

/* -------------------------------------------------------------------------- */
/* The mesh, bound to the socket                                              */
/* -------------------------------------------------------------------------- */

/**
 * Build the mesh, loading its module on first use.
 *
 * The import is dynamic because `mesh.ts` is a thousand lines of WebRTC that
 * only matters once somebody is actually in a call, while this store is reached
 * from route modules — and `routeTree.gen.ts` imports every route module
 * statically, so anything they touch at top level lands in the entry chunk of
 * every page. Deferring it to here is what keeps the mesh off the critical path
 * without changing when it is available: the only caller already awaits, on the
 * same tick it asks for the microphone.
 */
async function bindMesh(): Promise<GroupCallMesh> {
  const { GroupCallMesh: Mesh } = await import('@/lib/groupcall/mesh');
  mesh?.close();
  const bound = new Mesh(iceServers, {
    onDescription: (toUserId, description) => {
      const { callId } = store();
      if (callId) client?.emit(GCALL_C2S.SIGNAL, { callId, to: toUserId, description });
    },
    onCandidate: (toUserId, candidate) => {
      const { callId } = store();
      if (callId) client?.emit(GCALL_C2S.ICE, { callId, to: toUserId, candidate });
    },
    // A failed leg degrades one tile and nothing else. There is deliberately no
    // path from here to `finish()`: seven people should not lose a room because
    // the eighth is behind a symmetric NAT with no relay to fall back on.
    onPeerStatus: (userId, status) => store().setPeerStatus(userId, status),
    onSpeaking: (userId, speaking) => store().setPeerSpeaking(userId, speaking),
    onLocalSpeaking: (speaking) => store().setSelf({ speaking }),
    onLevels: (levels, localLevel) => store().setLevels(levels, localLevel),
  });
  mesh = bound;
  return bound;
}

function teardownMesh(): void {
  mesh?.close();
  mesh = null;
  store().clearLocalMedia();
}

/** Point the mesh at whoever is actually in the room right now. */
function syncMesh(): void {
  const s = store();
  if (!mesh || s.phase !== 'active') return;
  // `meshPeers` is joined-and-not-us: an invitee who is still ringing has no
  // media to negotiate, and building a connection to them would burn a slot's
  // worth of ICE on somebody who may never answer.
  mesh.syncPeers(meshPeers(s).map((p) => p.userId));
}

/**
 * Open the microphone and the ICE credentials, before anything is emitted.
 *
 * Returns false if the mic could not be opened, having already recorded *why*
 * — the caller decides what to tell the server, which differs between a room
 * that is ringing us (decline it) and one we were about to open (nothing was
 * sent, so there is nothing to take back).
 */
async function openLocalMedia(): Promise<boolean> {
  store().setSelf({ micDenied: false });
  try {
    iceServers = await loadIceServers();
    const bound = await bindMesh();
    await bound.openMicrophone();
    bound.setMuted(store().muted);
    store().setSelf({ micAvailable: true });
    return true;
  } catch (error) {
    const failure = describeMicrophoneError(error);
    store().setSelf({ micDenied: failure === 'denied', micAvailable: failure !== 'missing' });
    return false;
  }
}

/**
 * End locally and tell the server, without waiting for the round trip.
 *
 * `notify` is explicit rather than derived from `reason` because the same
 * reason reaches this function from opposite directions: `failed` after a
 * refused microphone prompt has nothing to tell the server when the join was
 * never emitted, and everything to tell it when the room is ringing us.
 * Server-driven endings (`ENDED`, `REJECTED`) do not come through here at all —
 * echoing a `LEAVE` back at a room that has already closed is noise.
 */
function finish(reason: GroupCallEndReason, notify: 'decline' | 'leave' | 'end' | 'none'): void {
  const s = store();
  const { callId } = s;
  if (callId && notify !== 'none') {
    const event =
      notify === 'decline' ? GCALL_C2S.DECLINE : notify === 'end' ? GCALL_C2S.END : GCALL_C2S.LEAVE;
    client?.emit(event, { callId });
  }
  teardownMesh();
  store().dispatch({ type: 'end', reason });
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Connect the signalling socket and start listening.
 *
 * Idempotent, and safe to call for a signed-out visitor or on a browser with no
 * WebRTC (it no-ops): the global mount calls it on every page, because an
 * ad-hoc room has to be able to ring somebody who is reading the blog.
 */
export function initGroupCalls(): void {
  if (client || typeof window === 'undefined' || !groupCallSupported()) return;

  // Built out here rather than inline in the call below so the `auth` resolver
  // sits at the same indentation every other client's does — `realtime-auth`
  // (`lib/__tests__/realtime-auth.test.ts`) reads these resolvers out of the
  // source with a regex, and it is a source-shape test precisely because the
  // bug it guards is invisible at runtime.
  const options: RealtimeClientOptions = {
    name: 'group-calls',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      // `token`, not a user id: the hub authenticates the Better Auth session
      // token against the `session` table and derives the user from it. A
      // client-supplied id would be an impersonation hole, so the server
      // ignores one — leaving the socket anonymous, which silently disables
      // every group-call handler and the `user:<id>` room a ring arrives on.
      const session = await authClient.getSession();
      selfUserId = session?.data?.user?.id ?? selfUserId;
      return { token: session?.data?.session?.token };
    },
    onStatus: (status) => store().setConnection(status),
    onConnect: (_socket, { isReconnect }) => {
      if (!isReconnect) return;
      rejoinAfterReconnect();
    },
  };

  try {
    client = createRealtimeClient(options);
  } catch {
    // A missing `VITE_SOCKET_URL` throws rather than dialling the page origin.
    // Say so in the status instead of taking down whatever page mounted us —
    // group calls are never the reason someone opened the site.
    client = null;
    store().setConnection('error');
    return;
  }

  const socket: Socket = client.socket;
  bindSocket(socket);
}

/**
 * Re-enter the room after the transport came back.
 *
 * The hub has handed us a new socket id and has forgotten which socket carries
 * our media, so a room we never left still has to be re-joined: without it the
 * server relays our peers' offers into a socket that no longer exists and the
 * room silently loses us. `JOINED` is answered as a roster refresh in that case
 * rather than as an entry — see the handler.
 */
function rejoinAfterReconnect(): void {
  const s = store();
  if (s.phase === 'active' && s.callId) {
    client?.emit(GCALL_C2S.JOIN, { callId: s.callId });
    return;
  }
  // A `START` that was in flight when the socket dropped has no id to re-join
  // with, and the room it may have opened lost its only participant on the
  // disconnect. Saying so beats a spinner that resolves to nothing.
  if (s.phase === 'joining' && !s.callId) {
    finish('failed', 'none');
    return;
  }
  if (s.phase === 'joining' && s.callId) client?.emit(GCALL_C2S.JOIN, { callId: s.callId });
}

function bindSocket(socket: Socket): void {
  socket.on(GCALL_S2C.INCOMING, (payload: GroupCallIncomingPayload) => {
    void handleIncoming(payload);
  });

  socket.on(GCALL_S2C.JOINED, (payload: GroupCallJoinedPayload) => {
    const s = store();

    // A re-join after a reconnect: we never left, so this is a fresh roster and
    // a new media-socket binding, not an entry. `reduce` would ignore a
    // `joined` from `active` anyway; feeding it in as a snapshot is what keeps
    // the roster right after a drop.
    if (s.phase === 'active' && s.callId === payload.callId) {
      s.dispatch({
        type: 'roster',
        callId: payload.callId,
        participants: payload.participants,
      });
      s.setStartedAt(payload.startedAt);
      mesh?.setSelfId(payload.selfId);
      syncMesh();
      return;
    }

    // We gave up — hung up during the round trip, or the mic prompt failed —
    // and the server has since put us on the roster. Leave, or we sit in seven
    // other people's tiles as a participant who is not there.
    if (s.phase !== 'joining' || (s.callId !== null && s.callId !== payload.callId)) {
      client?.emit(GCALL_C2S.LEAVE, { callId: payload.callId });
      return;
    }

    s.dispatch({
      type: 'joined',
      callId: payload.callId,
      origin: payload.origin,
      originId: payload.originId,
      conversationId: payload.conversationId,
      hostId: payload.hostId,
      selfId: payload.selfId,
      participants: payload.participants,
      // When *we* got in. `startedAt` below is when the ROOM opened, which is
      // what the shared timer counts from.
      at: Date.now(),
    });
    s.setStartedAt(payload.startedAt);
    s.setRinging(null, null);

    mesh?.setSelfId(payload.selfId);
    // Mute set before the room admitted us has not been published yet —
    // `set-muted` is legal from `joining` precisely so it can be set that early.
    if (store().muted) client?.emit(GCALL_C2S.STATE, { callId: payload.callId, muted: true });
    syncMesh();
  });

  socket.on(GCALL_S2C.ROSTER, (payload: GroupCallRosterPayload) => {
    const s = store();
    if (s.callId !== payload.callId) return;
    s.dispatch({ type: 'roster', callId: payload.callId, participants: payload.participants });
    syncMesh();
  });

  socket.on(GCALL_S2C.PEER_JOINED, (payload: GroupCallPeerJoinedPayload) => {
    const s = store();
    if (s.callId !== payload.callId) return;
    // Idempotent by construction: the roster is a record keyed by userId, so a
    // duplicate for somebody already in it replaces their row rather than
    // adding a second, and `syncPeers` skips a leg that already exists.
    s.dispatch({ type: 'peer-joined', participant: payload.participant });
    syncMesh();
  });

  socket.on(GCALL_S2C.PEER_LEFT, (payload: GroupCallPeerLeftPayload) => {
    const s = store();
    if (s.callId !== payload.callId) return;
    s.dispatch({ type: 'peer-left', userId: payload.userId });
    syncMesh();
  });

  socket.on(GCALL_S2C.SIGNAL, (payload: GroupCallSignalRelayPayload) => {
    if (store().callId !== payload.callId) return;
    void mesh?.handleDescription(payload.from, payload.description);
  });

  socket.on(GCALL_S2C.ICE, (payload: GroupCallIceRelayPayload) => {
    if (store().callId !== payload.callId) return;
    void mesh?.handleCandidate(payload.from, payload.candidate);
  });

  socket.on(GCALL_S2C.STATE, (payload: GroupCallStateRelayPayload) => {
    const s = store();
    if (s.callId !== payload.callId) return;
    s.dispatch({ type: 'peer-muted', userId: payload.userId, muted: payload.muted });
  });

  socket.on(GCALL_S2C.ENDED, (payload: GroupCallEndedPayload) => {
    if (store().callId !== payload.callId) return;
    teardownMesh();
    store().dispatch({ type: 'end', reason: payload.reason });
  });

  socket.on(GCALL_S2C.REJECTED, (payload: GroupCallRejectedPayload) => {
    const s = store();
    // A refused `START` has no callId — there was no room to name. A refused
    // `JOIN` names the room, and one aimed at a room we are not in is stale.
    if (payload.callId && s.callId && payload.callId !== s.callId) return;
    teardownMesh();
    // `GroupCallRejectReason` is a subset of `GroupCallEndReason`, so it feeds
    // straight in without a translation table.
    s.dispatch({ type: 'end', reason: payload.reason });
  });

  socket.on(GCALL_S2C.ACTIVE, (payload: GroupCallActivePayload) => {
    const key = openRoomKey(payload.origin, payload.originId);
    store().setRoom(
      key,
      payload.callId
        ? {
            callId: payload.callId,
            origin: payload.origin,
            originId: payload.originId,
            participantCount: payload.participantCount,
            participants: payload.participants,
            full: isRosterFull(payload.participantCount),
          }
        : null,
    );
  });

  socket.on(GCALL_S2C.ERROR, (payload: GroupCallErrorPayload) => {
    store().setLastError(payload);
    console.warn('[group-calls]', payload.code, payload.message);
    // The server no longer believes we are in the room it is relaying for. No
    // amount of retrying fixes that, and staying "active" would leave the user
    // talking into a room that cannot hear them.
    const fatal = payload.code === 'unknown-call' || payload.code === 'not-participant';
    const s = store();
    if (!fatal || !s.callId || (payload.callId && payload.callId !== s.callId)) return;
    teardownMesh();
    store().dispatch({ type: 'end', reason: 'gone' });
  });
}

async function handleIncoming(payload: GroupCallIncomingPayload): Promise<void> {
  const selfId = await resolveSelfId();
  if (!selfId) return;

  const s = store();
  // Already in a room. The server guards this too, but a second ring must never
  // replace what is on screen — and leaving it ringing at a tab that will not
  // answer is what `declined` exists to prevent.
  if (isGroupCallBusy(s)) {
    client?.emit(GCALL_C2S.DECLINE, { callId: payload.callId });
    return;
  }

  s.setRinging(payload.from, payload.expiresAt);
  s.dispatch({
    type: 'incoming',
    callId: payload.callId,
    origin: payload.origin,
    originId: payload.originId,
    conversationId: payload.conversationId,
    // The starter is the host; the roster says so too, and is preferred because
    // a mid-call host handover would show up there first.
    hostId: payload.participants.find((p) => p.host)?.userId ?? payload.from.id,
    selfId,
    participants: payload.participants,
  });
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Open a room.
 *
 * For `community`/`party` this is create-or-join: the server puts us in the
 * live room if there is one rather than opening a second. `inviteeIds` is
 * `adhoc` only and ignored otherwise — nobody is rung into an open room.
 */
export async function startGroupCall(args: {
  origin: GroupCallOrigin;
  originId?: string;
  inviteeIds?: readonly string[];
  conversationId?: string;
}): Promise<void> {
  initGroupCalls();
  const s = store();
  if (isGroupCallBusy(s)) return;
  if (!groupCallSupported()) {
    s.setSelf({ micAvailable: false });
    return;
  }

  const selfId = await resolveSelfId();
  if (!selfId) return;
  if (isGroupCallBusy(store())) return;

  s.setLastError(null);
  // Enter `joining` before the round trip, so the room is on screen while we
  // wait and so a refusal has something to end — the same reason `dial` exists
  // in the 1:1 machine.
  s.dispatch({
    type: 'start',
    origin: args.origin,
    originId: args.originId ?? null,
    conversationId: args.conversationId ?? null,
    selfId,
  });

  if (!(await openLocalMedia())) {
    // Nothing was emitted, so there is nothing to take back.
    finish('failed', 'none');
    return;
  }
  // Giving up during the permission prompt is a normal thing to do, and a
  // `START` sent afterwards would ring people on behalf of somebody who left.
  if (store().phase !== 'joining') {
    teardownMesh();
    return;
  }

  const sent =
    client?.emit(GCALL_C2S.START, {
      origin: args.origin,
      originId: args.originId,
      conversationId: args.conversationId,
      inviteeIds: args.inviteeIds ? [...args.inviteeIds] : undefined,
    }) ?? false;
  // `emit` returns false when the socket is down, and drops the event. Saying
  // so beats waiting forever for a reply that is never coming.
  if (!sent) finish('failed', 'none');
}

/**
 * Enter a room we can name — accepting a ring, or walking into an open one.
 *
 * The microphone opens **before** `JOIN` reaches the server, so the permission
 * prompt belongs to the click that got here and a refusal costs nobody a
 * phantom participant.
 */
export async function joinGroupCall(callId: string): Promise<void> {
  initGroupCalls();
  const s = store();
  if (!groupCallSupported()) {
    s.setSelf({ micAvailable: false });
    return;
  }

  const wasRinging = s.phase === 'incoming';
  s.setLastError(null);
  s.dispatch({ type: 'join', callId });
  // `reduce` refuses a stale accept (a card that has since been replaced) and a
  // duplicate press, so this is where both are dropped.
  if (store().phase !== 'joining' || store().callId !== callId) return;

  if (!(await openLocalMedia())) {
    // A room that is ringing us has to be told; one we were walking into has
    // heard nothing from us at all.
    finish('failed', wasRinging ? 'decline' : 'none');
    return;
  }
  if (store().phase !== 'joining' || store().callId !== callId) {
    teardownMesh();
    return;
  }

  const sent = client?.emit(GCALL_C2S.JOIN, { callId }) ?? false;
  if (!sent) finish('failed', 'none');
}

/** Refuse a ring without joining. */
export function declineGroupCall(): void {
  if (store().phase !== 'incoming') return;
  finish('declined', 'decline');
}

/** Leave a room that carries on without us. */
export function leaveGroupCall(): void {
  const { phase } = store();
  if (phase === 'idle' || phase === 'ended') return;
  if (phase === 'incoming') {
    finish('declined', 'decline');
    return;
  }
  finish('left', 'leave');
}

/**
 * Host only: end the room for everyone.
 *
 * The host check is advisory — the server rejects a non-host `END` with
 * `not-host` — but doing it here keeps a mis-wired button from emitting an
 * event that will only ever come back as an error.
 */
export function endGroupCall(): void {
  const s = store();
  if (s.phase !== 'active' || !s.callId) return;
  if (s.hostId !== s.selfId) {
    leaveGroupCall();
    return;
  }
  finish('host-ended', 'end');
}

/** Ring more people into a running room. */
export function inviteToGroupCall(userIds: readonly string[]): void {
  const s = store();
  if (s.phase !== 'active' || !s.callId || userIds.length === 0) return;
  // The server truncates rather than refusing the whole invite; trimming here
  // means the UI's optimistic count agrees with what actually happens.
  client?.emit(GCALL_C2S.INVITE, {
    callId: s.callId,
    userIds: [...userIds].slice(0, MAX_GROUP_CALL_INVITES),
  });
}

/**
 * Mute or unmute ourselves.
 *
 * The tracks are silenced first and the room is told second: the two can
 * disagree if the socket is down, and of the two the one that must be true is
 * that the microphone is off.
 */
export function toggleGroupMute(): void {
  const s = store();
  if (s.phase !== 'joining' && s.phase !== 'active') return;
  const muted = !s.muted;
  mesh?.setMuted(muted);
  s.dispatch({ type: 'set-muted', muted });
  s.setSelf(muted ? { muted, speaking: false, level: 0 } : { muted });
  if (s.callId) client?.emit(GCALL_C2S.STATE, { callId: s.callId, muted });
}

/** Dismiss the ended-room card and go back to idle. */
export function dismissGroupCall(): void {
  teardownMesh();
  const s = store();
  s.dispatch({ type: 'reset' });
  s.setRinging(null, null);
  s.setStartedAt(null);
  s.setLastError(null);
  s.setSelf({ speaking: false, level: 0, micDenied: false });
}

/**
 * Ask whether a community/party has a live voice room.
 *
 * Fire and forget: the answer arrives as `ACTIVE` and lands in `rooms`, which
 * is also where the unprompted pushes land when a room opens or closes. Read it
 * with {@link selectOpenRoom} so a pill stays live without polling.
 */
export function lookupOpenRoom(ref: OpenRoomRef): void {
  initGroupCalls();
  client?.emit(GCALL_C2S.LOOKUP, { origin: ref.origin, originId: ref.originId });
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/*
 * These are plain functions over the store, not hooks. The ones that build an
 * array return a new one each call, so subscribe through `useShallow` (or
 * memoise on `state.participants` / `state.peers`) rather than passing them
 * straight to `useGroupCallStore` — an unmemoised array selector re-renders on
 * every store write, and the level meters write twelve times a second.
 */

/** Remote tiles in render order: people who are in, oldest first, then ringing. */
export function selectGroupCallPeers(state: GroupCallStore): GroupCallPeerView[] {
  const out: GroupCallPeerView[] = [];
  for (const participant of rosterList(state)) {
    const view = state.peers[participant.userId];
    if (view) out.push(view);
  }
  return out;
}

/** Our own roster row, once the server has sent one. */
export function selectSelfParticipant(state: GroupCallStore): GroupCallParticipantView | null {
  return state.selfId ? (state.participants[state.selfId] ?? null) : null;
}

/** Are we the host? Decides whether "End for everyone" is offered. */
export function selectIsHost(state: GroupCallStore): boolean {
  return Boolean(state.selfId) && state.hostId === state.selfId;
}

/** Ad-hoc only: invited, still ringing, not in yet. */
export function selectPendingInvitees(state: GroupCallStore): GroupCallParticipantView[] {
  return pendingInvitees(state);
}

/**
 * The live open room for a community/party, if we have looked.
 *
 * `undefined` = never asked (render nothing), `null` = asked and there is none.
 */
export function selectOpenRoom(
  state: GroupCallStore,
  ref: OpenRoomRef,
): GroupCallRoomSummary | null | undefined {
  return state.rooms[openRoomKey(ref.origin, ref.originId)];
}
