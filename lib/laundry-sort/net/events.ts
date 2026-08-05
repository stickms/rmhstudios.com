/**
 * Laundry Sort — multiplayer protocol.
 *
 * Imported by **both** the browser client and
 * `server/socket-server/handlers/laundry-sort.ts`, so the two can never drift
 * on an event name. Deliberately free of any browser or three.js import: the
 * Node bundle pulls this file in verbatim.
 *
 * Division of labour, matching the other hub games (Dream Rift, RMH Type):
 * the server owns the **lobby, the seed and the clock**; each client owns its
 * own cloth simulation. The server never simulates fabric — it does not need
 * to, because the seed guarantees both players are handed identical laundry and
 * the score is a count of outcomes, not a physics claim.
 *
 * ## This is the reference migration for the typed contract (C3)
 *
 * The `C2S`/`S2C` name maps below are unchanged and still the thing everyone
 * imports. What is new is {@link EVENTS}: the same names with a zod schema
 * attached, so the payload is declared where the name is, once, for both sides.
 * `server/socket-server/handlers/laundry-sort.ts` binds it through
 * `bindEvents()` and no longer hand-rolls `sanitizeReport`/`isDuration`
 * coercions; the browser client gets `LaundryC2S`/`LaundryS2C` to type its
 * `emit`/`on`.
 *
 * The schemas encode **the tolerance the handlers already had**, not an
 * idealised one — see the note on {@link ScoreReportZ}. That is the rule for
 * migrating the remaining apps: a contract that is stricter than the shipped
 * server disconnects honest clients running last week's bundle.
 */

import { z } from 'zod';
import {
  defineEvents,
  type ClientToServer,
  type ServerToClient,
} from '../../shared/realtime/contract';
import { DIFFICULTIES, MATCH_DURATIONS, type Difficulty, type MatchDuration } from '../constants';

export const ROOM_PREFIX = 'ls:';

/** Client → server. Every one of these is rate-limited in `config.ts`. */
export const C2S = {
  CREATE: 'ls:create',
  JOIN: 'ls:join',
  QUICKPLAY: 'ls:quickplay',
  BROWSE: 'ls:browse',
  LEAVE: 'ls:leave',
  READY: 'ls:ready',
  SETTINGS: 'ls:settings',
  START: 'ls:start',
  KICK: 'ls:kick',
  /** Running score during a match, published on a timer. */
  SCORE: 'ls:score',
  /** This client's simulated clock reached the duration. */
  FINISH: 'ls:finish',
  REMATCH: 'ls:rematch',
  /** Redeem a party ticket to be seated in the party's room. */
  TICKET: 'ls:ticket',
} as const;

/** Server → client. */
export const S2C = {
  LOBBY: 'ls:lobby',
  BROWSE_RESULT: 'ls:browseResult',
  JOINED: 'ls:joined',
  ERROR: 'ls:error',
  COUNTDOWN: 'ls:countdown',
  START: 'ls:start',
  /** One batched array per tick — never one message per player per tick. */
  SCORES: 'ls:scores',
  RESULTS: 'ls:results',
  KICKED: 'ls:kicked',
  HOST_CHANGED: 'ls:hostChanged',
} as const;

export type LobbyState = 'waiting' | 'countdown' | 'playing' | 'results';

export interface LobbyPlayer {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  isHost: boolean;
}

export interface LobbySettings {
  isPublic: boolean;
  durationSec: MatchDuration;
  difficulty: Difficulty;
}

export interface LobbySnapshot extends LobbySettings {
  code: string;
  hostSocketId: string;
  state: LobbyState;
  players: LobbyPlayer[];
  maxPlayers: number;
}

export interface PublicLobbyInfo {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  durationSec: number;
  difficulty: Difficulty;
}

export interface MatchStartPayload {
  /** The whole point: identical laundry for everyone in the room. */
  seed: number;
  durationSec: number;
  difficulty: Difficulty;
  roster: { socketId: string; userId: string; name: string; avatarUrl: string | null }[];
  /** Server epoch-ms the match began — used only for display, never for scoring. */
  startedAt: number;
}

