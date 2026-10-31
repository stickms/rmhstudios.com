/**
 * Balatro multiplayer — the Socket.io signalling contract (PLAN §3.a, frozen).
 *
 * The hub (server/socket-server/handlers/balatro-p2p.ts, balatro-queue.ts)
 * only signals, relays and keeps the seat/queue directory; every game message
 * travels peer-to-peer (lib/balatro/mp/wire.ts). Browser-free, relative
 * imports only: the socket server's esbuild bundle pulls this file in as-is.
 *
 * ## WS0 resolutions of gaps in the PLAN text (binding for every stream)
 *
 * 1. **Two shapes of the same contract.** The PLAN writes
 *    `BALATRO_C2S = defineEvents({ name: schema })`, but the repo's
 *    `defineEvents` (lib/shared/realtime/contract.ts) takes `{ name: { c2s, s2c } }`,
 *    and `lib/__tests__/socket-rate-limit-coverage.test.ts` wants a
 *    `Record<string, eventName>`. So this file exports:
 *    - `BALATRO_C2S` / `BALATRO_S2C`: `{ eventName: zodSchema }` exactly as in the PLAN;
 *    - `BALATRO_EVENTS`: the merged `{ eventName: { c2s?, s2c? } }` map for
 *      `bindEvents` (server/shared/typed-socket.ts) and the typed client;
 *    - `BALATRO_C2S_EVENTS`: `{ eventName: eventName }` for the rate-limit
 *      coverage test (WS1 adds `['balatro', BALATRO_C2S_EVENTS]`).
 * 2. **`zIceServers`.** The PLAN says "re-export lib/shared/p2p/ice zIceServers",
 *    which WS1 creates in wave 1. Until then this file declares the identical
 *    schema (same rules as lib/tf2-game/net/p2p/signal.ts). WS1 replaces the
 *    declaration with `export { zIceServers } from '../../shared/p2p/ice'` —
 *    that is the only edit WS1 may make here.
 * 3. **Binary relay.** C2S relay frames arrive at the server as a `Buffer`
 *    (a `Uint8Array`). S2C relay frames reach socket.io-client as an
 *    `ArrayBuffer`, so the S2C schema accepts both and yields a `Uint8Array`.
 *    Both are capped at `BALATRO_RELAY_LIMITS.MAX_PACKET_BYTES`.
 * 4. **Unconstrained ids.** `userId`/`hostUserId` fields the PLAN leaves as
 *    bare `z.string()` are capped at 64 (the same cap as `members`).
 */

import { z } from 'zod';
import type { ClientToServer, ServerToClient } from '../../shared/realtime/contract';
import { BALATRO_LIMITS, BALATRO_RELAY_LIMITS } from './limits';
import { zIceServers } from '../../shared/p2p/ice';

/* ─── Shared value schemas ───────────────────────────────────────────────── */

export const zCode = z.string().regex(BALATRO_LIMITS.CODE_RE);
export const zPeerId = z.string().length(BALATRO_LIMITS.PEER_ID_LENGTH);
export const zToken = z.string().length(BALATRO_LIMITS.TOKEN_LENGTH);
export const zUserId = z.string().min(1).max(64);
export const zQueueMode = z.enum([
  'pvp_nemesis',
  'pvp_royale',
  'pvp_manhunt',
  'pvp_teams',
  'pvp_smallworld',
]);
export type QueueMode = z.infer<typeof zQueueMode>;
export const zLobbyKind = z.enum(['private', 'casual', 'party']);
export type LobbyKind = z.infer<typeof zLobbyKind>;
export const zContentHash = z.string().regex(BALATRO_LIMITS.CONTENT_HASH_RE);
export const zSdp = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().max(BALATRO_LIMITS.SDP_MAX_LENGTH),
});
export const zCandidate = z.object({
  candidate: z.string().max(BALATRO_LIMITS.CANDIDATE_MAX_LENGTH),
  sdpMid: z.string().max(64).nullable(),
  sdpMLineIndex: z.number().int().min(0).max(64).nullable(),
});

/** Resolution 2 above: the shared schema (lib/shared/p2p/ice.ts), re-exported. */
export { zIceServers };

export const zRole = z.enum(['player', 'spectator']);

/** A relay frame as the server sees it (`Buffer` is a `Uint8Array`). */
const zRelayIn = z
  .instanceof(Uint8Array)
  .refine((b) => b.byteLength <= BALATRO_RELAY_LIMITS.MAX_PACKET_BYTES, 'relay frame too large');

