/**
 * Hearthworks multiplayer — the Socket.io signalling contract on the games hub (`hearthworks:p2p:*`).
 *
 * The hub (features/hearthworks/server/p2p.ts) only signals: it lists rooms, vouches for
 * accounts, forwards WebRTC offers / answers / ICE candidates between a host and an admitted member,
 * hands out TURN credentials, relays opaque frames for a member whose direct path failed (under a byte
 * budget) and promotes a successor when the host goes. It carries no command, tick or world state; the
 * game itself runs in the host's browser (`./host.ts`, `./peer.ts`) over the WebRTC DataChannels.
 *
 * Both sides import this file: the hub validates every inbound payload with the C2S schemas
 * (`bindEvents`), the browser parses every S2C payload before a listener sees it (a buggy hub is still
 * just data). Dependency-free apart from zod and the shared P2P helpers, relative imports only: the
 * socket server's esbuild bundle pulls this file in verbatim (server/CLAUDE.md gotchas 7 and 8).
 */

import { z } from 'zod';
import type { ClientToServer, ServerToClient } from '@/lib/shared/realtime/contract';
import { zIceServers } from '@/lib/shared/p2p/ice';

/* ─── Limits ─────────────────────────────────────────────────────────────── */

export const HW_LIMITS = {
  /** Co-op worlds are small (design §5.4: 2–8 players). */
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  /** The `generateRoomCode` alphabet (server/socket-server/utils.ts): no I, O, 0 or 1. */
  CODE_RE: /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
  NAME_MAX: 40,
  /** A room password is short on purpose: it keeps strangers out of a listed room, it is not an account. */
  PASSWORD_MIN: 4,
  PASSWORD_MAX: 32,
  SDP_MAX_LENGTH: 16_384,
  CANDIDATE_MAX_LENGTH: 512,
  PEER_ID_LENGTH: 12,
  TOKEN_LENGTH: 24,
  /** How long the hub waits for a host to answer a `probe` before it counts as gone. */
  PROBE_MS: 5_000,
  /** A room whose host's socket went with nobody to take over is held this long for it to come back. */
  HOST_GRACE_MS: 30_000,
  /** With a successor, the hub waits only this long for a blip to heal before it hands the room over. */
  MIGRATE_GRACE_MS: 2_000,
  MAX_ROOMS: 500,
  /** Rooms in one `rooms` answer. */
  LIST_MAX: 50,
} as const;

/**
 * The hub relay's budget for members without a direct path. A snapshot (≤ ~150 KB for the largest
 * world) is one reliable burst that may run the bucket into debt; the tick stream afterwards is a few
 * KB/s. Reliable frames are never dropped (that would corrupt the stream): past `MAX_DEBT_BYTES` the
 * member is cut off the relay instead.
 */
export const HW_RELAY_LIMITS = {
  MAX_PEERS_PER_ROOM: 4,
  BYTES_PER_SEC: 48 * 1024,
  BURST_BYTES: 160 * 1024,
  MAX_DEBT_BYTES: 512 * 1024,
  /** A reliable fragment (`wire.ts` RELIABLE_CHUNK_BYTES) plus framing. */
  MAX_PACKET_BYTES: 16 * 1024 + 64,
} as const;

/* ─── Shared value schemas ───────────────────────────────────────────────── */

export const zCode = z.string().regex(HW_LIMITS.CODE_RE);
export const zPeerId = z.string().length(HW_LIMITS.PEER_ID_LENGTH);
export const zToken = z.string().length(HW_LIMITS.TOKEN_LENGTH);
export const zUserId = z.string().min(1).max(64);
const zName = z.string().max(64);
export { zIceServers };

export const zSdp = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1).max(HW_LIMITS.SDP_MAX_LENGTH),
});
export const zCandidate = z.object({
  candidate: z.string().max(HW_LIMITS.CANDIDATE_MAX_LENGTH),
  sdpMid: z.string().max(64).nullable(),
  sdpMLineIndex: z.number().int().min(0).max(64).nullable(),
});

/** The world's identity, as the room list shows it (never its contents). */
export const zWorldDigest = z.object({
  seed: z.number().int().min(0).max(2 ** 32),
  size: z.number().int().min(8).max(96),
});
export type WorldDigest = z.infer<typeof zWorldDigest>;

/** A relay frame as the server sees it (`Buffer` is a `Uint8Array`). */
const zRelayIn = z
  .instanceof(Uint8Array)
  .refine((b) => b.byteLength <= HW_RELAY_LIMITS.MAX_PACKET_BYTES, 'relay frame too large');

/** A relay frame as socket.io-client delivers it (an `ArrayBuffer`), normalised to bytes. */
const zRelayOut = z
  .union([z.instanceof(Uint8Array), z.instanceof(ArrayBuffer)])
  .transform((b) => (b instanceof Uint8Array ? b : new Uint8Array(b)))
  .refine((b) => b.byteLength <= HW_RELAY_LIMITS.MAX_PACKET_BYTES, 'relay frame too large');

