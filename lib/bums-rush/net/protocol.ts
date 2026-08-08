/**
 * Bum's Rush — the JSON control plane (§9.3).
 *
 * The hot path (`br:input`, `br:snapshot`) is binary and lives in `input.ts` /
 * `snapshot.ts`. Everything else is JSON, and everything else is validated
 * here, by schemas that BOTH sides import: the client so it cannot build a
 * payload the server will reject, the hub so it never trusts one.
 *
 * Why zod at all for a relay? Because the relay is not dumb (§9.3). A room is
 * four strangers, and the fields that travel between them — names, cosmetic
 * ids, emote ids — are rendered by everyone else's browser. `head:
 * '<img src=x onerror=…>'` has to die at the hub, not at a React escape
 * boundary someone might later replace with `dangerouslySetInnerHTML`.
 *
 * This module is imported by `server/socket-server/handlers/bums-rush.ts`, so
 * it stays free of `@/` specifiers, browser globals and `.server` imports —
 * see server/CLAUDE.md §Gotchas 7.
 */

import { z } from 'zod';
import { NET, NET_LIMITS } from '../constants';
import type {
  Assists,
  Cosmetics,
  RoomMode,
  RoomView,
  SeatIndex,
  SeatView,
  ShowdownRoundKind,
} from '../types';

// ─── Primitives ─────────────────────────────────────────────────────────────

/**
 * Zod 4 rejects NaN/Infinity for `z.number()` in most builds, but not in every
 * one we might land on, and a NaN that reaches a quantiser becomes a `0` at the
 * far end of the wire — a character teleporting to the origin with no error
 * anywhere. One helper, used everywhere, so that cannot happen by omission.
 */
const zFinite = z.number().refine(Number.isFinite, { message: 'not-finite' });

const zVec2 = z.object({ x: zFinite, y: zFinite });

/** 0..3. Cast is safe: the range check above is the whole definition of SeatIndex. */
const zSeatIndex = z
  .number()
  .int()
  .min(0)
  .max(NET.MAX_SEATS - 1)
  .transform((n) => n as SeatIndex);

/**
 * A cosmetic/level/emote id as it may appear on the wire.
 *
 * This is a SHAPE guard, not the allowlist — the allowlist is
 * `lib/bums-rush/cosmetics.ts`, checked by the hub (§9.3). Shape first because
 * it is total: it holds even when a catalog is empty, mid-rename, or newer on
 * one side of a deploy than the other.
 */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const zId = z.string().regex(ID_RE, { message: 'bad-id' });

const zCosmetics = z.object({
  head: zId,
  hat: zId.nullable(),
  gloves: zId,
  ink: zId,
});

const zAssists = z.object({
  grabAssist: z.boolean(),
  stickyGrip: z.boolean(),
  analogTriggers: z.boolean(),
  autoGrab: z.boolean(),
  slowMo: z.boolean(),
  extraCheckpoints: z.boolean(),
  noFallDamage: z.boolean(),
  aimSmoothing: zFinite.min(0).max(1),
  oneHanded: z.boolean(),
});

/**
 * Display name. Trimmed and length-capped here; the hub additionally runs it
 * through `sanitizeUserName` so Bum's Rush names obey the same character rule
 * as every other game in the hub rather than a second one.
 */
const zName = z.string().trim().min(1).max(NET_LIMITS.MAX_NAME_LEN);

/**
 * Room code. The alphabet is `config.ROOM_CODE_ALPHABET` (no ambiguous
 * glyphs); it is duplicated as a regex rather than imported because that
 * constant lives in the hub's config, which client code must not pull in.
 * `lib/bums-rush/__tests__/net-protocol.test.ts` pins the two together.
 */
export const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{1,6}$/;
const zRoomCode = z
  .string()
  .trim()
  .toUpperCase()
  .max(NET_LIMITS.MAX_CODE_LEN)
  .regex(ROOM_CODE_RE, { message: 'bad-code' });

const zMode = z.enum(['campaign', 'showdown', 'solo-ladder']);
const zRoundKind = z.enum(['race', 'survive', 'handle']);

