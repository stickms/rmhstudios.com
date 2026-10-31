/**
 * Peer-to-peer play — the signaling contract on the games hub (`tf2:p2p:*`,
 * names in `../events.ts`), the relay header, and the limits both sides hold.
 *
 * The hub never carries game traffic for a P2P room unless a member cannot
 * connect directly: it announces rooms, vouches for accounts (a join request
 * reaches the host with the hub-verified user id and name — the host never
 * trusts what a peer says about itself), forwards WebRTC offers / answers /
 * ICE candidates between the host and ONE member, and, as a fallback, relays
 * that member's opaque packets under a byte budget. It never simulates.
 *
 * Every payload a client sends is parsed with these schemas on the hub, and
 * every hub-relayed payload is parsed again by the receiving browser (a
 * compromised or buggy hub is still just data).
 *
 * Environment-agnostic; no `@/` specifiers (the hub imports it relatively).
 */

import { z } from 'zod';

import type { IceServerConfig } from './ice';
import { zIceServers } from '../../../shared/p2p/ice';
import {
  BOT_DIFFICULTIES,
  ROOM_GAMES,
  ROOM_MODES,
  TF2_LIMITS,
  type RoomGame,
  type RoomMode,
  TF2_ROOM_CODE_RE,
  type BotDifficulty,
  type RoomPlayerInfo,
  type RoomState,
  type RoundInfo,
} from '../events';

// ─── Limits ────────────────────────────────────────────────────────────────

export const P2P_LIMITS = {
  /** An SDP blob (a data-channel-only offer is ~1–3 KB; leave room for many candidates). */
  SDP_MAX_LENGTH: 16_384,
  /** One ICE candidate line. */
  CANDIDATE_MAX_LENGTH: 512,
  /** Hub-issued member ids. */
  PEER_ID_LENGTH: 12,
  /** The resume secret a host gets with its code (reclaims the room after a hub blip). */
  TOKEN_LENGTH: 24,
  /** A room whose host's hub connection dropped is held this long for it to come back. */
  HOST_GRACE_MS: 30_000,
  /** A member that dropped keeps its seat on the host this long (rejoin by code). */
  SEAT_GRACE_MS: 30_000,
  /** Members waiting or connected, per room (the host's own seat not included). */
  MAX_MEMBERS: TF2_LIMITS.P2P_MAX_PLAYERS - 1,
  /** Hosted rooms the hub tracks at once (signaling only: cheap, but bounded). */
  MAX_ROOMS: 500,
  /**
   * Host migration: a host whose hub connection drops is given this long to come back (a blip)
   * before its named successor takes the match over. A host that leaves on purpose hands over at once.
   */
  MIGRATE_GRACE_MS: 2_000,
  /** A room password (`tf2:room:admin`), at most. */
  PASSWORD_MAX_LENGTH: 32,
} as const;

/** The hub's relay fallback — opaque packets for members without a direct path. */
export const P2P_RELAY_LIMITS = {
  /** Relayed members per room (the hub's bandwidth is shared by every game). */
  MAX_PEERS_PER_ROOM: 4,
  /** Sustained bytes per second per relayed member, per direction. */
  BYTES_PER_SEC: 32 * 1024,
  /** Bucket depth: a burst (a full snapshot after a join) may borrow this much. */
  BURST_BYTES: 64 * 1024,
  /**
   * Reliable packets are never dropped (that would break the stream); they may
   * run the bucket into debt, and a member whose debt passes this is cut off
   * the relay (`relay-overflow`) rather than allowed to eat the hub.
   */
  MAX_DEBT_BYTES: 256 * 1024,
  /** Largest relayed packet: a reliable fragment (`wire.ts` RELIABLE_CHUNK_BYTES) plus framing. */
  MAX_PACKET_BYTES: 16 * 1024 + 64,
  /** Largest unreliable relayed packet (the DataChannel MTU rule holds over the relay too). */
  MAX_UNRELIABLE_BYTES: 1_300,
} as const;

/**
 * The two-byte relay header: flags (bit 0 = reliable) · member slot (1…127).
 * Shared with other peer-to-peer apps: lib/shared/p2p/relay.ts.
 */
export { RELAY_HEADER_BYTES, RELAY_FLAG_RELIABLE, encodeRelay, decodeRelay } from '../../../shared/p2p/relay';

/** ICE servers as the hub hands them out (parsed again by the browser before use): lib/shared/p2p/ice.ts. */
export { zIceServers };

// ─── Payloads ──────────────────────────────────────────────────────────────

