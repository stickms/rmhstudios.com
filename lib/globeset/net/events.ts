/**
 * GlobeSet's race protocol — one declaration, both sides' types, one validator.
 *
 * Imported verbatim by the browser client (`lib/globeset/socket.ts`) and by
 * `server/socket-server/handlers/globeset.ts`, so neither half can invent an
 * event name or a field the other does not know. Free of any browser import:
 * the esbuild server bundle pulls this file in as-is.
 *
 * ## The server is authoritative, and cheaply so
 *
 * Every racer works the *same deal* — one seed, one deck — but each has their
 * own board, because GlobeSet is a race to clear a deck rather than a contest
 * over one shared board. The server therefore keeps one `RunState` per player
 * and replays every submission against it: a submission names **cards**, not
 * board positions, and is accepted only if those cards are on that player's
 * board, distinct, and XOR to zero.
 *
 * Positions would have been the smaller payload and the wrong one — a board
 * index means something different the instant a refill lands, so a submission
 * in flight across a refill would apply to the wrong cards. Card masks are
 * self-describing and idempotent, and they are six bits each.
 *
 * Validating centrally costs a handful of XORs per submission, which buys a
 * race whose result does not depend on trusting a browser. `globeset:board` is
 * the truth the client reconciles to; the client still applies its own move
 * immediately, because a correct move always survives the round trip.
 */

import { z } from 'zod';
import {
  defineEvents,
  type ClientToServer,
  type ServerToClient,
} from '../../shared/realtime/contract';
import { DECK_SIZE, BOARD_SIZE } from '../cards';
import { MAX_RACE_PLAYERS, type RaceGoal, type SprintTarget } from '../constants';

/** socket.io room prefix. Isolates GlobeSet traffic inside the shared hub. */
export const ROOM_PREFIX = 'globeset:';

/* ─── Shared value schemas ───────────────────────────────────────────────── */

/** A card mask, 1–63. Zero is not a card; anything else is a modified client. */
const CardZ = z.number().int().min(1).max(DECK_SIZE);

const RoomCodeZ = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/);

// Spelled out rather than derived from the constant arrays: `z.enum` and
// `z.union` want literal tuples, and casting a `readonly T[]` into one buys a
// compile error in exchange for nothing. The gate is the type annotations
// below — they fail the typecheck if these ever stop matching `constants.ts`.
const GoalZ: z.ZodType<RaceGoal> = z.enum(['clear', 'sprint']);
const SprintTargetZ: z.ZodType<SprintTarget> = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
]);

/**
 * Settings carried by `create` and `settings`.
 *
 * Every field defaulted rather than required: the contract has to tolerate the
 * client the server meets, and an older bundle that omits `goal` should get a
 * standard race, not a disconnect.
 */
const SettingsZ = z.object({
  isPublic: z.boolean().default(true),
  goal: GoalZ.default('clear'),
  sprintTarget: SprintTargetZ.default(10),
});

export type RaceSettings = z.infer<typeof SettingsZ>;

/**
 * A settings CHANGE, where an absent field means "leave it alone".
 *
 * Deliberately NOT `SettingsZ.partial()`, which is what this was and which is
 * wrong in a way nothing catches: `.partial()` wraps each field in
 * `optional()`, but the field's own `.default()` still fires for an absent
 * key, so `{ sprintTarget: 5 }` parses to
 * `{ isPublic: true, goal: 'clear', sprintTarget: 5 }` — and a host picking a
 * sprint length silently reset the goal to a full deck and the room to public.
 * Optional without a default is the only shape that means "unchanged".
 */
const SettingsPatchZ = z.object({
  isPublic: z.boolean().optional(),
  goal: GoalZ.optional(),
  sprintTarget: SprintTargetZ.optional(),
});

export type RaceSettingsPatch = z.infer<typeof SettingsPatchZ>;

/* ─── Lobby shapes (server → client) ─────────────────────────────────────── */

export type RacePhase = 'waiting' | 'countdown' | 'playing' | 'results';

export interface RacePlayer {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  isHost: boolean;
}

export interface LobbySnapshot extends RaceSettings {
  code: string;
  phase: RacePhase;
  hostSocketId: string;
  players: RacePlayer[];
  maxPlayers: number;
}

export interface PublicLobbyInfo {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  goal: RaceGoal;
  sprintTarget: number;
}

/** Everything a client needs to deal the race locally and start the clock. */
export interface RaceStartPayload {
  /** The whole of the synchronisation: one seed, one deal, everybody. */
  seed: number;
  goal: RaceGoal;
  sprintTarget: number;
  /** Server epoch-ms the first move is legal. Countdown is `startsAt - now`. */
  startsAt: number;
  roster: { socketId: string; userId: string; name: string; avatarUrl: string | null }[];
}