/**
 * What kind of machine is asking to host.
 *
 * Self-reported and therefore untrusted — it only ever *breaks a tie* in host
 * election (§9.6, `migration.ts`), so the worst a liar achieves is hosting a
 * co-op room they were already nearly winning on RTT.
 */
const zDevice = z.enum(['desktop', 'mobile', 'unknown']);
export type DeviceKind = z.infer<typeof zDevice>;

/**
 * A stable per-tab id the client generates once and re-sends on rejoin.
 *
 * Socket ids change on every reconnect, so they cannot be what a held seat is
 * keyed to (§9.6, the 90 s grace). This is not a credential: it re-attaches a
 * seat inside a room the holder must already know the code of, and a signed-in
 * player's seats are matched on `userId` first.
 */
const zClientKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

// ─── Client → server payloads (§9.3) ────────────────────────────────────────

export const zCreateRoom = z.object({
  mode: zMode,
  private: z.boolean(),
  levelId: zId.optional(),
  cosmetics: zCosmetics,
  name: zName,
  device: zDevice.optional(),
  clientKey: zClientKey.optional(),
  /** Showdown only; ignored elsewhere. */
  ranked: z.boolean().optional(),
  teams: z.boolean().optional(),
});
export type CreateRoomMsg = z.infer<typeof zCreateRoom>;

export const zJoinRoom = z.object({
  code: zRoomCode,
  cosmetics: zCosmetics,
  name: zName,
  device: zDevice.optional(),
  clientKey: zClientKey.optional(),
  /**
   * Party ticket (§9.7 path 4). A bearer secret — it rides in the payload of a
   * socket message and in router state, NEVER in the URL (`lib/party/types.ts`
   * is explicit about this).
   */
  ticket: z.string().max(512).optional(),
});
export type JoinRoomMsg = z.infer<typeof zJoinRoom>;

export const zQuickPlay = z.object({
  mode: zMode,
  minPlayers: z.number().int().min(1).max(NET.MAX_SEATS),
  region: z.string().max(16).optional(),
  cosmetics: zCosmetics,
  name: zName,
  device: zDevice.optional(),
  clientKey: zClientKey.optional(),
  /** Preferred starting level when quick play has to create the room. */
  levelId: zId.optional(),
});
export type QuickPlayMsg = z.infer<typeof zQuickPlay>;

export const zListRooms = z.object({ mode: zMode });
export type ListRoomsMsg = z.infer<typeof zListRooms>;

export const zClaimSeat = z.object({
  /** Which local device on this client wants the seat (couch co-op, §4.6). */
  localIndex: z.number().int().min(0).max(7),
  cosmetics: zCosmetics.optional(),
  name: zName.optional(),
});
export type ClaimSeatMsg = z.infer<typeof zClaimSeat>;

export const zReleaseSeat = z.object({ seatIndex: zSeatIndex });
export type ReleaseSeatMsg = z.infer<typeof zReleaseSeat>;

/** Flattened per §9.3's table rather than nested under `cosmetics`. */
export const zSetCosmetics = z.object({
  seatIndex: zSeatIndex,
  head: zId,
  hat: zId.nullable(),
  gloves: zId,
  ink: zId,
});
export type SetCosmeticsMsg = z.infer<typeof zSetCosmetics>;

export const zSetAssists = z.object({ seatIndex: zSeatIndex, assists: zAssists });
export type SetAssistsMsg = z.infer<typeof zSetAssists>;

export const zReady = z.object({ seatIndex: zSeatIndex, ready: z.boolean() });
export type ReadyMsg = z.infer<typeof zReady>;

export const zSelectLevel = z.object({ levelId: zId });
export type SelectLevelMsg = z.infer<typeof zSelectLevel>;

export const zStart = z.object({
  levelId: zId.optional(),
  /** Showdown round type, when the host is starting one. */
  roundKind: zRoundKind.optional(),
});
export type StartMsg = z.infer<typeof zStart>;

export const zEmote = z.object({ seatIndex: zSeatIndex, emoteId: zId });
export type EmoteMsg = z.infer<typeof zEmote>;

export const zHostHandoff = z.object({ toClientId: z.string().min(1).max(64) });
export type HostHandoffMsg = z.infer<typeof zHostHandoff>;

