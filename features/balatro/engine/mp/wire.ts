/**
 * Balatro multiplayer — the P2P wire catalogue (PLAN §3.b, frozen).
 *
 * Framing (owned by WS1/WS5, not here): control frames ride the reliable
 * channel as `tagged(TAG_CONTROL, utf8(JSON))` from lib/shared/p2p/wire.ts,
 * fragmented above 16 KB up to 1 MB. The unreliable channel carries only
 * ping/pong. This module only turns an envelope into JSON text and back,
 * validating `d` against the schema of its kind.
 *
 * Direction legend: `M>H` member→host · `H>A` host→all (incl. loopback) ·
 * `H>T` host→target(s) · `P>H>T` peer→target(s) via the host · `P>H>A` peer
 * broadcast via the host · `any`. `hostOnly` kinds are rejected unless they
 * arrive over the host link with no `f` (enforced by WS5's receiver filter;
 * `isHostOnly` is the source of truth).
 *
 * ## WS0 resolutions of gaps in the PLAN text
 *
 * 1. `outcome` "carries host seq `hs`": it is a field of `d` — `{ o, hs }` —
 *    the same shape as the bridge's JS→Lua `outcome`.
 * 2. `kick` is listed as `M>H {}` but "comes from the host's own UI only":
 *    it stays in the catalogue (so the kind name is reserved) and is in
 *    `LOCAL_ONLY_KINDS`; a receiver drops it from the wire.
 * 3. `f` and `to` are user ids (≤64 chars); `to: '*'` = everyone.
 * 4. `sync.data`, `trap_fired.payload` are open records here; the per-object
 *    shapes belong to the content streams (WS7/WS9) and are validated in Lua.
 */

import { z } from 'zod';
import { MP_PROTOCOL_VERSION } from '../net/limits';
import { zContentHash } from '../net/events';
import {
  zBlindCol,
  zGameEvent,
  zHandResult,
  zId,
  zKey,
  zLobbyState,
  zOptionalPack,
  zRefCheckpoint,
  zRefMsg,
  zReplayBatch,
  zReplayEvent,
  zRunId,
  zSafeCard,
  zScoreStr,
  zSeed,
  zSetupView,
  zStartedMatch,
  zTeam,
} from './types';

export const WIRE_LIMITS = {
  /** Above this a control frame is fragmented (lib/shared/p2p/wire.ts). */
  FRAGMENT_BYTES: 16 * 1024,
  /** Largest reassembled control message. */
  MAX_MESSAGE_BYTES: 1024 * 1024,
  CHAT_MAX_CHARS: 500,
  LOG_BATCH_MAX: 50,
  DECK_RES_MAX_CHARS: 8 * 1024,
} as const;

const zOpenRecord = z.record(z.string().max(64), z.unknown());
const zPlayerInfo = z.object({
  avatarJoker: zKey,
  blindCol: zBlindCol,
  lang: z.string().max(16),
  /** Optional packs this peer has mounted (EX-14); a later `player_info` updates it. */
  packs: z.array(zOptionalPack).max(4).optional(),
});

