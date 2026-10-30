/**
 * A generic peer-to-peer signalling registry for the games hub (PLAN §0.12):
 * the state machine every "match runs in the host's browser" app needs, with
 * no event names, payload shapes or app rules in it. An app handler (today
 * handlers/balatro-p2p.ts) owns the socket events and decides what to emit;
 * this module owns the rooms.
 *
 *   - **Rooms:** code, resume token, the host's socket / account / peer id,
 *     members in join order (`joinSeq`), kicked accounts, the named successor
 *     and the per-member relay budgets. Codes are claimed through the app's
 *     generator and checked against the live rooms.
 *   - **Admission:** members are added pending; the host admits them. A
 *     member's peer id carries its relay slot (lib/shared/p2p/relay.ts
 *     `peerIdWithSlot`), so the host knows where to address relay frames.
 *   - **Signals** route host ↔ admitted member only (`routeSignal`).
 *   - **Relay fallback:** `startRelay` marks a member relayed (capped per
 *     room); `relay` checks the frame, spends the direction's token bucket and
 *     says where to forward it. Unreliable frames past the budget drop;
 *     reliable ones may run a bounded debt, past which the verdict is
 *     `overflow` (the app cuts that member off the relay).
 *   - **Host grace and promotion:** when the host's socket goes, the room is
 *     held (`hostDisconnected`) for the app's grace; on expiry the app's
 *     `onHostTimeout` decides (promote `successorFor(room)` or close).
 *     `promote` moves a member into the host seat with a fresh token.
 *   - **Resume:** a host that reconnects proves the room with its token.
 *
 * Time and timers are injectable (`now`, `setTimer`) for tests. Single
 * process, in memory (server/CLAUDE.md gotcha 1).
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import { randomBytes } from 'node:crypto';
import { decodeRelay, encodeRelay, peerIdWithSlot, RELAY_MAX_SLOT } from '../../../lib/shared/p2p/relay';

export interface HubAccount {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface SignalHubLimits {
  PEER_ID_LENGTH: number;
  TOKEN_LENGTH: number;
  MAX_ROOMS: number;
}

export interface SignalHubRelayLimits {
  MAX_PEERS_PER_ROOM: number;
  BYTES_PER_SEC: number;
  BURST_BYTES: number;
  MAX_DEBT_BYTES: number;
  MAX_PACKET_BYTES: number;
}

/** Unreliable relayed payloads above this are dropped (the DataChannel MTU rule holds over the relay too). */
export const RELAY_MAX_UNRELIABLE_BYTES = 1_300;

export interface Bucket {
  tokens: number;
  at: number;
}

export interface HubMember<M> {
  peerId: string;
  /** null while the member's hub socket is gone (the seat is kept; the app decides for how long). */
  socketId: string | null;
  account: HubAccount;
  /** App-defined (Balatro: 'player' | 'spectator'). */
  role: string;
  /** Relay slot, 1…127 (also the last two hex digits of `peerId`). */
  slot: number;
  /** Join order across the room's life (earliest-joined wins a promotion). */
  joinSeq: number;
  admitted: boolean;
  relay: boolean;
  /** member → host and host → member relay budgets. */
  up: Bucket;
  down: Bucket;
  meta: M;
}

export interface HubRoom<R, M> {
  code: string;
  token: string;
  hostSocketId: string | null;
  hostPeerId: string;
  host: HubAccount;
  /** peerId → member, in insertion order. */
  members: Map<string, HubMember<M>>;
  /** Kicked userIds: refused at the door for the room's life. */
  kicked: Set<string>;
  /** The member the host named to take over (a peer id), or null. */
  successor: string | null;
  /** When the host's socket went (ms), or null while it is connected. */
  hostGoneAt: number | null;
  hostGoneTimer: unknown;
  closed: boolean;
  migrations: number;
  nextJoinSeq: number;
  createdAt: number;
  meta: R;
}