export const zPing = z.object({ t: zFinite });
export type PingMsg = z.infer<typeof zPing>;

export const zLeave = z.object({}).loose();

// ─── Discrete host events (`br:event`) ──────────────────────────────────────

/**
 * `{ t, kind, data }` per §9.3, validated per kind.
 *
 * Deliberately NOT a pass-through blob. These fan out to every other client and
 * drive their HUD and audio; an unvalidated `data` is how one player makes
 * everyone else's browser render whatever they like.
 *
 * `grip` is absent on purpose: grip state is already in every snapshot at
 * 20 Hz, and relaying it here as well would spend the 300/60 s budget in about
 * fifteen seconds of ordinary play.
 */
export const zEventMsg = z.discriminatedUnion('kind', [
  z.object({
    t: zFinite,
    kind: z.literal('death'),
    data: z.object({ seat: zSeatIndex, at: zVec2, cause: z.enum(['bounds', 'hazard', 'impact']) }),
  }),
  z.object({
    t: zFinite,
    kind: z.literal('respawn'),
    data: z.object({ seat: zSeatIndex, at: zVec2 }),
  }),
  z.object({
    t: zFinite,
    kind: z.literal('checkpoint'),
    data: z.object({ index: z.number().int().min(0).max(255) }),
  }),
  z.object({ t: zFinite, kind: z.literal('objective'), data: z.object({ objectiveId: zId }) }),
  z.object({
    t: zFinite,
    kind: z.literal('parcel'),
    data: z.object({ parcelId: zId, seat: zSeatIndex }),
  }),
  z.object({
    t: zFinite,
    kind: z.literal('item'),
    data: z.object({ propId: zId, seat: zSeatIndex, kindOf: z.string().max(24) }),
  }),
  z.object({
    t: zFinite,
    kind: z.literal('signal'),
    data: z.object({ signal: zId, value: z.boolean() }),
  }),
  z.object({ t: zFinite, kind: z.literal('cat'), data: z.object({}).loose() }),
  z.object({
    t: zFinite,
    kind: z.literal('finish'),
    data: z.object({
      ms: zFinite.min(0),
      objectives: z.array(zId).max(8),
      deaths: z.number().int().min(0).max(9999),
      assisted: z.boolean(),
    }),
  }),
  z.object({ t: zFinite, kind: z.literal('emote'), data: z.object({ seat: zSeatIndex, emoteId: zId }) }),
]);
export type BrEventMsg = z.infer<typeof zEventMsg>;

/** Event kinds the host relays; anything else stays local to the host. */
export const RELAYED_EVENT_KINDS = [
  'death',
  'respawn',
  'checkpoint',
  'objective',
  'parcel',
  'item',
  'signal',
  'cat',
  'finish',
  'emote',
] as const;

export type RelayedEventKind = (typeof RELAYED_EVENT_KINDS)[number];

// ─── Results (§9.8) ─────────────────────────────────────────────────────────

const zLevelResult = z.object({
  levelId: zId,
  playerCount: z.number().int().min(1).max(NET.MAX_SEATS),
  durationMs: zFinite.min(0),
  deaths: z.number().int().min(0).max(9999),
  objectiveIds: z.array(zId).max(8),
  assisted: z.boolean(),
  catUsed: z.boolean(),
  seats: z
    .array(z.object({ seat: zSeatIndex, userId: z.string().max(64).nullable() }))
    .max(NET.MAX_SEATS),
});

const zShowdownResult = z.object({
  ranked: z.boolean(),
  teams: z.boolean(),
  rounds: z.number().int().min(1).max(64),
  players: z
    .array(
      z.object({
        seat: zSeatIndex,
        userId: z.string().max(64).nullable(),
        roundsWon: z.number().int().min(0).max(64),
        won: z.boolean(),
      }),
    )
    .max(NET.MAX_SEATS),
});

/**
 * A host-reported result, wrapped in an envelope.
 *
 * `digest` is tamper EVIDENCE, not a signature, and the comment matters more
 * than the field: the host is the party we cannot trust (§9.1), so nothing the
 * host computes can authenticate the host. What the digest buys is that a
 * result mangled in transit, or edited by a well-meaning proxy, is rejected
 * rather than persisted as somebody's personal best. Integrity against
 * accident; §9.8's plausibility bounds are the defence against intent.
 */
