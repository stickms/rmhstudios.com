/**
 * Balatro multiplayer — the hub's directory (PLAN §3.a hub rules, WS1): the
 * signalling registry instance, what each room knows beyond signalling, and
 * the seat index.
 *
 *   - **Seats.** One seat per account across rooms. A host holds one in its
 *     room; a player holds one from the moment the host admits it until it
 *     leaves, is kicked, is forfeited (`forfeit-seat`) or the room closes. A
 *     seat survives the account's hub socket dropping (the host's own 120 s
 *     seat grace decides, then forfeits it). After a hub restart the host
 *     re-declares its seats with its first `state` (R-08).
 *   - **Kicked** accounts live on the room (`HubRoom.kicked`); **forfeited**
 *     `(runId, userId)` pairs live on the room's meta.
 *   - **Listing.** Spectatable rooms whose host is connected, for the
 *     spectate directory (`balatro:spectate:list`, MM-07).
 *
 * Single process, in memory (server/CLAUDE.md gotcha 1). Relative imports
 * only (gotcha 7).
 */

import type { z } from 'zod';
import { SignalHub, type HubMember, type HubRoom } from '../p2p/signal-hub';
import { generateRoomCode } from '../utils';
import { BALATRO_LIMITS, BALATRO_RELAY_LIMITS } from '../../../lib/balatro/net/limits';
import type { BALATRO_C2S, BALATRO_S2C, LobbyKind, QueueMode } from '../../../lib/balatro/net/events';

export type BalatroHostState = z.infer<(typeof BALATRO_C2S)['balatro:p2p:state']>;
export type BalatroLobbyListing = z.infer<(typeof BALATRO_S2C)['balatro:spectate:lobbies']>['lobbies'][number];
export type BalatroRole = 'player' | 'spectator';

export interface BalatroRoomMeta {
  kind: LobbyKind;
  queueMode: QueueMode;
  maxPlayers: number;
  contentHash: string;
  spectatable: boolean;
  /** The host's latest `balatro:p2p:state`, or null before the first. */
  state: BalatroHostState | null;
  /** userIds holding a seat here (the host included). */
  seats: Set<string>;
  /** `${runId}\n${userId}` pairs the host forfeited. */
  forfeited: Set<string>;
  /** Every peer id issued in this room (members and hosts) → its account, newest last (bounded). */
  peerUsers: Map<string, string>;
  /** Re-created by a host's `resume` after a hub restart: its first `state` re-declares the seats. */
  reclaimed: boolean;
  /**
   * HUD-24: per started run (newest last, bounded), the accounts the hub had seated while the host
   * declared it started (spectators never hold a seat), and whether its result went out.
   */
  rosters: Map<string, { users: Set<string>; sent: boolean }>;
}

export interface BalatroMemberMeta {
  /** A rejoin (the account held a seat here when it asked). */
  rejoin: boolean;
}

export type BalatroRoom = HubRoom<BalatroRoomMeta, BalatroMemberMeta>;
export type BalatroMember = HubMember<BalatroMemberMeta>;

const PEER_USERS_MAX = 256;
/** Runs per room whose roster the hub remembers (a lobby replays a few matches). */
export const ROSTERS_MAX = 4;

let onHostTimeout: ((room: BalatroRoom) => void) | null = null;

/** The handler (handlers/balatro-p2p.ts) decides what a host timeout does; it owns the sockets. */
export function setBalatroHostTimeoutHandler(fn: ((room: BalatroRoom) => void) | null): void {
  onHostTimeout = fn;
}

/** The registry: limits from lib/balatro/net/limits.ts (frozen). */
export const balatroHub = new SignalHub<BalatroRoomMeta, BalatroMemberMeta>({
  limits: {
    PEER_ID_LENGTH: BALATRO_LIMITS.PEER_ID_LENGTH,
    TOKEN_LENGTH: BALATRO_LIMITS.TOKEN_LENGTH,
    MAX_ROOMS: BALATRO_LIMITS.MAX_ROOMS,
  },
  relay: BALATRO_RELAY_LIMITS,
  generateCode: () => generateRoomCode(),
  onHostTimeout: (room) => onHostTimeout?.(room),
});

/** userId → the code of the room it holds a seat in. */
const seatIndex = new Map<string, string>();

export function newRoomMeta(init: Pick<BalatroRoomMeta, 'kind' | 'queueMode' | 'maxPlayers' | 'contentHash' | 'spectatable'>): BalatroRoomMeta {
  return {
    ...init,
    state: null,
    seats: new Set(),
    forfeited: new Set(),
    peerUsers: new Map(),
    reclaimed: false,
    rosters: new Map(),
  };
}