/** A relay frame as socket.io-client delivers it (an `ArrayBuffer`), normalised to bytes. */
const zRelayOut = z
  .union([z.instanceof(Uint8Array), z.instanceof(ArrayBuffer)])
  .transform((b) => (b instanceof Uint8Array ? b : new Uint8Array(b)))
  .refine((b) => b.byteLength <= BALATRO_RELAY_LIMITS.MAX_PACKET_BYTES, 'relay frame too large');

export const zAdmitReason = z.enum(['full', 'started', 'version-mismatch', 'host-refused']);
export const zHubErrorCode = z.enum([
  'auth-required',
  'not-found',
  'full',
  'started',
  'kicked',
  'forfeited',
  'version-mismatch',
  'seat-held',
  'rate-limited',
  'invalid',
  'room-limit',
  'not-host',
]);
export type BalatroHubErrorCode = z.infer<typeof zHubErrorCode>;

/* ─── C2S (client → hub) ─────────────────────────────────────────────────── */

/** Every event has a SOCKET_RATE_LIMITS rule (WS1) and needs an account. */
export const BALATRO_C2S = {
  'balatro:p2p:host': z.object({
    kind: zLobbyKind,
    queueMode: zQueueMode,
    maxPlayers: z.number().int().min(2).max(BALATRO_LIMITS.MAX_PLAYERS),
    contentHash: zContentHash,
    spectatable: z.boolean(),
    resume: z.object({ code: zCode, token: zToken }).optional(),
  }),
  'balatro:p2p:join': z.object({
    code: zCode,
    contentHash: zContentHash,
    role: zRole.default('player'),
  }),
  'balatro:p2p:admit': z.object({
    peerId: zPeerId,
    accept: z.boolean(),
    reason: zAdmitReason.optional(),
  }),
  'balatro:p2p:signal': z
    .object({
      to: zPeerId.optional(),
      description: zSdp.optional(),
      candidate: zCandidate.optional(),
    })
    .refine((v) => !!v.description !== !!v.candidate, {
      message: 'exactly one of description or candidate',
    }),
  'balatro:p2p:relay:start': z.object({}),
  /** Binary; header = the shared `encodeRelay` (slot = member index 1…127). */
  'balatro:p2p:relay': zRelayIn,
  'balatro:p2p:state': z.object({
    open: z.boolean(),
    started: z.boolean(),
    runId: z.string().max(32).nullable(),
    /** userIds in join order. */
    members: z.array(z.string().max(64)).max(24),
    successor: zPeerId.nullable(),
    spectatable: z.boolean(),
    summary: z.object({ players: z.number().int(), ante: z.number().int().nullable() }),
  }),
  'balatro:p2p:kick': z.object({ peerId: zPeerId }),
  'balatro:p2p:forfeit-seat': z.object({ userId: z.string().max(64), runId: z.string().max(32) }),
  'balatro:p2p:leave': z.object({}),
  'balatro:p2p:close': z.object({}),
  'balatro:seat:query': z.object({}),
  'balatro:queue:join': z.object({
    queueMode: zQueueMode,
    contentHash: zContentHash,
    partyCode: zCode.optional(),
  }),
  'balatro:queue:leave': z.object({}),
  /** Party host only. */
  'balatro:party:queue': z.object({ code: zCode, queueMode: zQueueMode }),
  'balatro:invite': z.object({ code: zCode, toUserId: z.string().max(64) }),
  'balatro:spectate:list': z.object({}),
} as const satisfies Record<string, z.ZodType>;

/* ─── S2C (hub → client) ─────────────────────────────────────────────────── */