/** `d` schema per kind. */
export const WIRE_D = {
  /** First frame; the host checks the hash. */
  hello: z.object({
    contentHash: zContentHash,
    protocol: z.number().int().min(1),
    info: zPlayerInfo,
    rejoin: z.object({ runId: zRunId }).nullable(),
  }),
  /** Fragmented. `logs` for spectators. */
  welcome: z.object({
    you: zId,
    lobby: zLobbyState,
    match: zStartedMatch.nullable(),
    checkpoint: zRefCheckpoint.nullable(),
    lives: z.record(zId, z.number().int().min(0)),
    tail: z.record(zId, z.array(zHandResult).max(256)),
    logs: z.array(zReplayBatch).max(16).optional(),
    /**
     * A crash rejoin: how many events of the rejoiner's own replay log the host
     * holds (contiguous). Its recorder continues there (docs/balatro-mp.md §11).
     */
    logNext: z.number().int().min(0).max(20_000).optional(),
  }),
  /** Full replace; ignored if `version` ≤ the last one. */
  lobby: z.object({ version: z.number().int().min(0), state: zLobbyState }),
  player_info: zPlayerInfo,
  ready: z.object({ ready: z.boolean() }),
  set_team: z.object({ team: zTeam }),
  kick: z.object({}),
  leave: z.object({}),
  setup: z.object({ step: zSetupView }),
  vote_cast: z.object({ stepId: z.string().max(32), option: z.string().max(64) }),
  draft_choose: z.object({ stepId: z.string().max(32), key: zKey }),
  start_game: zStartedMatch,
  reseed: z.object({ runId: zRunId, seed: zSeed }),
  /** The host stamps `f`; `system: true` only from the host. */
  chat: z.object({
    text: z.string().max(WIRE_LIMITS.CHAT_MAX_CHARS),
    system: z.literal(true).optional(),
  }),
  game: z.object({ e: zGameEvent }),
  outcome: z.object({ o: zRefMsg, hs: z.number().int().min(0) }),
  /** After every change, coalesced at most every 250 ms. */
  checkpoint: z.object({
    runId: zRunId,
    version: z.number().int().min(0),
    blob: zRefCheckpoint,
    lobby: zLobbyState,
  }),
  nemesis_info: z.object({
    score: zScoreStr,
    hands_left: z.number().int().min(0),
    skips: z.number().int().min(0),
    lives: z.number().int().min(0),
  }),
  location: z.object({ loc: z.string().max(64) }),
  timer: z.object({ op: z.enum(['start', 'pause']), time: z.number(), isPvP: z.boolean() }),
  sync: z.object({
    obj: zKey,
    kind: z.enum(['sync', 'phantom']),
    data: zOpenRecord,
    to: zId.optional(),
  }),
  opp_ctx: z.object({
    ctx: z.object({
      opponent_spent_in_shop: z.number().optional(),
      opponent_selling_card: z.literal(true).optional(),
    }),
  }),
  trap_plant: z.object({ card: zSafeCard, owner: zId, uid: z.string().max(32) }),
  trap_held: z.object({
    cards: z.array(z.object({ uid: z.string().max(32), key: zKey, owner: zId })).max(64),
    fired: z.array(z.string().max(32)).max(64),
  }),
  /** Delivered to the owner. */
  trap_fired: z.object({ owner: zId, key: zKey, uid: z.string().max(32), payload: zOpenRecord }),
  player_result: z.object({
    jokers: z
      .array(
        z.object({
          key: zKey,
          edition: z.string().max(32).nullable(),
          eternal: z.boolean(),
          perishable: z.boolean(),
        }),
      )
      .max(64),
    deck_back: zKey,
    highest_pvp_score: zScoreStr,
    interim: z.boolean(),
  }),
  deck_req: z.object({}),
  /** `suit-rank-enh-edition-seal;…` */
  deck_res: z.object({ cards: z.string().max(WIRE_LIMITS.DECK_RES_MAX_CHARS) }),
  stats_req: z.object({}),
  stats_res: z.object({
    reroll_count: z.number().int().min(0),
    reroll_cost_total: z.number().min(0),
    vouchers: z.array(zKey).max(64),
  }),
  /** Own channel bucket. */
  log: z.object({ runId: zRunId, batch: z.array(zReplayEvent).max(WIRE_LIMITS.LOG_BATCH_MAX) }),
  presence: z.object({
    id: zId,
    status: z.enum(['away', 'back', 'catching_up', 'caught_up', 'left', 'forfeited']),
    graceMsLeft: z.number().int().min(0).optional(),
  }),
  /**
   * NET-09: the sender's tab was hidden (`true`) or shown again (`false`). Display only:
   * the host announces a hidden player as `presence away` (no grace) after 2 s and
   * `back` on return; the seat grace stays tied to link silence.
   */
  visibility: z.object({ hidden: z.boolean() }),
  /** Sent by the new host. */
  host_changed: z.object({ hostId: zId, from: z.literal('migration') }),
  /** Polite close. */
  bye: z.object({ reason: z.string().max(64) }),
} as const satisfies Record<string, z.ZodType>;

export type WireKind = keyof typeof WIRE_D;
export type WireData<K extends WireKind> = z.infer<(typeof WIRE_D)[K]>;
export const WIRE_KINDS = Object.keys(WIRE_D) as WireKind[];
export const zWireKind = z.enum(WIRE_KINDS as [WireKind, ...WireKind[]]);

export type WireDirection = 'M>H' | 'H>A' | 'H>T' | 'H>A|T' | 'P>H>T' | 'P>H>A' | 'P>H>T|A' | 'any';