export interface P2pHostPayload {
  /** Absent: TF2. */
  game?: RoomGame;
  map: string;
  mode?: RoomMode;
  maxPlayers: number;
  botCount: number;
  botDifficulty: BotDifficulty;
  name: string;
  private?: boolean;
  /** TF2: respawn a second after dying (the host's match option; the hub only passes it on). */
  instantRespawn?: boolean;
  /** Reclaim a room after this socket reconnected (the token came with `P2P_HOSTED`). */
  resume?: { code: string; token: string };
}

export interface P2pHostedPayload {
  code: string;
  token: string;
  /** The hosting account as the hub knows it (the name players see). */
  hostName: string;
  hostUserId: string;
  resumed: boolean;
  relay: { maxPeers: number; bytesPerSec: number };
  /**
   * ICE servers for this account, in the order to try them: STUN, then TURN with a short-lived
   * credential minted for it (lib/call/ice.ts; none without a TURN server). The hub relay is last.
   */
  ice?: IceServerConfig[];
}

/** The host names the member that takes the match over if it leaves (null: nobody). */
export interface P2pSuccessorPayload {
  peerId: string | null;
}

/** To the new host: the room is yours (the previous host left); its members are asking to rejoin. */
export interface P2pPromotedPayload {
  hosted: P2pHostedPayload;
  /** The previous host's account name ("Host migrated to …" is told to everyone else). */
  previousHost: string;
}

/** To every other member: the match moves to another member's browser; wait to be admitted again. */
export interface P2pMigratingPayload {
  code: string;
  /** The new host's account name. */
  host: string;
}

/** The host's digest of its match, for the server browser. */
export interface P2pUpdatePayload {
  state: RoomState;
  /** The map now (a level change moves the room in the browser; checked against the allowlist). */
  map?: string;
  players: RoomPlayerInfo[];
  teamScores: [number, number];
  round: RoundInfo | null;
}

export interface P2pJoinPayload {
  code: string;
  /** Join as a spectator (decided with the join, never a team switch after it). */
  spectate?: boolean;
  /** This browser may take the match over if the host leaves (host migration). Default true. */
  canHost?: boolean;
  /** The room's password, when it has one. */
  password?: string;
}

/** To the host. `userId` and `name` are the hub's, from the member's verified session. */
export interface P2pJoinRequest {
  code: string;
  peerId: string;
  userId: string;
  name: string;
  spectate?: boolean;
  canHost?: boolean;
}

export type P2pRefusal = 'full' | 'kicked' | 'refused';

export interface P2pAdmitPayload {
  peerId: string;
  accept: boolean;
  reason?: P2pRefusal;
}

export interface P2pAdmittedPayload {
  code: string;
  peerId: string;
  /** The host's account name. */
  host: string;
  game?: RoomGame;
  map: string;
  mode: RoomMode;
  name: string;
  maxPlayers: number;
  /** ICE servers for this account (STUN, then TURN with a short-lived credential). */
  ice?: IceServerConfig[];
}

export interface P2pKickPayload {
  peerId: string;
}

export interface SessionDescriptionLike {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface IceCandidateLike {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/** Client → hub. A host names the member (`to`); a member always signals its host. */
export interface P2pSignalOut {
  to?: string;
  description?: SessionDescriptionLike;
  /** null = end of candidates. */
  candidate?: IceCandidateLike | null;
}

/** Hub → client. `from` is a member's peer id, or `host`. */
export interface P2pSignalIn {
  code: string;
  from: string;
  description?: SessionDescriptionLike;
  candidate?: IceCandidateLike | null;
}

export interface P2pRelayStartPayload {
  /** The host names the member; a member asks for itself. */
  peerId?: string;
}

export interface P2pRelayReadyPayload {
  code: string;
  peerId: string;
  /** The member's slot in the relay header. */
  slot: number;
}

export interface P2pPeerLeftPayload {
  peerId: string;
}

export type P2pCloseReason = 'host-left' | 'host-closed' | 'kicked' | 'refused' | 'full' | 'relay-overflow';

export interface P2pClosedPayload {
  code: string;
  reason: P2pCloseReason;
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const roomCode = z.string().regex(TF2_ROOM_CODE_RE);
const peerId = z.string().regex(/^[A-Za-z0-9]{12}$/);

export const zP2pHost = z.object({
  game: z.enum(ROOM_GAMES as [RoomGame, ...RoomGame[]]).optional(),
  map: z.string().min(1).max(64),
  mode: z.enum(ROOM_MODES as [RoomMode, ...RoomMode[]]).optional(),
  maxPlayers: z.number().int().min(TF2_LIMITS.MIN_PLAYERS).max(TF2_LIMITS.P2P_MAX_PLAYERS),
  botCount: z.number().int().min(0).max(TF2_LIMITS.P2P_MAX_PLAYERS - 1),
  botDifficulty: z.enum(BOT_DIFFICULTIES as [BotDifficulty, ...BotDifficulty[]]),
  name: z.string().max(TF2_LIMITS.ROOM_NAME_MAX_LENGTH * 2),
  private: z.boolean().optional(),
  instantRespawn: z.boolean().optional(),
  resume: z.object({ code: roomCode, token: z.string().regex(/^[A-Za-z0-9]{24}$/) }).optional(),
});

const playerInfo = z.object({
  name: z.string().max(64),
  team: z.number().int().min(0).max(3),
  cls: z.number().int().min(0).max(9),
  score: z.number().int().min(-1_000_000).max(1_000_000),
  bot: z.boolean(),
});

const roundInfo = z
  .object({
    state: z.string().max(32),
    timeLeft: z.number().finite().min(0).max(86_400).nullable(),
  })
  .nullable();

export const zP2pUpdate = z.object({
  state: z.enum(['loading', 'running']),
  map: z.string().min(1).max(64).optional(),
  players: z.array(playerInfo).max(TF2_LIMITS.MAX_PLAYERS),
  teamScores: z.tuple([z.number().int().min(0).max(10_000), z.number().int().min(0).max(10_000)]),
  round: roundInfo,
});

export const zP2pJoin = z.object({
  code: roomCode,
  spectate: z.boolean().optional(),
  canHost: z.boolean().optional(),
  password: z.string().max(P2P_LIMITS.PASSWORD_MAX_LENGTH).optional(),
});

/** `tf2:p2p:close` — `migrate`: hand the match to the named successor instead of ending it. */
export const zP2pClose = z
  .object({ migrate: z.boolean().optional() })
  .catch({});

export const zP2pSuccessor = z.object({ peerId: peerId.nullable() });

export const zP2pAdmit = z.object({
  peerId,
  accept: z.boolean(),
  reason: z.enum(['full', 'kicked', 'refused']).optional(),
});

export const zP2pKick = z.object({ peerId });

const description = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1).max(P2P_LIMITS.SDP_MAX_LENGTH),
});