export interface LiveScore {
  socketId: string;
  score: number;
  combo: number;
  sorted: number;
  missed: number;
  /** True once this player's own clock has run out. */
  done: boolean;
}

export interface FinalStanding {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  score: number;
  sorted: number;
  wrong: number;
  missed: number;
  bestCombo: number;
  /** 1-based. Ties share a place. */
  place: number;
}

export interface MatchResults {
  standings: FinalStanding[];
  durationSec: number;
  difficulty: Difficulty;
}

/** Payload for {@link C2S.SCORE} and {@link C2S.FINISH}. */
export interface ScoreReport {
  score: number;
  combo: number;
  sorted: number;
  wrong: number;
  missed: number;
  bestCombo: number;
}

/* ═══ The typed contract (C3) ═════════════════════════════════════════════ */

/**
 * The score a client reports for itself.
 *
 * **This schema is the old `sanitizeReport()` from the server handler**, moved
 * into the contract where both sides can see it. Every field clamps rather than
 * rejects, for two reasons that are really one reason:
 *
 *  - The server is not the authority on this number — each client simulates its
 *    own cloth — so the honest response to a strange value has always been to
 *    bound it, not to hang up.
 *  - socket.io serialises through JSON, and JSON has no `NaN`: a client-side
 *    arithmetic bug arrives here as `null`. Under a strict schema that is a
 *    `protocol:error` and a **disconnect mid-match**. Under this one it is a
 *    zero, which is exactly what shipped before.
 *
 * A contract that is stricter than the server it replaces is a regression
 * wearing a safety jacket.
 */
const clampedCount = (max: number) =>
  z.unknown().transform((raw) => {
    const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0;
    return Math.max(0, Math.min(n, max));
  });

export const ScoreReportZ = z.object({
  score: clampedCount(1_000_000),
  combo: clampedCount(10_000),
  sorted: clampedCount(10_000),
  wrong: clampedCount(10_000),
  missed: clampedCount(10_000),
  bestCombo: clampedCount(10_000),
});

/**
 * A settings patch (`ls:create`, `ls:settings`).
 *
 * Structurally permissive on purpose: the handler has always treated an absent
 * or out-of-range field as "use the default" (`isDuration`/`isDifficulty`
 * guards), so a `durationSec` of 999 must parse and then fall back — not
 * disconnect. `.catch(undefined)` per field reproduces that precisely, and the
 * outer `.catch({})` covers a payload that is not an object at all, which the
 * old `(payload ?? {}) as Record<string, unknown>` also tolerated.
 */
export const LobbySettingsPatchZ = z
  .object({
    isPublic: z.boolean().optional().catch(undefined),
    durationSec: z.number().optional().catch(undefined),
    difficulty: z.string().optional().catch(undefined),
  })
  .catch({});

/**
 * For the five events whose payload the server ignores entirely
 * (`quickplay`, `browse`, `leave`, `start`, `rematch`).
 *
 * `z.unknown()` rather than `z.object({})`: there is nothing to protect, and a
 * schema that can fail on an ignored payload is a disconnect waiting to happen
 * the first time a client sends `undefined` instead of `{}`.
 */
const IgnoredZ = z.unknown();

const LobbyStateZ = z.enum(['waiting', 'countdown', 'playing', 'results']);
const DifficultyZ = z.enum(DIFFICULTIES);
const DurationZ = z.union([z.literal(60), z.literal(90), z.literal(120)]);

const LobbyPlayerZ = z.object({
  socketId: z.string(),
  userId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  ready: z.boolean(),
  isHost: z.boolean(),
});

const LobbySnapshotZ = z.object({
  code: z.string(),
  hostSocketId: z.string(),
  isPublic: z.boolean(),
  durationSec: DurationZ,
  difficulty: DifficultyZ,
  state: LobbyStateZ,
  players: z.array(LobbyPlayerZ),
  maxPlayers: z.number().int(),
});

const PublicLobbyInfoZ = z.object({
  code: z.string(),
  hostName: z.string(),
  playerCount: z.number().int(),
  maxPlayers: z.number().int(),
  durationSec: z.number(),
  difficulty: DifficultyZ,
});

