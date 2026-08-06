/**
 * Slice It — the multiplayer protocol.
 *
 * Imported by **both** the browser client and
 * `server/socket-server/handlers/slice-it.ts`, so the two can never drift on an
 * event name or a payload shape. Deliberately free of browser and Node imports:
 * the esbuild server bundle compiles this file verbatim.
 *
 * ## What changed, and why
 *
 * The old protocol was eleven bare event names — `join_lobby`, `start_game`,
 * `score_update` — on the games hub's single shared namespace, with no prefix,
 * no schema and no entry in the hub's rate-limit map. Three consequences, all
 * of which this contract closes:
 *
 * 1. **The names were global.** `start_game` is not a Slice It event, it is a
 *    guess at one. Every event here is `slice:*`, matching the rest of the hub.
 * 2. **The lobby id came from the client.** `join_lobby` took whatever string
 *    you sent and `sanitizeLobbyId` turned an empty one into `"default"` — so
 *    every player who arrived without a code landed in the same room, and any
 *    player could join any other lobby by guessing six characters. Codes are
 *    now minted server-side and a join is a lookup, not a create.
 * 3. **The song was a client-supplied object.** `select_song` accepted `any` and
 *    broadcast it to the room verbatim, which let a host point every other
 *    player's audio element at an arbitrary URL. The host now sends a *song id*
 *    and the server resolves the row itself.
 *
 * ## Division of labour
 *
 * The server owns the lobby, the roster, the countdown and the results. Each
 * client owns its own judgement of its own input — there is no server-side
 * rhythm simulation, and there could not usefully be one, because the thing
 * being judged is audio latency on the player's own machine. Live scores are
 * therefore *claims*, broadcast for the sidebar; the authoritative record is
 * the score endpoint, which bounds a submission against the song's length (see
 * `lib/slice-it/scoring.ts#maxPlausibleScore`).
 */

import { z } from 'zod';
import {
  defineEvents,
  type ClientToServer,
  type ServerToClient,
} from '../../shared/realtime/contract';
import { CHAT_MAX_LENGTH, LOBBY_CODE_LENGTH, MAX_LOBBY_PLAYERS } from '../constants';
import { ModifiersZ } from '../modifiers';
import type { Modifiers } from '../types';

export const ROOM_PREFIX = 'slice:';

/** Client → server. Every one of these is rate-limited in `config.ts`. */
export const C2S = {
  CREATE: 'slice:create',
  JOIN: 'slice:join',
  QUICKPLAY: 'slice:quickplay',
  BROWSE: 'slice:browse',
  /**
   * Watch a lobby without taking one of its eight seats (`N1`). A spectator
   * joins a parallel `:spec` room and receives the same broadcasts; they never
   * appear in the roster and never affect whether a match can start.
   */
  SPECTATE: 'slice:spectate',
  LEAVE: 'slice:leave',
  READY: 'slice:ready',
  /** Host picks a track. Payload is an id; the server resolves the row. */
  SONG: 'slice:song',
  /** Host toggles lobby-level settings (public listing). */
  SETTINGS: 'slice:settings',
  /** A player's own modifiers — per-seat, not lobby-wide. */
  MODS: 'slice:mods',
  START: 'slice:start',
  /** This client has decoded the audio and built its chart. */
  LOADED: 'slice:loaded',
  /** Running score during a match, published on a timer. */
  SCORE: 'slice:score',
  /** This client reached the end of the song. */
  FINISH: 'slice:finish',
  /** Host sends everyone back to the lobby after results. */
  REMATCH: 'slice:rematch',
  CHAT: 'slice:chat',
  KICK: 'slice:kick',
} as const;

