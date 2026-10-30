/**
 * Balatro multiplayer — the Lua↔JS mailbox protocol (PLAN §3.c, frozen).
 *
 * The transport (WS3's bridge.ts) moves NDJSON through MEMFS files; this
 * module is the vocabulary: paths, limits, and a zod schema per message type
 * in each direction. `scripts/balatro/gen-lua-protocol.ts` turns the same
 * schemas into `lib/balatro/lua/mp/rmh_mp/protocol.lua` (type constants plus
 * validators), so Lua and TS cannot drift — `protocol-lua.test.ts` fails
 * when the generated file is stale.
 *
 * Framing: one message per line, ≤64 KB per line, ≤256 KB per batch.
 * - Lua→JS batch: header `{"h":1,"ack":<last JS seq applied>,"fr":<frame#>}`,
 *   then `{"s":<lua seq>,"t":"<type>","d":{...}}` lines.
 * - JS→Lua: `{"s":<js seq>,"t":"<type>","d":{...}}`; Lua drops `s ≤ last`.
 * - Numbers use `%.17g`. Lua decodes with `rmh/json.lua`; never
 *   `STR_UNPACK`/`loadstring`. Unknown types are logged and dropped.
 *
 * ## WS0 resolutions of gaps in the PLAN text
 *
 * 1. **Absent vs null from Lua.** A Lua table cannot hold `nil`, so a JSON
 *    encoder in Lua drops nil fields. Every *nullable* Lua→JS field is
 *    therefore `.nullish()` (absent = null). JS→Lua stays strict, and the
 *    generated Lua validators treat a missing nullable field as null.
 * 2. **Empty tables.** A Lua `{}` may encode as `[]`. `parseBridgeMessage`
 *    turns a `d` of `[]` into `{}` before validating.
 * 3. **`peer` (Lua→JS)** is a union on `k` whose `d` is the §3.b wire schema
 *    of that kind; **`peer` (JS→Lua)** adds `from`.
 * 4. **`deck_res_local` / `stats_local`** carry the §3.b `deck_res` /
 *    `stats_res` data.
 * 5. **View-model shapes the PLAN leaves open** (`queue_view.state`,
 *    `replay_view.list` items, `ui_settings` enums, `toast.vars`) are
 *    defined below with the smallest field set the UI streams need.
 * 6. **`match_start`** = StartedMatch (which already carries `resolved`) plus `me`,
 *    plus `logNext` on a reload rejoin: the host's count of this player's
 *    replay log, where Lua's recorder continues (docs/balatro-mp.md §11).
 */

import { z } from 'zod';
import { zCode, zQueueMode } from '../net/events';
import {
  zBlindCol,
  zGameEvent,
  zHandResult,
  zId,
  zKey,
  zLobbyOptionKey,
  zLobbyState,
  zMpStake,
  zPlayerResult,
  zRefMsg,
  zReplayEvent,
  zResolvedRuleset,
  zRulesetKey,
  zRunId,
  zSeed,
  zSetupView,
  zStake,
  zStartedMatch,
  zTeam,
} from './types';
import { PEER_KINDS, WIRE_D, type PeerKind } from './wire';

/* ─── Paths and limits ───────────────────────────────────────────────────── */

export const BRIDGE_PATHS = {
  /** Lua writes here, then `os.rename`s to OUT. */
  OUT_TMP: '/rmh/net/out.tmp',
  /** Lua→JS. JS reads it in `onMovePath`, unlinks it, writes any pending inbound before returning. */
  OUT: '/rmh/net/out',
  /** JS→Lua. JS rewrites the whole file on every append; Lua reads then `os.remove`s it. */
  IN: '/rmh/net/in',
  /** JS writes `<version>` once the MP pack's files are in /Balatro/rmh_mp/…. */
  MP_READY: '/rmh/mp/ready',
  /** JS writes it during preRun when MP must start at boot. */
  MP_AUTOLOAD: '/rmh/mp/autoload',
  /** The redirected `save_run` (MP run snapshot). */
  MP_RUN: '/rmh/mp/run.jkr',
  /** `/rmh/dirty` convention marker for MP_RUN. */
  MP_SNAP_MARKER: '/rmh/mp/snap',
  /** MP Lua-state snapshot, next to run.jkr. */
  MP_STATE: '/rmh/mp/state.json',
  /** Glyph bitmap shipped in the MP pack. */
  GLYPHS: '/Balatro/rmh_mp/glyphs.bin',
} as const;