/** The authoritative view of one player's own board. Never sent to opponents. */
export interface BoardPayload {
  board: number[];
  drawIndex: number;
  /** Cards no longer in play — the progress rail's numerator. */
  cleared: number;
  globeSets: number;
  misses: number;
  /** Set once this player has met the goal. */
  finishedAtMs: number | null;
}

/** One line of the live standings strip. Deliberately tiny — it ticks. */
export interface LiveStanding {
  socketId: string;
  cleared: number;
  globeSets: number;
  misses: number;
  done: boolean;
}

export interface FinalStanding {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  placement: number;
  /** Milliseconds from the start signal, or null for a player who never finished. */
  timeMs: number | null;
  cleared: number;
  globeSets: number;
  misses: number;
  forfeited: boolean;
}

export type RejectReason =
  'not-a-globeset' | 'not-your-card' | 'not-playing' | 'already-finished' | 'duplicate-card';

/* ─── The contract ───────────────────────────────────────────────────────── */

export const EVENTS = defineEvents({
  // ── Lobby ────────────────────────────────────────────────────────────────
  'globeset:create': { c2s: SettingsZ },
  'globeset:join': { c2s: z.object({ code: RoomCodeZ }) },
  'globeset:quickplay': { c2s: z.object({}).default({}) },
  'globeset:browse': { c2s: z.object({}).default({}) },
  'globeset:leave': { c2s: z.object({}).default({}) },
  'globeset:ready': { c2s: z.object({ ready: z.boolean() }) },
  'globeset:settings': { c2s: SettingsPatchZ },
  'globeset:start': { c2s: z.object({}).default({}) },
  'globeset:rematch': { c2s: z.object({}).default({}) },
  /** Redeem a party ticket to be seated in the party's room. */
  'globeset:ticket': { c2s: z.object({ ticket: z.string().min(1).max(2048) }) },

  // ── Play ─────────────────────────────────────────────────────────────────
  /**
   * A claimed GlobeSet, as card masks. Bounded by the board: a submission can
   * never name more cards than are face-up.
   */
  'globeset:submit': { c2s: z.object({ cards: z.array(CardZ).min(1).max(BOARD_SIZE) }) },
  /** Give up. Ranks below everyone who finished, and keeps the room moving. */
  'globeset:forfeit': { c2s: z.object({}).default({}) },

  // ── Server → client ──────────────────────────────────────────────────────
  'globeset:lobby': { s2c: z.custom<LobbySnapshot>() },
  'globeset:browseResult': { s2c: z.custom<{ lobbies: PublicLobbyInfo[] }>() },
  'globeset:joined': { s2c: z.custom<{ code: string; socketId: string }>() },
  'globeset:countdown': { s2c: z.custom<RaceStartPayload>() },
  'globeset:board': { s2c: z.custom<BoardPayload>() },
  'globeset:reject': { s2c: z.custom<{ reason: RejectReason }>() },
  'globeset:standings': { s2c: z.custom<{ standings: LiveStanding[] }>() },
  'globeset:results': { s2c: z.custom<{ standings: FinalStanding[] }>() },
  'globeset:kicked': { s2c: z.custom<{ reason: string }>() },
  'globeset:error': { s2c: z.custom<{ message: string }>() },
});

export type GlobeSetC2S = ClientToServer<typeof EVENTS>;
export type GlobeSetS2C = ServerToClient<typeof EVENTS>;

/** Convenience names so neither side inlines an event string. */
export const C2S = {
  CREATE: 'globeset:create',
  JOIN: 'globeset:join',
  QUICKPLAY: 'globeset:quickplay',
  BROWSE: 'globeset:browse',
  LEAVE: 'globeset:leave',
  READY: 'globeset:ready',
  SETTINGS: 'globeset:settings',
  START: 'globeset:start',
  REMATCH: 'globeset:rematch',
  TICKET: 'globeset:ticket',
  SUBMIT: 'globeset:submit',
  FORFEIT: 'globeset:forfeit',
} as const;

export const S2C = {
  LOBBY: 'globeset:lobby',
  BROWSE_RESULT: 'globeset:browseResult',
  JOINED: 'globeset:joined',
  COUNTDOWN: 'globeset:countdown',
  BOARD: 'globeset:board',
  REJECT: 'globeset:reject',
  STANDINGS: 'globeset:standings',
  RESULTS: 'globeset:results',
  KICKED: 'globeset:kicked',
  ERROR: 'globeset:error',
} as const;

export { MAX_RACE_PLAYERS };