const candidate = z.object({
  candidate: z.string().max(P2P_LIMITS.CANDIDATE_MAX_LENGTH),
  sdpMid: z.string().max(32).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(16).nullable().optional(),
  usernameFragment: z.string().max(64).nullable().optional(),
});

/** Exactly one of a description or a candidate (null candidate = end of candidates). */
export const zP2pSignal = z
  .object({
    to: peerId.optional(),
    description: description.optional(),
    candidate: candidate.nullable().optional(),
  })
  .refine((s) => (s.description === undefined) !== (s.candidate === undefined), {
    message: 'one of description or candidate',
  });

/** What a browser accepts from the hub on `P2P_SIGNAL`. */
export const zP2pSignalIn = z
  .object({
    code: roomCode,
    from: z.union([z.literal('host'), peerId]),
    description: description.optional(),
    candidate: candidate.nullable().optional(),
  })
  .refine((s) => (s.description === undefined) !== (s.candidate === undefined));

export const zP2pRelayStart = z.object({ peerId: peerId.optional() });

export const zP2pHosted = z.object({
  code: roomCode,
  token: z.string().regex(/^[A-Za-z0-9]{24}$/),
  hostName: z.string().max(64),
  hostUserId: z.string().min(1).max(128),
  resumed: z.boolean(),
  relay: z.object({ maxPeers: z.number().int().min(0), bytesPerSec: z.number().int().min(0) }),
  ice: zIceServers.optional(),
});

export const zP2pPromoted = z.object({ hosted: zP2pHosted, previousHost: z.string().max(64) });

export const zP2pMigrating = z.object({ code: roomCode, host: z.string().max(64) });

export const zP2pJoinRequest = z.object({
  code: roomCode,
  peerId,
  userId: z.string().min(1).max(128),
  name: z.string().max(64),
  spectate: z.boolean().optional(),
  canHost: z.boolean().optional(),
});

export const zP2pAdmitted = z.object({
  code: roomCode,
  peerId,
  host: z.string().max(64),
  game: z.enum(ROOM_GAMES as [RoomGame, ...RoomGame[]]).optional(),
  map: z.string().max(64),
  mode: z.enum(ROOM_MODES as [RoomMode, ...RoomMode[]]),
  name: z.string().max(TF2_LIMITS.ROOM_NAME_MAX_LENGTH * 2),
  maxPlayers: z.number().int().min(TF2_LIMITS.MIN_PLAYERS).max(TF2_LIMITS.MAX_PLAYERS),
  ice: zIceServers.optional(),
});

export const zP2pRelayReady = z.object({
  code: roomCode,
  peerId,
  slot: z.number().int().min(1).max(127),
});

export const zP2pPeerLeft = z.object({ peerId });

export const zP2pClosed = z.object({
  code: roomCode,
  reason: z.enum(['host-left', 'host-closed', 'kicked', 'refused', 'full', 'relay-overflow']),
});