/** Server → client. */
export const S2C = {
  LOBBY: 'slice:lobby',
  JOINED: 'slice:joined',
  ERROR: 'slice:error',
  BROWSE_RESULT: 'slice:browseResult',
  /** Per-player chart-load progress during the pre-match wait. */
  LOADING: 'slice:loading',
  COUNTDOWN: 'slice:countdown',
  /** The match is live. Carries the resolved song and the roster. */
  START: 'slice:start',
  /** One batched array per tick — never one message per player per tick. */
  SCORES: 'slice:scores',
  RESULTS: 'slice:results',
  KICKED: 'slice:kicked',
  CHAT: 'slice:chat',
  /**
   * Someone dropped mid-match; everyone else's audio stops until they are back
   * or their window expires. See {@link PausePayload}.
   */
  PAUSE: 'slice:pause',
  /** The hold is over. Carries the moment play actually restarts. */
  RESUME: 'slice:resume',
} as const;

/* ─── Shapes ─────────────────────────────────────────────────────────────── */

export type LobbyState = 'waiting' | 'loading' | 'countdown' | 'playing' | 'results';

/**
 * A guest identity, as it exists for exactly one session.
 *
 * Sourced from a Discord Activity token the hub verified against Discord; held
 * in the lobby's memory and gone the moment the seat is. Nothing here is ever
 * written to a table or copied into object storage — see `X10` in
 * `docs/plans/2026-08-06-slice-it-feature-ideas.md` for why a shadow `User` row
 * is the wrong answer to "let them play".
 */
export interface GuestIdentity {
  /** Discord display name, shown as-is. Never written to any table. */
  name: string;
  /** Discord CDN avatar URL. Referenced, never copied into our storage. */
  avatarUrl: string | null;
}

export interface LobbyPlayer {
  socketId: string;
  /**
   * Null for a guest seat — see {@link LobbyPlayer.guest}. A guest has no site
   * account, so there is no id to give them and nothing to attribute a score to.
   */
  userId: string | null;
  /** Present exactly when `userId` is null. */
  guest?: GuestIdentity;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  isHost: boolean;
  /** True while their seat is held open by the disconnect grace window. */
  disconnected: boolean;
  /**
   * Joined after the match started, so they are watching this round and playing
   * the next one. Without this a late joiner either got bounced ("in progress,
   * try later") or was seated into a song already 90 seconds in.
   */
  spectating: boolean;
  modifiers: Modifiers;
  /** What their modifier set is worth, so the lobby can show it without maths. */
  scoreMultiplier: number;
}

/**
 * The song, as the lobby publishes it.
 *
 * A narrow projection rather than the `Song` row: the room needs a title, a
 * cover and a length. It does not need the uploader's id, and it certainly does
 * not need a storage key.
 */
export interface LobbySong {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  duration: number;
  bpm: number;
}

export interface LobbySnapshot {
  code: string;
  hostSocketId: string;
  isPublic: boolean;
  state: LobbyState;
  players: LobbyPlayer[];
  maxPlayers: number;
  song: LobbySong | null;
}

export interface PublicLobbyInfo {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  songTitle: string | null;
}

export interface LoadingStatus {
  players: { socketId: string; name: string; loaded: boolean }[];
  /** Epoch-ms after which the match starts without the stragglers. */
  deadline: number;
}

export interface CountdownPayload {
  seconds: number;
  /** Server epoch-ms the match begins — the client renders against this. */
  startsAt: number;
}

export interface MatchStartPayload {
  song: LobbySong;
  /** Server epoch-ms the match began. Display only, never used for scoring. */
  startedAt: number;
  roster: { socketId: string; userId: string | null; name: string; avatarUrl: string | null }[];
}

/** A player's own claim about their run, published on a timer. */
export interface ScoreReport {
  score: number;
  combo: number;
  maxCombo: number;
  /** 0–1. */
  accuracy: number;
  /** 0–100. Reserved for Sudden Death; always 100 in the standard mode. */
  health: number;
}

export interface LiveScore extends ScoreReport {
  socketId: string;
  /** True once this player's own clock reached the end of the song. */
  done: boolean;
}

export interface FinalStanding {
  socketId: string;
  /**
   * Null for a guest. Their placing, score and accuracy are real and are shown;
   * the row simply has nowhere to be written down, and `persistResults` skips
   * it for exactly that reason.
   */
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  score: number;
  maxCombo: number;
  accuracy: number;
  modifiers: Modifiers;
  scoreMultiplier: number;
  /** 1-based. Ties share a place. */
  place: number;
  /** False when they never reported a finish — a drop or a load timeout. */
  finished: boolean;
}