export const BRIDGE_LIMITS = {
  LINE_MAX_BYTES: 64 * 1024,
  BATCH_MAX_BYTES: 256 * 1024,
} as const;

/* ─── Shared pieces ──────────────────────────────────────────────────────── */

const zText = z.string().max(500);
const zNullishKey = zKey.nullish();
const zPeerD = (k: PeerKind) => WIRE_D[k];

const peerL2J = z.discriminatedUnion(
  'k',
  PEER_KINDS.map((k) => z.object({ k: z.literal(k), d: zPeerD(k) })) as unknown as [
    z.ZodObject<{ k: z.ZodLiteral<PeerKind>; d: z.ZodType }>,
    ...z.ZodObject<{ k: z.ZodLiteral<PeerKind>; d: z.ZodType }>[],
  ],
);
const peerJ2L = z.discriminatedUnion(
  'k',
  PEER_KINDS.map((k) => z.object({ k: z.literal(k), from: zId, d: zPeerD(k) })) as unknown as [
    z.ZodObject<{ k: z.ZodLiteral<PeerKind>; from: typeof zId; d: z.ZodType }>,
    ...z.ZodObject<{ k: z.ZodLiteral<PeerKind>; from: typeof zId; d: z.ZodType }>[],
  ],
);

export const zFlags = z.object({
  /** `G.STATE` name, e.g. `SELECTING_HAND`. */
  state: z.string().max(32),
  onPvp: z.boolean(),
  ready: z.boolean(),
  countdown: z.boolean(),
  animBusy: z.boolean(),
  paused: z.boolean(),
  inShop: z.boolean(),
  roundEval: z.boolean(),
  handsLeft: z.number().int().min(0),
  ante: z.number().int().min(0),
  blindKey: zNullishKey,
});
export type BridgeFlags = z.infer<typeof zFlags>;

export const zTimerState = z.object({
  value: z.number(),
  mode: z.enum(['ante', 'pvp', 'speedlatro']),
  ticking: z.boolean(),
  beingTimered: z.boolean(),
  timering: z.boolean(),
  pressable: z.boolean(),
  auto: z.boolean(),
  color: z.enum(['normal', 'orange', 'important']),
  display: z.literal('>>').nullable(),
});
export type TimerState = z.infer<typeof zTimerState>;

export const zReplayListItem = z.object({
  id: z.string().max(64),
  at: z.number(),
  queueMode: zQueueMode,
  ruleset: zRulesetKey,
  players: z.array(z.string().max(64)).max(16),
  result: z.enum(['win', 'lose', 'draw']).nullable(),
});

/* ─── Lua → JS ───────────────────────────────────────────────────────────── */

/** Entry phase (core, before the MP pack loads). */
export const L2J_ENTRY = {
  mp_open: z.object({ intent: z.enum(['menu', 'join', 'rejoin', 'invite']) }),
  mp_log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    msg: z.string().max(4096),
  }),
} as const satisfies Record<string, z.ZodType>;