export const zHubErrorCode = z.enum([
  'auth-required',
  'not-found',
  'full',
  'kicked',
  'rate-limited',
  'invalid',
  'room-limit',
  'not-host',
  /** The room is locked and the join carried no password. */
  'password-required',
  'wrong-password',
]);
export type HwHubErrorCode = z.infer<typeof zHubErrorCode>;

export const zRoomEntry = z.object({
  code: zCode,
  name: z.string().max(HW_LIMITS.NAME_MAX),
  host: zName,
  players: z.number().int().min(1).max(HW_LIMITS.MAX_PLAYERS),
  maxPlayers: z.number().int().min(HW_LIMITS.MIN_PLAYERS).max(HW_LIMITS.MAX_PLAYERS),
  world: zWorldDigest,
  /** Present (true) only when joining needs a password. The password itself never leaves the hub's memory. */
  locked: z.boolean().optional(),
});
export type HwRoomEntry = z.infer<typeof zRoomEntry>;

export const zRosterEntry = z.object({
  /** The account id: the player's id in the world, vouched by the hub. */
  id: zUserId,
  name: zName,
  host: z.boolean(),
});
export type HwRosterEntry = z.infer<typeof zRosterEntry>;

/* ─── C2S (client → hub) ─────────────────────────────────────────────────── */

/** Every event needs an account and has a SOCKET_RATE_LIMITS rule (server/socket-server/config.ts). */
export const HW_C2S = {
  'hearthworks:p2p:host': z.object({
    name: z.string().max(HW_LIMITS.NAME_MAX * 2),
    maxPlayers: z.number().int().min(HW_LIMITS.MIN_PLAYERS).max(HW_LIMITS.MAX_PLAYERS),
    world: zWorldDigest,
    /** Unlisted: joinable only with the code or an invite link. */
    private: z.boolean().optional(),
    /**
     * Lock the room: joiners must present this. The hub keeps only a salted hash, in memory, and never echoes it
     * (the room list says `locked: true`). Resending it with `resume` re-applies the lock to a room the hub forgot.
     */
    password: z.string().min(HW_LIMITS.PASSWORD_MIN).max(HW_LIMITS.PASSWORD_MAX).optional(),
    /** Reclaim a room after this socket reconnected (the token came with `hosted`). */
    resume: z.object({ code: zCode, token: zToken }).optional(),
  }),
  'hearthworks:p2p:list': z.object({}),
  'hearthworks:p2p:join': z.object({ code: zCode, password: z.string().max(HW_LIMITS.PASSWORD_MAX).optional() }),
  'hearthworks:p2p:admit': z.object({
    peerId: zPeerId,
    accept: z.boolean(),
    reason: z.enum(['full', 'host-refused']).optional(),
  }),
  /** A host names the member (`to`); a member signals only its host. */
  'hearthworks:p2p:signal': z
    .object({
      to: zPeerId.optional(),
      description: zSdp.optional(),
      candidate: zCandidate.optional(),
    })
    .refine((v) => !!v.description !== !!v.candidate, { message: 'exactly one of description or candidate' }),
  'hearthworks:p2p:relay:start': z.object({}),
  /** Binary; header = the shared `encodeRelay` (lib/shared/p2p/relay.ts). */
  'hearthworks:p2p:relay': zRelayIn,
  /** The host names the member that takes over if it leaves (null: nobody). */
  'hearthworks:p2p:successor': z.object({ peerId: zPeerId.nullable() }),
  'hearthworks:p2p:kick': z.object({ peerId: zPeerId }),
  /**
   * A member reports that its link to the host went silent. The hub asks the host's socket to answer a probe; if it
   * does not within `HW_LIMITS.PROBE_MS` the host is treated as gone NOW (the socket.io heartbeat alone would take
   * up to 45 s to notice a frozen tab or a vanished network) and the room is handed over.
   */
  'hearthworks:p2p:host-silent': z.object({}),
  /** A member leaves; a host hands the room to its successor, or closes it when nobody can take over. */
  'hearthworks:p2p:leave': z.object({}),
} as const satisfies Record<string, z.ZodType>;

/* ─── S2C (hub → client) ─────────────────────────────────────────────────── */