export const zResultMsg = z.object({
  v: z.literal(1),
  roomId: zRoomCode,
  hostClientId: z.string().min(1).max(64),
  issuedAt: zFinite,
  nonce: z.string().min(4).max(64),
  digest: z.string().length(8),
  body: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('level'), result: zLevelResult }),
    z.object({ kind: z.literal('showdown'), result: zShowdownResult }),
  ]),
});
export type ResultEnvelope = z.infer<typeof zResultMsg>;

/**
 * FNV-1a over the canonical JSON of everything but the digest itself.
 *
 * Chosen over `crypto.subtle` because that is async and unavailable outside a
 * secure context, and this runs on the client at the end of a level; chosen
 * over "no check at all" because a silent corruption here writes a wrong time
 * to a leaderboard nobody can explain later.
 */
export function resultDigest(envelope: Omit<ResultEnvelope, 'digest'>): string {
  const canonical = JSON.stringify([
    envelope.v,
    envelope.roomId,
    envelope.hostClientId,
    envelope.issuedAt,
    envelope.nonce,
    envelope.body,
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in Math.imul so it never leaves int32.
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function sealResult(envelope: Omit<ResultEnvelope, 'digest'>): ResultEnvelope {
  return { ...envelope, digest: resultDigest(envelope) };
}

export function digestMatches(envelope: ResultEnvelope): boolean {
  const { digest, ...rest } = envelope;
  return resultDigest(rest) === digest;
}

/** Per-level bounds the hub can only apply when it has the level manifest. */
export interface LevelBounds {
  minPlausibleSeconds?: number;
  parSeconds?: number;
  objectiveIds?: readonly string[];
}

export interface ResultVerdict {
  /** False means "persist, but never rank it" — §9.8 never drops a clear. */
  ranked: boolean;
  reasons: string[];
}

/** Two hours. Past this the run is a tab someone left open, not a clear. */
const MAX_RESULT_MS = 2 * 60 * 60 * 1000;
/** Below this nothing is a level, whatever the manifest says. */
const ABSOLUTE_MIN_LEVEL_MS = 3_000;
/** §9.8: no ranked Showdown round shorter than three seconds. */
const MIN_RANKED_ROUND_MS = 3_000;

/**
 * §9.8 plausibility bounds.
 *
 * Pure, and takes everything it judges as an argument, so the hub can run it
 * without loading levels and `lib/bums-rush/progress/save.server.ts` can run
 * the same function with the manifest in hand and reach a stricter verdict.
 * Never returns "reject": a failing bound downgrades a result to unranked and
 * says why, because a dropped clear is a support ticket.
 */
export function verifyResult(
  envelope: ResultEnvelope,
  context: {
    /** Seats the SERVER saw in the room, not the ones the host claims. */
    roomSeats: readonly SeatIndex[];
    roomId: string;
    hostClientId: string;
    level?: LevelBounds;
  },
): ResultVerdict {
  const reasons: string[] = [];

  if (!digestMatches(envelope)) reasons.push('digest-mismatch');
  if (envelope.roomId !== context.roomId) reasons.push('room-mismatch');
  if (envelope.hostClientId !== context.hostClientId) reasons.push('host-mismatch');

  const seen = new Set(context.roomSeats);

  if (envelope.body.kind === 'level') {
    const r = envelope.body.result;
    if (r.durationMs > MAX_RESULT_MS) reasons.push('duration-too-long');
    if (r.durationMs < ABSOLUTE_MIN_LEVEL_MS) reasons.push('duration-too-short');

    const min = context.level?.minPlausibleSeconds;
    if (min !== undefined && r.durationMs < min * 1000) reasons.push('below-min-plausible');

    const objectives = context.level?.objectiveIds;
    if (objectives) {
      for (const id of r.objectiveIds) {
        if (!objectives.includes(id)) reasons.push('unknown-objective');
      }
    }
    // The `clock` objective is the one that can be claimed without being
    // earned, because it is purely a function of the time the host reported.
    const par = context.level?.parSeconds;
    if (par !== undefined && r.objectiveIds.includes('clock') && r.durationMs > par * 1000) {
      reasons.push('clock-over-par');
    }
    if (new Set(r.objectiveIds).size !== r.objectiveIds.length) reasons.push('duplicate-objective');
    if (r.seats.length !== r.playerCount) reasons.push('player-count-mismatch');
    for (const s of r.seats) if (!seen.has(s.seat)) reasons.push('unseen-seat');
  } else {
    const r = envelope.body.result;
    const totalWins = r.players.reduce((sum, p) => sum + p.roundsWon, 0);
    if (totalWins !== r.rounds) reasons.push('round-count-mismatch');
    if (r.players.filter((p) => p.won).length < 1) reasons.push('no-winner');
    for (const p of r.players) if (!seen.has(p.seat)) reasons.push('unseen-seat');
    if (r.ranked && r.rounds * MIN_RANKED_ROUND_MS > MAX_RESULT_MS) reasons.push('rounds-implausible');
  }

  return { ranked: reasons.length === 0, reasons };
}

// ─── Server → client payloads ───────────────────────────────────────────────

export interface RoomListEntry {
  code: string;
  mode: RoomMode;
  phase: RoomView['phase'];
  seatCount: number;
  maxSeats: number;
  levelId: string | null;
  /** Seconds since the room was created — quick play joins the oldest. */
  ageSec: number;
}

/** `br:seat` — which seats THIS client owns, after any change. */
export interface SeatAssignmentMsg {
  clientId: string;
  seats: { seat: SeatIndex; localIndex: number }[];
}

/**
 * `br:start`. `joinInProgress` is the seamless path (§9.7): a client that
 * arrives mid-level gets this with the host's most recent keyframe attached and
 * sketches itself in, instead of being parked in a lobby until the round ends.
 */
export interface StartBroadcastMsg {
  levelId: string;
  mode: RoomMode;
  hostClientId: string;
  startedAt: number;
  seats: SeatView[];
  joinInProgress: boolean;
  roundKind?: ShowdownRoundKind;
  /**
   * Present only for a mid-level joiner. `ArrayBuffer` in a browser,
   * `Uint8Array` when it came off Node's Buffer pool — the decoders take
   * either, and pretending otherwise here would just move a cast downstream.
   */
  keyframe?: ArrayBuffer | Uint8Array;
}

/** `br:hostChanged` — carries the last keyframe the hub relayed (§9.6). */
export interface HostChangedMsg {
  hostClientId: string;
  /** True for the client that must now start simulating. */
  youAreHost: boolean;
  /** Sent to the incoming host only; see {@link StartBroadcastMsg.keyframe}. */
  keyframe: ArrayBuffer | Uint8Array | null;
  keyframeAgeMs: number | null;
  reason: 'handoff' | 'host-left' | 'host-timeout';
}

export interface PeerMsg {
  clientId: string;
  name: string;
  seats: SeatIndex[];
}

export interface PongMsg {
  /** Echo of the client's `t`, so RTT is measured on one clock. */
  t: number;
  serverT: number;
}

export type BrErrorCode =
  | 'rate-limited'
  | 'bad-payload'
  | 'too-large'
  | 'room-not-found'
  | 'room-full'
  | 'not-in-room'
  | 'host-only'
  | 'seat-taken'
  | 'not-your-seat'
  | 'invalid-ticket'
  | 'unknown-cosmetic'
  | 'server-busy';

export interface BrErrorMsg {
  code: BrErrorCode;
  /** Which event failed, so the client can retry the right thing. */
  event?: string;
}

export interface ResultAckMsg {
  accepted: true;
  ranked: boolean;
  reasons: string[];
  /**
   * The hub does NOT write results (§10.3 owns persistence, on the web tier
   * where the session lives). It hands the verdict back and the client POSTs
   * it, which is also what makes a signed-out player's local save the same
   * code path as a signed-in player's row.
   */
  persistVia: '/api/bums-rush/clear' | '/api/bums-rush/showdown';
}

// ─── Views ──────────────────────────────────────────────────────────────────

export type { RoomView, SeatView, Cosmetics, Assists, RoomMode, SeatIndex };