/** MP phase: UI intents, game events, state flags. */
export const L2J_MP = {
  ui_create_lobby: z.object({ queueMode: zQueueMode, kind: z.enum(['private', 'party']) }),
  ui_join: z.object({ code: zCode }),
  ui_join_clipboard: z.object({}),
  ui_copy_code: z.object({}),
  /** Opens the React popover. */
  ui_invite: z.object({}),
  ui_leave: z.object({}),
  ui_ready: z.object({ ready: z.boolean() }),
  /** Host only. */
  ui_set_option: z.object({
    key: zLobbyOptionKey,
    value: z.union([
      z.number(),
      z.boolean(),
      z.string().max(64),
      z.array(z.string().max(40)).max(32),
    ]),
  }),
  ui_set_team: z.object({ team: zTeam }),
  ui_set_deck: z.object({
    deck: zKey,
    stake: zStake,
    mpStake: zMpStake.nullish(),
    challenge: zNullishKey,
  }),
  ui_start: z.object({}),
  ui_kick: z.object({ userId: zId, on: z.boolean().optional() }),
  ui_mute: z.object({ userId: zId, on: z.boolean().optional() }),
  ui_queue: z.object({ op: z.enum(['join', 'leave']), queueMode: zQueueMode }),
  ui_party_queue: z.object({ queueMode: zQueueMode }),
  ui_vote: z.object({ stepId: z.string().max(32), option: z.string().max(64) }),
  ui_draft: z.object({ stepId: z.string().max(32), key: zKey }),
  ui_chat: z.object({ text: zText }),
  ui_practice: z.object({ ruleset: zRulesetKey, deck: zKey, stake: zStake, seed: zSeed.nullish() }),
  ui_settings: z.object({
    avatarJoker: zKey.optional(),
    blindCol: zBlindCol.optional(),
    nemesisLayout: z.enum(['standard', 'mirrored', 'classic']).optional(),
    timerSound: z.enum(['always', 'once', 'off']).optional(),
    showMpContent: z.boolean().optional(),
    chat: z.boolean().optional(),
  }),
  ui_return_lobby: z.object({}),
  ui_continue_sp: z.object({}),
  ui_spectate: z.object({ code: zCode }),
  /** WS13: ask the hub for the spectatable lobbies (answered with `spectate_view`). */
  ui_spectate_list: z.object({}),
  ui_replay: z.object({
    op: z.enum(['list', 'open', 'speed', 'seek', 'pov', 'close']),
    id: z.string().max(64).optional(),
    value: z.union([z.number(), z.string().max(64)]).optional(),
  }),
  ui_seat: z.object({ op: z.enum(['rejoin', 'abandon']) }),
  /** The same GameEvent union as the wire `game` kind. */
  ev: z.object({ e: zGameEvent }),
  /** JS routes it per §3.b. */
  peer: peerL2J,
  /** Only when changed. */
  flags: zFlags,
  timer_input: z.object({ op: z.enum(['press', 'skip', 'hand_played', 'opp_skip']) }),
  /** run.jkr and state.json written. */
  snapshot: z.object({ runId: zRunId }),
  log: z.object({ batch: z.array(zReplayEvent).max(1024) }),
  match_left: z.object({ how: z.enum(['leave', 'continue_sp', 'return_lobby']) }),
  deck_res_local: WIRE_D.deck_res,
  stats_local: WIRE_D.stats_res,
  /** Test builds only. */
  test_res: z.object({ id: z.string().max(64), ok: z.boolean(), data: z.unknown().optional() }),
} as const satisfies Record<string, z.ZodType>;

export const L2J = { ...L2J_ENTRY, ...L2J_MP } as const;

/* ─── JS → Lua ───────────────────────────────────────────────────────────── */

export const J2L_ENTRY = {
  mp_pack: z.object({
    status: z.enum(['loading', 'ready', 'error']),
    progress: z.number().min(0).max(1).optional(),
    error: z.string().max(256).optional(),
  }),
} as const satisfies Record<string, z.ZodType>;