export interface MatchResults {
  standings: FinalStanding[];
  song: LobbySong | null;
}

/**
 * A live match is on hold because someone dropped.
 *
 * The server owns the clock — `kickAt` is a server timestamp the client counts
 * down to, never a duration the client starts its own timer from, because two
 * clients with a 3-second clock skew would otherwise disagree about when the
 * room gave up. `pausesLeft` is shown so the room can see that a repeatedly
 * flapping player is about to stop being waited for.
 */
export interface PausePayload {
  peers: { userId: string | null; userName: string }[];
  /** Server epoch-ms at which the room stops waiting and plays on. */
  kickAt: number;
  pausesLeft: number;
}

export interface ResumePayload {
  /** Server epoch-ms at which audio actually restarts. */
  resumeAt: number;
  countdownSeconds: number;
  /** Who is not coming back — empty when everyone reconnected in time. */
  droppedNames: string[];
}

export interface ChatMessage {
  id: string;
  socketId: string;
  name: string;
  text: string;
  /** Server epoch-ms. */
  at: number;
}

export type LobbyErrorCode =
  | 'not_found'
  | 'full'
  | 'in_progress'
  | 'not_host'
  | 'no_song'
  | 'too_few_players'
  | 'auth_required'
  | 'rate_limited'
  | 'lobby_limit'
  | 'song_unavailable'
  /**
   * `slice:create` was asked for a specific code and somebody already holds it.
   * Answered explicitly rather than by quietly minting a random one, because
   * the caller asked for that code for a reason (a Discord voice channel
   * derives it from its own id) and the useful next move is to *join* it.
   */
  | 'code_taken'
  /** The requested code is not a well-formed lobby code. Nothing was created. */
  | 'invalid_code';

export interface LobbyError {
  code: LobbyErrorCode;
  message: string;
}

/* ═══ The typed contract ═════════════════════════════════════════════════ */

/**
 * A live score report.
 *
 * Every field **clamps** rather than rejects, following the Laundry Sort rule:
 * a contract stricter than the server it replaces disconnects honest clients.
 * socket.io serialises through JSON and JSON has no `NaN`, so a client-side
 * arithmetic slip arrives as `null` — under a strict schema that is a
 * `protocol:error` and a disconnect *mid-match*, which is a far worse outcome
 * than a zero on the opponent sidebar.
 *
 * These numbers are claims, not records. Nothing here reaches a leaderboard;
 * the score endpoint re-derives its own bounds from the song's real duration.
 */
const clampedNumber = (max: number, min = 0) =>
  // `.optional()` matters: in zod v4 a bare `z.unknown()` inside `z.object()`
  // makes the key REQUIRED, so a client that omits one field — an older bundle,
  // a field added since — fails the whole parse, which `bindEvents` answers
  // with `protocol:error` and a disconnect. Mid-song. Clamping a missing field
  // to its floor is the behaviour this schema is supposed to have.
  z
    .unknown()
    .optional()
    .transform((raw) => {
      const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : min;
      return Math.max(min, Math.min(n, max));
    });

export const ScoreReportZ = z.object({
  score: clampedNumber(Number.MAX_SAFE_INTEGER).transform((n) => Math.floor(n)),
  combo: clampedNumber(1_000_000).transform((n) => Math.floor(n)),
  maxCombo: clampedNumber(1_000_000).transform((n) => Math.floor(n)),
  accuracy: clampedNumber(1),
  health: clampedNumber(100),
});

const CodeZ = z.unknown().transform((raw) =>
  typeof raw === 'string'
    ? raw
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, LOBBY_CODE_LENGTH)
    : '',
);

/**
 * For the events whose payload the server ignores entirely.
 *
 * `z.unknown()` rather than `z.object({})`: there is nothing to protect, and a
 * schema that can fail on an ignored payload is a disconnect waiting to happen
 * the first time a client emits with no argument at all.
 */
const IgnoredZ = z.unknown();