/** The browser parses these too (a buggy hub is still just data). */
export const BALATRO_S2C = {
  'balatro:p2p:hosted': z.object({ code: zCode, token: zToken, peerId: zPeerId, ice: zIceServers }),
  /** To the host. */
  'balatro:p2p:join-request': z.object({
    peerId: zPeerId,
    userId: zUserId,
    name: z.string().max(64),
    avatarUrl: z.string().max(512).nullable(),
    role: zRole,
    rejoin: z.boolean(),
  }),
  /** To the joiner. */
  'balatro:p2p:joining': z.object({ code: zCode, peerId: zPeerId, hostUserId: zUserId }),
  'balatro:p2p:admitted': z.object({ code: zCode, ice: zIceServers, hostPeerId: zPeerId }),
  'balatro:p2p:rejected': z.object({ code: zCode, reason: z.string().max(32) }),
  'balatro:p2p:signal': z.object({
    from: zPeerId,
    description: zSdp.optional(),
    candidate: zCandidate.optional(),
  }),
  'balatro:p2p:relay': zRelayOut,
  /** To the host. */
  'balatro:p2p:member-left': z.object({
    peerId: zPeerId,
    userId: zUserId,
    reason: z.enum(['left', 'kicked', 'disconnected']),
  }),
  /** Hub presence, to the host. */
  'balatro:p2p:member-away': z.object({ peerId: zPeerId, away: z.boolean() }),
  /** To all members. */
  'balatro:p2p:host-changed': z.object({ code: zCode, hostPeerId: zPeerId, hostUserId: zUserId }),
  /** To the successor. */
  'balatro:p2p:promote': z.object({ code: zCode, token: zToken, ice: zIceServers }),
  'balatro:p2p:closed': z.object({
    code: zCode,
    reason: z.enum(['host-closed', 'host-lost', 'expired']),
  }),
  'balatro:p2p:error': z.object({
    event: z.string().max(64),
    code: zHubErrorCode,
    heldCode: zCode.optional(),
  }),
  'balatro:seat': z.object({
    code: zCode.nullable(),
    hostOnline: z.boolean(),
    runId: z.string().max(32).nullable(),
    started: z.boolean(),
  }),
  'balatro:queue:status': z.object({
    state: z.enum(['searching', 'matched', 'cancelled']),
    queueMode: zQueueMode,
    code: zCode.optional(),
    role: z.enum(['host', 'member']).optional(),
    waiting: z.number().int().optional(),
  }),
  'balatro:invited': z.object({ code: zCode, fromUserId: zUserId, fromName: z.string().max(64) }),
  'balatro:spectate:lobbies': z.object({
    lobbies: z
      .array(
        z.object({
          code: zCode,
          queueMode: zQueueMode,
          players: z.number().int(),
          ante: z.number().int().nullable(),
        }),
      )
      .max(50),
  }),
} as const satisfies Record<string, z.ZodType>;

/* ─── Derived views of the same contract ─────────────────────────────────── */

export type BalatroC2SEvent = keyof typeof BALATRO_C2S;
export type BalatroS2CEvent = keyof typeof BALATRO_S2C;
export type BalatroC2SPayload<K extends BalatroC2SEvent> = z.infer<(typeof BALATRO_C2S)[K]>;
export type BalatroS2CPayload<K extends BalatroS2CEvent> = z.infer<(typeof BALATRO_S2C)[K]>;

type C2SMap = typeof BALATRO_C2S;
type S2CMap = typeof BALATRO_S2C;
type MergedEvents = {
  [K in keyof C2SMap | keyof S2CMap]: (K extends keyof C2SMap ? { c2s: C2SMap[K] } : unknown) &
    (K extends keyof S2CMap ? { s2c: S2CMap[K] } : unknown);
};

function mergeEvents(): MergedEvents {
  const out: Record<string, { c2s?: z.ZodType; s2c?: z.ZodType }> = {};
  for (const [name, schema] of Object.entries(BALATRO_C2S)) out[name] = { c2s: schema };
  for (const [name, schema] of Object.entries(BALATRO_S2C))
    out[name] = { ...out[name], s2c: schema };
  return out as MergedEvents;
}

/** `{ name: { c2s?, s2c? } }` — the shape `bindEvents` and the typed client take. */
export const BALATRO_EVENTS: MergedEvents = mergeEvents();

/** Typed socket.io generics: `Socket<BalatroServerToClient, BalatroClientToServer>`. */
export type BalatroClientToServer = ClientToServer<typeof BALATRO_EVENTS>;
export type BalatroServerToClient = ServerToClient<typeof BALATRO_EVENTS>;

/** `{ name: name }` for every C2S event — the rate-limit coverage test's input. */
export const BALATRO_C2S_EVENTS = Object.freeze(
  Object.fromEntries(Object.keys(BALATRO_C2S).map((name) => [name, name])),
) as { readonly [K in BalatroC2SEvent]: K };

/** `{ name: name }` for every S2C event. */
export const BALATRO_S2C_EVENTS = Object.freeze(
  Object.fromEntries(Object.keys(BALATRO_S2C).map((name) => [name, name])),
) as { readonly [K in BalatroS2CEvent]: K };