export const WIRE_META: { readonly [K in WireKind]: { dir: WireDirection; hostOnly: boolean } } = {
  hello: { dir: 'M>H', hostOnly: false },
  welcome: { dir: 'H>T', hostOnly: true },
  lobby: { dir: 'H>A', hostOnly: true },
  player_info: { dir: 'M>H', hostOnly: false },
  ready: { dir: 'M>H', hostOnly: false },
  set_team: { dir: 'M>H', hostOnly: false },
  kick: { dir: 'M>H', hostOnly: false },
  leave: { dir: 'M>H', hostOnly: false },
  setup: { dir: 'H>A', hostOnly: true },
  vote_cast: { dir: 'M>H', hostOnly: false },
  draft_choose: { dir: 'M>H', hostOnly: false },
  start_game: { dir: 'H>A', hostOnly: true },
  reseed: { dir: 'H>A', hostOnly: true },
  chat: { dir: 'P>H>A', hostOnly: false },
  game: { dir: 'M>H', hostOnly: false },
  outcome: { dir: 'H>A|T', hostOnly: true },
  checkpoint: { dir: 'H>A', hostOnly: true },
  nemesis_info: { dir: 'P>H>A', hostOnly: false },
  location: { dir: 'P>H>A', hostOnly: false },
  timer: { dir: 'P>H>T', hostOnly: false },
  sync: { dir: 'P>H>T|A', hostOnly: false },
  opp_ctx: { dir: 'P>H>A', hostOnly: false },
  trap_plant: { dir: 'P>H>T', hostOnly: false },
  trap_held: { dir: 'P>H>A', hostOnly: false },
  trap_fired: { dir: 'P>H>T', hostOnly: false },
  player_result: { dir: 'P>H>A', hostOnly: false },
  deck_req: { dir: 'P>H>T', hostOnly: false },
  deck_res: { dir: 'P>H>T', hostOnly: false },
  stats_req: { dir: 'P>H>T', hostOnly: false },
  stats_res: { dir: 'P>H>T', hostOnly: false },
  log: { dir: 'P>H>A', hostOnly: false },
  presence: { dir: 'H>A', hostOnly: true },
  visibility: { dir: 'M>H', hostOnly: false },
  host_changed: { dir: 'H>A', hostOnly: true },
  bye: { dir: 'any', hostOnly: false },
};

/** Kinds a receiver never accepts from the wire (resolution 2). */
export const LOCAL_ONLY_KINDS: ReadonlySet<WireKind> = new Set<WireKind>(['kick']);

/** Peer-to-peer kinds that the bridge's `peer` message carries (§3.c). */
export const PEER_KINDS = [
  'nemesis_info',
  'location',
  'timer',
  'sync',
  'opp_ctx',
  'trap_plant',
  'trap_held',
  'trap_fired',
  'player_result',
  'deck_req',
  'deck_res',
  'stats_req',
  'stats_res',
] as const satisfies readonly WireKind[];
export type PeerKind = (typeof PEER_KINDS)[number];

export function isHostOnly(kind: WireKind): boolean {
  return WIRE_META[kind].hostOnly;
}

/* ─── Envelope ───────────────────────────────────────────────────────────── */

export const zEnvelope = z.object({
  v: z.literal(1),
  k: zWireKind,
  /** Per-sender sequence number. */
  s: z.number().int().min(0),
  /** Original sender userId, set ONLY by the host when relaying. */
  f: zId.optional(),
  to: z.union([zId, z.literal('*')]).optional(),
  d: z.record(z.string(), z.unknown()),
});

export type Envelope<K extends WireKind = WireKind> = {
  [P in K]: { v: 1; k: P; s: number; f?: string; to?: string; d: WireData<P> };
}[K];

export type DecodeResult =
  | { ok: true; env: Envelope }
  | {
      ok: false;
      error: 'json' | 'too-large' | 'envelope' | 'data';
      kind?: string;
      detail?: string;
    };

/** Build an envelope (validates `d`; throws on a programming error). */
export function makeEnvelope<K extends WireKind>(
  k: K,
  s: number,
  d: WireData<K>,
  extra: { f?: string; to?: string } = {},
): Envelope<K> {
  const parsed = WIRE_D[k].parse(d) as WireData<K>;
  return { v: 1, k, s, ...extra, d: parsed } as Envelope<K>;
}

/** Envelope → JSON text (the payload of a TAG_CONTROL frame). */
export function encodeEnvelope(env: Envelope): string {
  return JSON.stringify(env);
}

/** JSON text → validated envelope. Never throws. */
export function decodeEnvelope(text: string): DecodeResult {
  if (text.length > WIRE_LIMITS.MAX_MESSAGE_BYTES) return { ok: false, error: 'too-large' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  return validateEnvelope(raw);
}

/** An already-parsed value → validated envelope. Never throws. */
export function validateEnvelope(raw: unknown): DecodeResult {
  const env = zEnvelope.safeParse(raw);
  if (!env.success) return { ok: false, error: 'envelope', detail: env.error.issues[0]?.message };
  const d = WIRE_D[env.data.k].safeParse(env.data.d);
  if (!d.success) {
    return { ok: false, error: 'data', kind: env.data.k, detail: d.error.issues[0]?.message };
  }
  return { ok: true, env: { ...env.data, d: d.data } as Envelope };
}

/** The protocol number a `hello` must carry. */
export const WIRE_PROTOCOL = MP_PROTOCOL_VERSION;