export const J2L_MP = {
  net_status: z.object({
    hub: z.enum(['connected', 'connecting', 'offline']),
    reason: z.string().max(64).optional(),
    account: z.object({ name: z.string().max(64), avatarUrl: z.string().max(512).nullable() }),
  }),
  lobby_view: z.object({
    state: zLobbyState,
    me: zId,
    isHost: z.boolean(),
    canStart: z.boolean(),
    startBlockReason: z.string().max(64).optional(),
  }),
  lobby_error: z.object({ code: z.string().max(32) }),
  toast: z.object({
    key: z.string().max(64),
    vars: z.record(z.string().max(32), z.union([z.string().max(256), z.number()])).optional(),
  }),
  setup_view: zSetupView,
  queue_view: z.object({
    state: z.enum(['idle', 'searching', 'matched', 'cancelled']),
    queueMode: zQueueMode,
    waiting: z.number().int().min(0).optional(),
  }),
  chat_line: z.object({
    from: zId,
    name: z.string().max(64),
    text: zText,
    kind: z.enum(['in', 'own', 'system']),
  }),
  vote_progress: z.object({
    kind: z.enum(['seed', 'draw']),
    k: z.number().int().min(0),
    n: z.number().int().min(0),
  }),
  match_start: zStartedMatch.extend({
    me: zId,
    /** Reload rejoin: the replay log continues at this index (the host's count of it). */
    logNext: z.number().int().min(0).max(20_000).optional(),
  }),
  practice_start: z.object({
    resolved: zResolvedRuleset,
    deck: zKey,
    stake: zStake,
    seed: zSeed.nullable(),
  }),
  /** The same union as §3.f outputs. */
  outcome: z.object({ o: zRefMsg, hs: z.number().int().min(0) }),
  /** Already filtered for "from my current target" where §3.b says so. */
  peer: peerJ2L,
  timer_state: zTimerState,
  /** Timpani. */
  timer_cue: z.object({}),
  presence: WIRE_D.presence,
  host_changed: z.object({ hostId: zId }),
  rejoin_restore: z.object({
    runId: zRunId,
    snapshotPath: z.literal(BRIDGE_PATHS.MP_RUN),
    statePath: z.literal(BRIDGE_PATHS.MP_STATE),
  }),
  /** Apply at the next safe point. */
  tail: z.object({ id: zId, results: z.array(zHandResult).max(256) }),
  end_data: z.object({
    players: z.record(zId, zPlayerResult),
    deck: WIRE_D.deck_res.optional(),
    stats: WIRE_D.stats_res.optional(),
  }),
  replay_view: z.object({
    list: z.array(zReplayListItem).max(30).optional(),
    playing: z
      .object({ id: z.string().max(64), pov: zId, pos: z.number().min(0), len: z.number().min(0) })
      .nullable()
      .optional(),
    speed: z.number().min(0).optional(),
  }),
  replay_feed: z.object({ pov: zId, events: z.array(zReplayEvent).max(1024) }),
  /** WS13: the hub's spectatable lobbies (MM-07), or `error` when the list is unavailable. */
  spectate_view: z.object({
    lobbies: z
      .array(
        z.object({
          code: zCode,
          queueMode: zQueueMode,
          players: z.number().int().min(0),
          ante: z.number().int().nullable(),
        }),
      )
      .max(50),
    error: z.string().max(32).optional(),
  }),
  history: z.object({
    wins: z.number().int().min(0),
    losses: z.number().int().min(0),
    games: z.number().int().min(0),
    pvpGames: z.number().int().min(0),
    streak: z.number().int().min(0),
    days: z.number().int().min(0),
  }),
  /** Informational; sanitising happens in TS. */
  glyphs: z.object({ fontKey: z.string().max(64), path: z.literal(BRIDGE_PATHS.GLYPHS) }),
  /** Test builds only. */
  test_cmd: z.object({
    id: z.string().max(64),
    cmd: z.string().max(64),
    args: z.array(z.unknown()).max(32),
  }),
} as const satisfies Record<string, z.ZodType>;

export const J2L = { ...J2L_ENTRY, ...J2L_MP } as const;

export type L2JType = keyof typeof L2J;
export type J2LType = keyof typeof J2L;
export type L2JData<T extends L2JType> = z.infer<(typeof L2J)[T]>;
export type J2LData<T extends J2LType> = z.infer<(typeof J2L)[T]>;
export type L2JMessage = { [T in L2JType]: { s: number; t: T; d: L2JData<T> } }[L2JType];
export type J2LMessage = { [T in J2LType]: { s: number; t: T; d: J2LData<T> } }[J2LType];

export const L2J_TYPES = Object.keys(L2J) as L2JType[];
export const J2L_TYPES = Object.keys(J2L) as J2LType[];

/* ─── Line framing ───────────────────────────────────────────────────────── */