export const HW_S2C = {
  'hearthworks:p2p:hosted': z.object({
    code: zCode,
    token: zToken,
    peerId: zPeerId,
    /** STUN, then TURN with a short-lived credential minted for this account. */
    ice: zIceServers,
  }),
  'hearthworks:p2p:rooms': z.object({ rooms: z.array(zRoomEntry).max(HW_LIMITS.LIST_MAX) }),
  /** To the host. `userId` and `name` are the hub's, from the member's verified session. */
  'hearthworks:p2p:join-request': z.object({ peerId: zPeerId, userId: zUserId, name: zName }),
  /** To the joiner. */
  'hearthworks:p2p:joining': z.object({
    code: zCode,
    peerId: zPeerId,
    hostUserId: zUserId,
    hostName: zName,
    name: z.string().max(HW_LIMITS.NAME_MAX),
    maxPlayers: z.number().int().min(HW_LIMITS.MIN_PLAYERS).max(HW_LIMITS.MAX_PLAYERS),
    world: zWorldDigest,
  }),
  'hearthworks:p2p:admitted': z.object({ code: zCode, ice: zIceServers, hostPeerId: zPeerId }),
  'hearthworks:p2p:rejected': z.object({ code: zCode, reason: z.string().max(32) }),
  'hearthworks:p2p:signal': z.object({
    from: zPeerId,
    description: zSdp.optional(),
    candidate: zCandidate.optional(),
  }),
  'hearthworks:p2p:relay': zRelayOut,
  /** To the host. */
  'hearthworks:p2p:member-left': z.object({
    peerId: zPeerId,
    userId: zUserId,
    reason: z.enum(['left', 'kicked', 'disconnected']),
  }),
  /** To the host and every admitted member: who is in the room (hub membership, never game state). */
  'hearthworks:p2p:roster': z.object({ code: zCode, players: z.array(zRosterEntry).max(HW_LIMITS.MAX_PLAYERS) }),
  /** To every member but the new host: the room moved; wait to be admitted again. */
  'hearthworks:p2p:host-changed': z.object({ code: zCode, hostPeerId: zPeerId, hostUserId: zUserId, hostName: zName }),
  /** To the successor: the room is yours. */
  'hearthworks:p2p:promote': z.object({ code: zCode, token: zToken, peerId: zPeerId, ice: zIceServers }),
  /** To the host, with a socket.io ack: answered by the client library itself, so a frozen page cannot. */
  'hearthworks:p2p:probe': z.object({}),
  'hearthworks:p2p:closed': z.object({ code: zCode, reason: z.enum(['host-closed', 'host-lost']) }),
  'hearthworks:p2p:error': z.object({ event: z.string().max(64), code: zHubErrorCode }),
} as const satisfies Record<string, z.ZodType>;

/* ─── Derived views of the same contract ─────────────────────────────────── */

export type HwC2SEvent = keyof typeof HW_C2S;
export type HwS2CEvent = keyof typeof HW_S2C;
export type HwC2SPayload<K extends HwC2SEvent> = z.infer<(typeof HW_C2S)[K]>;
export type HwS2CPayload<K extends HwS2CEvent> = z.infer<(typeof HW_S2C)[K]>;

type C2SMap = typeof HW_C2S;
type S2CMap = typeof HW_S2C;
type MergedEvents = {
  [K in keyof C2SMap | keyof S2CMap]: (K extends keyof C2SMap ? { c2s: C2SMap[K] } : unknown) &
    (K extends keyof S2CMap ? { s2c: S2CMap[K] } : unknown);
};

function mergeEvents(): MergedEvents {
  const out: Record<string, { c2s?: z.ZodType; s2c?: z.ZodType }> = {};
  for (const [name, schema] of Object.entries(HW_C2S)) out[name] = { c2s: schema };
  for (const [name, schema] of Object.entries(HW_S2C)) out[name] = { ...out[name], s2c: schema };
  return out as MergedEvents;
}

/** `{ name: { c2s?, s2c? } }` — the shape `bindEvents` (server/shared/typed-socket.ts) takes. */
export const HW_EVENTS: MergedEvents = mergeEvents();

export type HwClientToServer = ClientToServer<typeof HW_EVENTS>;
export type HwServerToClient = ServerToClient<typeof HW_EVENTS>;

/** `{ name: name }` for every C2S event — the rate-limit coverage test's input. */
export const HW_C2S_EVENTS = Object.freeze(
  Object.fromEntries(Object.keys(HW_C2S).map((name) => [name, name])),
) as { readonly [K in HwC2SEvent]: K };

/** `{ name: name }` for every S2C event. */
export const HW_S2C_EVENTS = Object.freeze(
  Object.fromEntries(Object.keys(HW_S2C).map((name) => [name, name])),
) as { readonly [K in HwS2CEvent]: K };

/** A hub S2C payload, validated; null when it does not parse. */
export function parseS2C<K extends HwS2CEvent>(event: K, raw: unknown): HwS2CPayload<K> | null {
  const schema = (HW_S2C as Record<string, z.ZodType>)[event];
  if (!schema) return null;
  const r = schema.safeParse(raw);
  return r.success ? (r.data as HwS2CPayload<K>) : null;
}