/** The live room this account holds a seat in, or null. */
export function seatOf(userId: string): BalatroRoom | null {
  const code = seatIndex.get(userId);
  if (!code) return null;
  const room = balatroHub.room(code);
  if (!room || !room.meta.seats.has(userId)) {
    seatIndex.delete(userId);
    return null;
  }
  return room;
}

/** Seat `userId` in `room`. False when it already holds a seat in another room. */
export function seat(room: BalatroRoom, userId: string): boolean {
  const held = seatOf(userId);
  if (held && held !== room) return false;
  room.meta.seats.add(userId);
  seatIndex.set(userId, room.code);
  return true;
}

export function unseat(room: BalatroRoom, userId: string): void {
  room.meta.seats.delete(userId);
  if (seatIndex.get(userId) === room.code) seatIndex.delete(userId);
}

export function unseatAll(room: BalatroRoom): void {
  for (const userId of [...room.meta.seats]) unseat(room, userId);
}

export function rememberPeer(room: BalatroRoom, peerId: string, userId: string): void {
  const map = room.meta.peerUsers;
  map.delete(peerId);
  map.set(peerId, userId);
  while (map.size > PEER_USERS_MAX) map.delete(map.keys().next().value as string);
}

/** The newest peer id this account had in the room, or null. */
export function lastPeerOf(room: BalatroRoom, userId: string): string | null {
  let found: string | null = null;
  for (const [peerId, id] of room.meta.peerUsers) if (id === userId) found = peerId;
  return found;
}

/**
 * HUD-24: the host says `runId` is running with `members` seated; the ones the hub itself seated
 * join that run's roster (a host cannot add an account it never admitted).
 */
export function recordRoster(room: BalatroRoom, runId: string, members: readonly string[]): void {
  const rosters = room.meta.rosters;
  let r = rosters.get(runId);
  if (!r) {
    r = { users: new Set(), sent: false };
    rosters.set(runId, r);
    while (rosters.size > ROSTERS_MAX) rosters.delete(rosters.keys().next().value as string);
  }
  for (const userId of members) if (room.meta.seats.has(userId)) r.users.add(userId);
}

function forfeitKey(runId: string, userId: string): string {
  return `${runId}\n${userId}`;
}

export function forfeit(room: BalatroRoom, runId: string, userId: string): void {
  room.meta.forfeited.add(forfeitKey(runId, userId));
}

/** Whether `userId` was forfeited from the room's current run. */
export function isForfeited(room: BalatroRoom, userId: string): boolean {
  const runId = room.meta.state?.runId;
  return !!runId && room.meta.forfeited.has(forfeitKey(runId, userId));
}

/** Players (host included) counted against `maxPlayers`, ignoring `exceptUserId`'s own entries. */
export function playerCount(room: BalatroRoom, exceptUserId?: string): number {
  let n = 1;
  for (const m of room.members.values()) {
    if (m.role === 'player' && m.account.userId !== exceptUserId) n += 1;
  }
  return n;
}

/** Connected spectators. */
export function spectatorCount(room: BalatroRoom): number {
  let n = 0;
  for (const m of room.members.values()) if (m.role === 'spectator' && m.socketId) n += 1;
  return n;
}

/** Spectatable rooms whose host is connected, newest first (≤ 50). */
export function listSpectatableLobbies(): BalatroLobbyListing[] {
  const rooms = [...balatroHub.rooms.values()]
    .filter((r) => !r.closed && r.hostSocketId && r.meta.spectatable)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);
  return rooms.map((r) => ({
    code: r.code,
    queueMode: r.meta.queueMode,
    players: r.meta.state?.summary.players ?? playerCount(r),
    ante: r.meta.state?.summary.ante ?? null,
  }));
}

/**
 * Players seated in matchmade (casual) rooms, per mode (Find Game's In Game, A12): the hub's own
 * seat count, so a host cannot inflate it.
 */
export function casualSeatsByMode(): Map<QueueMode, number> {
  const out = new Map<QueueMode, number>();
  for (const r of balatroHub.rooms.values()) {
    if (r.closed || r.meta.kind !== 'casual') continue;
    out.set(r.meta.queueMode, (out.get(r.meta.queueMode) ?? 0) + r.meta.seats.size);
  }
  return out;
}

/** Test seam: forget every room and seat. */
export function resetBalatroDirectoryForTests(): void {
  balatroHub.reset();
  seatIndex.clear();
}