export const zBatchHeader = z.object({
  h: z.literal(1),
  ack: z.number().int().min(0),
  fr: z.number().int().min(0),
});
export type BatchHeader = z.infer<typeof zBatchHeader>;

export const zLine = z.object({
  s: z.number().int().min(0),
  t: z.string().min(1).max(32),
  d: z.unknown(),
});

export type ParseResult<M> =
  | { ok: true; msg: M }
  | {
      ok: false;
      error: 'json' | 'too-large' | 'line' | 'unknown-type' | 'data';
      t?: string;
      detail?: string;
    };

/** UTF-8 byte length without TextEncoder allocation per call. */
export function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i += 1;
    } else n += 3;
  }
  return n;
}

function normaliseD(d: unknown): unknown {
  return Array.isArray(d) && d.length === 0 ? {} : d;
}

function parseLine<M>(schemas: Record<string, z.ZodType>, raw: unknown): ParseResult<M> {
  const line = zLine.safeParse(raw);
  if (!line.success) return { ok: false, error: 'line' };
  const schema = Object.prototype.hasOwnProperty.call(schemas, line.data.t)
    ? schemas[line.data.t]
    : undefined;
  if (!schema) return { ok: false, error: 'unknown-type', t: line.data.t };
  const d = schema.safeParse(normaliseD(line.data.d));
  if (!d.success)
    return { ok: false, error: 'data', t: line.data.t, detail: d.error.issues[0]?.message };
  return { ok: true, msg: { s: line.data.s, t: line.data.t, d: d.data } as M };
}

/** Validate one already-decoded message in the given direction. */
export function parseBridgeMessage(dir: 'l2j', raw: unknown): ParseResult<L2JMessage>;
export function parseBridgeMessage(dir: 'j2l', raw: unknown): ParseResult<J2LMessage>;
export function parseBridgeMessage(
  dir: 'l2j' | 'j2l',
  raw: unknown,
): ParseResult<L2JMessage | J2LMessage> {
  return parseLine(dir === 'l2j' ? L2J : J2L, raw);
}

export interface LuaBatch {
  header: BatchHeader | null;
  messages: L2JMessage[];
  /** Lines dropped (malformed, oversized, unknown type, invalid data). */
  dropped: { line: number; error: string; t?: string; detail?: string }[];
}

/** Parse a Lua→JS NDJSON batch (the content of `/rmh/net/out`). Never throws. */
export function parseLuaBatch(text: string): LuaBatch {
  const out: LuaBatch = { header: null, messages: [], dropped: [] };
  if (utf8Length(text) > BRIDGE_LIMITS.BATCH_MAX_BYTES) {
    out.dropped.push({ line: 0, error: 'too-large' });
    return out;
  }
  const lines = text.split('\n');
  lines.forEach((src, i) => {
    if (src.trim() === '') return;
    if (utf8Length(src) > BRIDGE_LIMITS.LINE_MAX_BYTES) {
      out.dropped.push({ line: i, error: 'too-large' });
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(src);
    } catch {
      out.dropped.push({ line: i, error: 'json' });
      return;
    }
    if (out.header === null && out.messages.length === 0 && i === firstNonEmpty(lines)) {
      const h = zBatchHeader.safeParse(raw);
      if (h.success) {
        out.header = h.data;
        return;
      }
    }
    const r = parseBridgeMessage('l2j', raw);
    if (r.ok) out.messages.push(r.msg);
    else out.dropped.push({ line: i, error: r.error, t: r.t, detail: r.detail });
  });
  return out;
}

function firstNonEmpty(lines: string[]): number {
  return lines.findIndex((l) => l.trim() !== '');
}

/** One JS→Lua line (no trailing newline). Validates `d`; throws on a programming error. */
export function encodeJsLine<T extends J2LType>(s: number, t: T, d: J2LData<T>): string {
  const parsed = J2L[t].parse(d);
  const line = JSON.stringify({ s, t, d: parsed });
  if (utf8Length(line) > BRIDGE_LIMITS.LINE_MAX_BYTES) {
    throw new Error(`bridge line for ${t} exceeds ${BRIDGE_LIMITS.LINE_MAX_BYTES} bytes`);
  }
  return line;
}