const LobbySettingsShape = z.object({ isPublic: z.boolean().optional().catch(undefined) });

const LobbySettingsPatchZ = LobbySettingsShape.catch({});

/**
 * `slice:create`, with an optional *preferred* code (`X9`).
 *
 * A Discord Activity derives one deterministic code from its voice channel id
 * so a whole call converges on one lobby with nothing typed; without a way to
 * ask for it, only whoever created the room first ever landed there. The
 * preference is a request, not a claim: the server still owns the code space
 * and answers `code_taken` when the code is already held (see
 * {@link LobbyErrorCode}).
 *
 * `.catch({})` for the same reason the settings patch has it — `slice:create`
 * is routinely emitted with `{}` or with nothing at all, and a schema that can
 * fail on a payload the server barely reads is a disconnect waiting to happen.
 */
const LobbyCreateZ = LobbySettingsShape.extend({ code: CodeZ.optional() }).catch({});

const LobbySongZ = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  coverUrl: z.string().nullable(),
  duration: z.number(),
  bpm: z.number(),
});

const GuestIdentityZ = z.object({ name: z.string(), avatarUrl: z.string().nullable() });

const LobbyPlayerZ = z.object({
  socketId: z.string(),
  // Nullable, not removed: a guest seat is a real seat with no account behind
  // it. Every other field keeps the strictness it had — this relaxation is
  // exactly one field wide.
  userId: z.string().nullable(),
  guest: GuestIdentityZ.optional(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  ready: z.boolean(),
  isHost: z.boolean(),
  disconnected: z.boolean(),
  spectating: z.boolean(),
  modifiers: ModifiersZ,
  scoreMultiplier: z.number(),
});

const LobbySnapshotZ = z.object({
  code: z.string(),
  hostSocketId: z.string(),
  isPublic: z.boolean(),
  state: z.enum(['waiting', 'loading', 'countdown', 'playing', 'results']),
  players: z.array(LobbyPlayerZ),
  maxPlayers: z.number().int(),
  song: LobbySongZ.nullable(),
});

const PublicLobbyInfoZ = z.object({
  code: z.string(),
  hostName: z.string(),
  playerCount: z.number().int(),
  maxPlayers: z.number().int(),
  songTitle: z.string().nullable(),
});

const LoadingStatusZ = z.object({
  players: z.array(z.object({ socketId: z.string(), name: z.string(), loaded: z.boolean() })),
  deadline: z.number(),
});

const CountdownZ = z.object({ seconds: z.number(), startsAt: z.number() });

const MatchStartZ = z.object({
  song: LobbySongZ,
  startedAt: z.number(),
  roster: z.array(
    z.object({
      socketId: z.string(),
      userId: z.string().nullable(),
      name: z.string(),
      avatarUrl: z.string().nullable(),
    }),
  ),
});

const LiveScoreZ = ScoreReportZ.extend({ socketId: z.string(), done: z.boolean() });

const FinalStandingZ = z.object({
  socketId: z.string(),
  userId: z.string().nullable(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  score: z.number(),
  maxCombo: z.number(),
  accuracy: z.number(),
  modifiers: ModifiersZ,
  scoreMultiplier: z.number(),
  place: z.number().int(),
  finished: z.boolean(),
});

const MatchResultsZ = z.object({
  standings: z.array(FinalStandingZ),
  song: LobbySongZ.nullable(),
});

const ChatMessageZ = z.object({
  id: z.string(),
  socketId: z.string(),
  name: z.string(),
  text: z.string(),
  at: z.number(),
});

const LobbyErrorZ = z.object({
  code: z.enum([
    'not_found',
    'full',
    'in_progress',
    'not_host',
    'no_song',
    'too_few_players',
    'auth_required',
    'rate_limited',
    'lobby_limit',
    'song_unavailable',
    'code_taken',
    'invalid_code',
  ]),
  message: z.string(),
});

const PauseZ = z.object({
  peers: z.array(z.object({ userId: z.string().nullable(), userName: z.string() })),
  kickAt: z.number(),
  pausesLeft: z.number().int(),
});

const ResumeZ = z.object({
  resumeAt: z.number(),
  countdownSeconds: z.number(),
  droppedNames: z.array(z.string()),
});

/**
 * Every Slice It event, with the payload each direction carries.
 *
 * The keys are the same strings as `C2S`/`S2C` above, written out literally: a
 * computed key (`[C2S.JOIN]:`) erases the literal type the whole contract is
 * built on. `lib/slice-it/__tests__/net-contract.test.ts` asserts the two stay
 * in step, which is the cheaper way to buy that guarantee.
 *
 * `s2c` schemas are declarative only — the server is trusted, so nothing
 * re-parses them at runtime. They exist to type the client's `on()`.
 */
export const EVENTS = defineEvents({
  // ─── Client → server ──────────────────────────────────────────────────
  'slice:create': { c2s: LobbyCreateZ },
  'slice:join': { c2s: z.object({ code: CodeZ }) },
  'slice:quickplay': { c2s: IgnoredZ },
  'slice:browse': { c2s: IgnoredZ },
  'slice:spectate': { c2s: z.object({ code: CodeZ }) },
  'slice:leave': { c2s: IgnoredZ },
  'slice:ready': { c2s: z.object({ ready: z.boolean().optional() }).catch({}) },
  'slice:song': { c2s: z.object({ songId: z.string().max(64) }) },
  'slice:settings': { c2s: LobbySettingsPatchZ },
  'slice:mods': { c2s: z.object({ modifiers: ModifiersZ }) },
  'slice:loaded': { c2s: IgnoredZ },
  'slice:score': { c2s: ScoreReportZ },
  'slice:finish': { c2s: ScoreReportZ },
  'slice:rematch': { c2s: IgnoredZ },
  'slice:chat': {
    c2s: z.object({ text: z.string().max(CHAT_MAX_LENGTH * 4) }),
    s2c: ChatMessageZ,
  },
  'slice:kick': { c2s: z.object({ socketId: z.string().max(64) }) },

  /**
   * Bidirectional. The host pressing Start and the server announcing the match
   * share one name — declared as one event carrying both directions so
   * `bindEvents` listens for the command and the client's `on()` is typed to
   * {@link MatchStartPayload}.
   */
  'slice:start': { c2s: IgnoredZ, s2c: MatchStartZ },

  // ─── Server → client ──────────────────────────────────────────────────
  'slice:lobby': { s2c: LobbySnapshotZ },
  'slice:joined': { s2c: z.object({ code: z.string(), socketId: z.string() }) },
  'slice:error': { s2c: LobbyErrorZ },
  'slice:browseResult': { s2c: z.array(PublicLobbyInfoZ) },
  'slice:loading': { s2c: LoadingStatusZ },
  'slice:countdown': { s2c: CountdownZ },
  'slice:scores': { s2c: z.array(LiveScoreZ) },
  'slice:results': { s2c: MatchResultsZ },
  'slice:kicked': { s2c: z.object({ reason: z.string() }) },
  'slice:pause': { s2c: PauseZ },
  'slice:resume': { s2c: ResumeZ },
});

/** Typed `emit` for the browser client. */
export type SliceC2S = ClientToServer<typeof EVENTS>;
/** Typed `on` for the browser client. */
export type SliceS2C = ServerToClient<typeof EVENTS>;

/** Every player in a lobby shares a socket.io room named for its code. */
export function lobbyRoom(code: string): string {
  return `${ROOM_PREFIX}${code}`;
}

/**
 * Spectators of a lobby share a second room (`N1`).
 *
 * A separate room rather than a flag on the seat: the score broadcast already
 * targets a room, so fanning out to watchers is one extra `emit` per tick
 * instead of a filter over the roster on every tick. It also keeps a spectator
 * out of `MAX_LOBBY_PLAYERS`, out of the ready check, and out of the set of
 * people a match waits for — which is the whole point of the role.
 */
export function specRoom(code: string): string {
  return `${ROOM_PREFIX}${code}:spec`;
}

export { MAX_LOBBY_PLAYERS };