const MatchStartPayloadZ = z.object({
  seed: z.number(),
  durationSec: z.number(),
  difficulty: DifficultyZ,
  roster: z.array(
    z.object({
      socketId: z.string(),
      userId: z.string(),
      name: z.string(),
      avatarUrl: z.string().nullable(),
    }),
  ),
  startedAt: z.number(),
});

const LiveScoreZ = z.object({
  socketId: z.string(),
  score: z.number(),
  combo: z.number(),
  sorted: z.number(),
  missed: z.number(),
  done: z.boolean(),
});

const FinalStandingZ = z.object({
  socketId: z.string(),
  userId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  score: z.number(),
  sorted: z.number(),
  wrong: z.number(),
  missed: z.number(),
  bestCombo: z.number(),
  place: z.number().int(),
});

const MatchResultsZ = z.object({
  standings: z.array(FinalStandingZ),
  durationSec: z.number(),
  difficulty: DifficultyZ,
});

/**
 * Every Laundry Sort event, with the payload each direction carries.
 *
 * The keys are the same strings as `C2S`/`S2C` above — written out literally
 * because a computed key (`[C2S.CREATE]:`) erases the literal type the whole
 * contract is built on. `socket-contract.test.ts` asserts the two stay in step,
 * which is the cheaper way to buy that guarantee.
 *
 * `s2c` schemas are declarative only: the server is trusted, so nothing
 * re-parses them at runtime. They exist to type the client's `on()` and to give
 * the protocol hash something to move when a broadcast shape changes.
 */
export const EVENTS = defineEvents({
  // ─── Client → server ──────────────────────────────────────────────────
  'ls:create': { c2s: LobbySettingsPatchZ },
  'ls:join': { c2s: z.object({ code: z.string() }) },
  'ls:quickplay': { c2s: IgnoredZ },
  'ls:browse': { c2s: IgnoredZ },
  'ls:leave': { c2s: IgnoredZ },
  'ls:ready': { c2s: z.object({ ready: z.boolean().optional() }) },
  'ls:settings': { c2s: LobbySettingsPatchZ },
  /**
   * Bidirectional, and the contract is how we found out.
   *
   * `C2S.START` and `S2C.START` are both the literal string `ls:start`: the
   * host pressing Start and the server announcing the seed have always shared
   * one event name. Two name maps can hide that indefinitely — one object with
   * unique keys cannot, which is the point. Declared as one event carrying both
   * directions, so `bindEvents` listens for the command and the client's `on()`
   * is typed to {@link MatchStartPayload}.
   */
  'ls:start': { c2s: IgnoredZ, s2c: MatchStartPayloadZ },
  'ls:kick': { c2s: z.object({ socketId: z.string() }) },
  'ls:score': { c2s: ScoreReportZ },
  'ls:finish': { c2s: ScoreReportZ },
  'ls:rematch': { c2s: IgnoredZ },
  'ls:ticket': { c2s: z.object({ token: z.string() }) },

  // ─── Server → client ──────────────────────────────────────────────────
  'ls:lobby': { s2c: LobbySnapshotZ },
  'ls:browseResult': { s2c: z.array(PublicLobbyInfoZ) },
  'ls:joined': { s2c: z.object({ code: z.string(), socketId: z.string() }) },
  'ls:error': { s2c: z.object({ message: z.string() }) },
  'ls:countdown': { s2c: z.object({ seconds: z.number().int() }) },
  // 'ls:start' is declared above — it carries both directions.
  'ls:scores': { s2c: z.array(LiveScoreZ) },
  'ls:results': { s2c: MatchResultsZ },
  'ls:kicked': { s2c: z.object({}) },
  'ls:hostChanged': { s2c: z.object({ hostSocketId: z.string() }) },
});

/** Typed `emit` for the browser client: `Socket<LaundryS2C, LaundryC2S>`. */
export type LaundryC2S = ClientToServer<typeof EVENTS>;
/** Typed `on` for the browser client. */
export type LaundryS2C = ServerToClient<typeof EVENTS>;