export type RelayVerdict<R, M> =
  | { kind: 'forward'; room: HubRoom<R, M>; member: HubMember<M>; toSocketId: string; frame: Uint8Array; reliable: boolean }
  | { kind: 'drop' }
  | { kind: 'overflow'; room: HubRoom<R, M>; member: HubMember<M> };

export interface SignalHubOptions<R, M> {
  limits: SignalHubLimits;
  relay: SignalHubRelayLimits;
  /** A candidate room code (the hub checks it against live rooms). */
  generateCode: () => string;
  /** The host's grace ran out (it never came back): promote or close. */
  onHostTimeout: (room: HubRoom<R, M>) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  randomId?: (length: number) => string;
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Uniform-enough alphanumerics from the CSPRNG (tokens are secrets). */
export function randomAlnum(length: number): string {
  const bytes = randomBytes(length * 2);
  let out = '';
  for (let i = 0; out.length < length; i += 1) {
    if (i >= bytes.length) return out + randomAlnum(length - out.length);
    // 248 = 4 × 62: reject the tail so every character is equally likely.
    if (bytes[i] < 248) out += ALNUM[bytes[i] % ALNUM.length];
  }
  return out;
}

function defaultSetTimer(fn: () => void, ms: number): unknown {
  const t = setTimeout(fn, ms);
  (t as { unref?: () => void }).unref?.();
  return t;
}

export class SignalHub<R, M> {
  readonly rooms = new Map<string, HubRoom<R, M>>();
  /** socket id → the code it hosts. */
  private readonly hosting = new Map<string, string>();
  /** socket id → the room and member it is. */
  private readonly membership = new Map<string, { code: string; peerId: string }>();
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly randomId: (length: number) => string;

  constructor(private readonly opts: SignalHubOptions<R, M>) {
    this.now = opts.now ?? (() => Date.now());
    this.setTimer = opts.setTimer ?? defaultSetTimer;
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.randomId = opts.randomId ?? randomAlnum;
  }

  // ─── Lookups ─────────────────────────────────────────────────────────────

  room(code: string): HubRoom<R, M> | null {
    const room = this.rooms.get(code);
    return room && !room.closed ? room : null;
  }

  /** The live room this socket hosts (and is still the host of). */
  hostedBy(socketId: string): HubRoom<R, M> | null {
    const code = this.hosting.get(socketId);
    const room = code ? this.room(code) : null;
    return room && room.hostSocketId === socketId ? room : null;
  }

  /** The room and member this socket is. */
  memberOf(socketId: string): { room: HubRoom<R, M>; member: HubMember<M> } | null {
    const where = this.membership.get(socketId);
    const room = where ? this.room(where.code) : null;
    const member = where && room ? room.members.get(where.peerId) : undefined;
    if (!room || !member || member.socketId !== socketId) return null;
    return { room, member };
  }

  // ─── Hosting ─────────────────────────────────────────────────────────────

  /** A code no live room uses, or null after a few collisions. */
  private freeCode(): string | null {
    for (let i = 0; i < 20; i += 1) {
      const code = this.opts.generateCode();
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  /**
   * A new room hosted by `socketId`. `reclaim` re-creates a room under a code and token the host
   * already holds (the hub restarted and forgot it) — only when that code is free.
   */
  host(
    socketId: string,
    account: HubAccount,
    meta: R,
    reclaim?: { code: string; token: string },
  ): HubRoom<R, M> | 'room-limit' | 'code-taken' {
    if (this.rooms.size >= this.opts.limits.MAX_ROOMS) return 'room-limit';
    let code: string | null;
    if (reclaim) {
      if (this.rooms.has(reclaim.code)) return 'code-taken';
      code = reclaim.code;
    } else {
      code = this.freeCode();
      if (!code) return 'room-limit';
    }
    const room: HubRoom<R, M> = {
      code,
      token: reclaim?.token ?? this.randomId(this.opts.limits.TOKEN_LENGTH),
      hostSocketId: socketId,
      hostPeerId: this.randomId(this.opts.limits.PEER_ID_LENGTH),
      host: account,
      members: new Map(),
      kicked: new Set(),
      successor: null,
      hostGoneAt: null,
      hostGoneTimer: null,
      closed: false,
      migrations: 0,
      nextJoinSeq: 1,
      createdAt: this.now(),
      meta,
    };
    this.rooms.set(code, room);
    this.hosting.set(socketId, code);
    return room;
  }

  /** The host's socket came back: same account, the secret it was given. */
  resume(socketId: string, account: HubAccount, code: string, token: string): HubRoom<R, M> | 'not-found' | 'not-host' {
    const room = this.room(code);
    if (!room) return 'not-found';
    if (room.token !== token || room.host.userId !== account.userId) return 'not-host';
    if (room.hostSocketId && room.hostSocketId !== socketId) this.hosting.delete(room.hostSocketId);
    room.hostSocketId = socketId;
    room.host = account;
    room.hostGoneAt = null;
    this.cancelHostTimer(room);
    this.hosting.set(socketId, room.code);
    return room;
  }

  private cancelHostTimer(room: HubRoom<R, M>): void {
    if (room.hostGoneTimer !== null) this.clearTimer(room.hostGoneTimer);
    room.hostGoneTimer = null;
  }

  /** The host's socket went: hold the room for `graceMs`, then `onHostTimeout`. */
  hostDisconnected(socketId: string, graceMs: (room: HubRoom<R, M>) => number): HubRoom<R, M> | null {
    const room = this.hostedBy(socketId);
    this.hosting.delete(socketId);
    if (!room) return null;
    room.hostSocketId = null;
    room.hostGoneAt = this.now();
    this.scheduleHostTimeout(room, graceMs(room));
    return room;
  }

  /** (Re)arm the host-gone timer. */
  scheduleHostTimeout(room: HubRoom<R, M>, ms: number): void {
    this.cancelHostTimer(room);
    room.hostGoneTimer = this.setTimer(() => {
      room.hostGoneTimer = null;
      if (room.closed || room.hostSocketId) return;
      this.opts.onHostTimeout(room);
    }, Math.max(0, ms));
  }

  // ─── Members ─────────────────────────────────────────────────────────────

  private freeSlot(room: HubRoom<R, M>): number {
    const used = new Set<number>();
    for (const m of room.members.values()) used.add(m.slot);
    for (let s = 1; s <= RELAY_MAX_SLOT; s += 1) if (!used.has(s)) return s;
    return 0;
  }

  /** A pending member (not admitted yet). Null when the room has no slot left. */
  addMember(room: HubRoom<R, M>, socketId: string, account: HubAccount, role: string, meta: M): HubMember<M> | null {
    const slot = this.freeSlot(room);
    if (!slot) return null;
    this.leaveCurrent(socketId);
    const member: HubMember<M> = {
      peerId: peerIdWithSlot(this.randomId(this.opts.limits.PEER_ID_LENGTH), slot, this.opts.limits.PEER_ID_LENGTH),
      socketId,
      account,
      role,
      slot,
      joinSeq: room.nextJoinSeq++,
      admitted: false,
      relay: false,
      up: this.bucket(),
      down: this.bucket(),
      meta,
    };
    room.members.set(member.peerId, member);
    this.membership.set(socketId, { code: room.code, peerId: member.peerId });
    return member;
  }

  /** Forget whatever member this socket was (a socket is in at most one room). */
  private leaveCurrent(socketId: string): void {
    const mine = this.memberOf(socketId);
    if (mine) this.removeMember(mine.room, mine.member);
    this.membership.delete(socketId);
  }

  removeMember(room: HubRoom<R, M>, member: HubMember<M>): boolean {
    if (room.members.get(member.peerId) !== member) return false;
    room.members.delete(member.peerId);
    if (room.successor === member.peerId) room.successor = null;
    if (member.socketId && this.membership.get(member.socketId)?.peerId === member.peerId) {
      this.membership.delete(member.socketId);
    }
    return true;
  }

  /** The member's socket went; the entry (and its seat) stays, its relay stops. */
  detachMember(room: HubRoom<R, M>, member: HubMember<M>): void {
    if (member.socketId && this.membership.get(member.socketId)?.peerId === member.peerId) {
      this.membership.delete(member.socketId);
    }
    member.socketId = null;
    member.relay = false;
  }

  admit(member: HubMember<M>): void {
    member.admitted = true;
  }

  // ─── Signals ─────────────────────────────────────────────────────────────

  /**
   * Where a signal from `socketId` goes: the host names an admitted, connected member (`to`); a
   * member may only signal its host (`to` absent or the host's peer id) once admitted.
   */
  routeSignal(
    socketId: string,
    to: string | undefined,
  ): { room: HubRoom<R, M>; toSocketId: string; from: string } | 'not-found' | 'invalid' {
    const hosted = this.hostedBy(socketId);
    if (hosted) {
      const member = to ? hosted.members.get(to) : undefined;
      if (!member || !member.admitted || !member.socketId) return 'invalid';
      return { room: hosted, toSocketId: member.socketId, from: hosted.hostPeerId };
    }
    const mine = this.memberOf(socketId);
    if (!mine) return 'not-found';
    const { room, member } = mine;
    if (!member.admitted || (to !== undefined && to !== room.hostPeerId) || !room.hostSocketId) return 'invalid';
    return { room, toSocketId: room.hostSocketId, from: member.peerId };
  }

  // ─── Relay ───────────────────────────────────────────────────────────────

  private bucket(): Bucket {
    return { tokens: this.opts.relay.BURST_BYTES, at: this.now() };
  }

  relayedCount(room: HubRoom<R, M>): number {
    let n = 0;
    for (const m of room.members.values()) if (m.relay) n += 1;
    return n;
  }

  /** A member asks for the relay (its direct path failed). Idempotent. */
  startRelay(socketId: string): { room: HubRoom<R, M>; member: HubMember<M> } | 'not-found' | 'invalid' | 'full' {
    const mine = this.memberOf(socketId);
    if (!mine) return 'not-found';
    const { room, member } = mine;
    if (!member.admitted) return 'invalid';
    if (!member.relay) {
      if (this.relayedCount(room) >= this.opts.relay.MAX_PEERS_PER_ROOM) return 'full';
      member.relay = true;
      member.up = this.bucket();
      member.down = this.bucket();
    }
    return { room, member };
  }

  stopRelay(member: HubMember<M>): void {
    member.relay = false;
  }

  /** Refill, then take `bytes`. Unreliable: only if it fits. Reliable: always (a bounded debt). */
  private spend(b: Bucket, bytes: number, reliable: boolean): 'ok' | 'drop' | 'overflow' {
    const { BURST_BYTES, BYTES_PER_SEC, MAX_DEBT_BYTES } = this.opts.relay;
    const now = this.now();
    b.tokens = Math.min(BURST_BYTES, b.tokens + (Math.max(0, now - b.at) / 1000) * BYTES_PER_SEC);
    b.at = now;
    if (!reliable) {
      if (b.tokens < bytes) return 'drop';
      b.tokens -= bytes;
      return 'ok';
    }
    b.tokens -= bytes;
    return b.tokens < -MAX_DEBT_BYTES ? 'overflow' : 'ok';
  }

  /**
   * One relay frame from `socketId`: from the host it goes to the relayed member in its slot; from a
   * relayed member it goes to the host, re-stamped with the member's own slot (a member cannot speak
   * for another).
   */
  relay(socketId: string, bytes: Uint8Array): RelayVerdict<R, M> {
    if (bytes.byteLength > this.opts.relay.MAX_PACKET_BYTES) return { kind: 'drop' };
    const packet = decodeRelay(bytes);
    if (!packet) return { kind: 'drop' };
    if (!packet.reliable && packet.payload.byteLength > RELAY_MAX_UNRELIABLE_BYTES) return { kind: 'drop' };
    let room: HubRoom<R, M> | null;
    let member: HubMember<M> | undefined;
    let toHost: boolean;
    const hosted = this.hostedBy(socketId);
    if (hosted) {
      room = hosted;
      member = [...hosted.members.values()].find((m) => m.slot === packet.slot);
      toHost = false;
    } else {
      const mine = this.memberOf(socketId);
      room = mine?.room ?? null;
      member = mine?.member;
      toHost = true;
    }
    if (!room || !member || !member.relay) return { kind: 'drop' };
    const toSocketId = toHost ? room.hostSocketId : member.socketId;
    if (!toSocketId) return { kind: 'drop' };
    const verdict = this.spend(toHost ? member.up : member.down, packet.payload.byteLength, packet.reliable);
    if (verdict === 'drop') return { kind: 'drop' };
    if (verdict === 'overflow') return { kind: 'overflow', room, member };
    return {
      kind: 'forward',
      room,
      member,
      toSocketId,
      frame: encodeRelay(member.slot, packet.reliable, packet.payload),
      reliable: packet.reliable,
    };
  }

  // ─── Promotion and closing ───────────────────────────────────────────────

  /**
   * Who takes over: the host-named successor when it is still an admitted, connected member that
   * `eligible` accepts; else the earliest-joined such member; else null.
   */
  successorFor(room: HubRoom<R, M>, eligible: (m: HubMember<M>) => boolean = () => true): HubMember<M> | null {
    const ok = (m: HubMember<M> | undefined): m is HubMember<M> => !!m && m.admitted && !!m.socketId && eligible(m);
    const named = room.successor ? room.members.get(room.successor) : undefined;
    if (ok(named)) return named;
    let best: HubMember<M> | null = null;
    for (const m of room.members.values()) if (ok(m) && (!best || m.joinSeq < best.joinSeq)) best = m;
    return best;
  }

  /**
   * `member` becomes the host: it leaves the member list, keeps its peer id, and the room gets a
   * fresh resume token. Every other member is set back to pending (the new host admits them again)
   * with its relay stopped. Returns the previous host's account.
   */
  promote(room: HubRoom<R, M>, member: HubMember<M>): HubAccount {
    const previous = room.host;
    if (room.hostSocketId && this.hosting.get(room.hostSocketId) === room.code) this.hosting.delete(room.hostSocketId);
    this.cancelHostTimer(room);
    this.removeMember(room, member);
    room.hostSocketId = member.socketId;
    room.hostPeerId = member.peerId;
    room.host = member.account;
    room.token = this.randomId(this.opts.limits.TOKEN_LENGTH);
    room.successor = null;
    room.hostGoneAt = null;
    room.migrations += 1;
    if (member.socketId) this.hosting.set(member.socketId, room.code);
    for (const m of room.members.values()) {
      m.admitted = false;
      m.relay = false;
      m.up = this.bucket();
      m.down = this.bucket();
    }
    return previous;
  }

  /** Forget the room (the app has told its members). Returns the members it had. */
  close(room: HubRoom<R, M>): HubMember<M>[] {
    if (room.closed) return [];
    room.closed = true;
    this.cancelHostTimer(room);
    this.rooms.delete(room.code);
    if (room.hostSocketId && this.hosting.get(room.hostSocketId) === room.code) this.hosting.delete(room.hostSocketId);
    const members = [...room.members.values()];
    for (const m of members) {
      if (m.socketId && this.membership.get(m.socketId)?.code === room.code) this.membership.delete(m.socketId);
    }
    room.members.clear();
    return members;
  }

  /** Test seam: forget everything (timers included). */
  reset(): void {
    for (const room of [...this.rooms.values()]) this.close(room);
    this.hosting.clear();
    this.membership.clear();
  }
}
