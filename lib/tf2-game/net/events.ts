/**
 * RMH TF2 — the hub's event names, payload shapes and wire limits.
 *
 * Imported by BOTH sides: the browser client (`./client.ts`) and the room
 * manager on the games hub (`server/socket-server/handlers/tf2-game.ts`). Never
 * inline one of these strings — server/CLAUDE.md §Client connection
 * conventions. Every client-to-server name needs a rule in
 * `SOCKET_RATE_LIMITS` (server/socket-server/config.ts), which
 * lib/__tests__/socket-rate-limit-coverage.test.ts enforces.
 *
 * Two planes:
 *   - **Binary hot path.** `tf2:input` (client → hub → match worker) and
 *     `tf2:snapshot` / `tf2:events` (match worker → hub → clients). The hub
 *     treats all three as opaque bytes; their formats belong to the simulation
 *     (`lib/tf2-game/net/` snapshot/input codecs).
 *   - **JSON control plane.** Rooms, team/class choice, chat, voice commands,
 *     clock sync — validated by `./lobby-schema.ts`.
 *
 * Environment-agnostic and free of `@/` specifiers (the hub bundle imports it
 * relatively; server/CLAUDE.md gotcha 7).
 */

import type { Tf2Mode } from '../data/maps';

// ─── Event names ───────────────────────────────────────────────────────────

/** Client → server. */
export const TF2_C2S = {
  LIST_ROOMS: 'tf2:rooms:list',
  CREATE_ROOM: 'tf2:room:create',
  JOIN_ROOM: 'tf2:room:join',
  LEAVE: 'tf2:room:leave',
  /** Binary: packed user commands for the player's match. */
  INPUT: 'tf2:input',
  CHAT: 'tf2:chat:send',
  TEAM: 'tf2:team',
  CLASS: 'tf2:class',
  VOICE: 'tf2:voice',
  /** Clock sync — answered by `TF2_S2C.PONG`. */
  PING: 'tf2:ping',
} as const;

/** Server → client. */
export const TF2_S2C = {
  ROOMS: 'tf2:rooms',
  JOINED: 'tf2:joined',
  /** Binary, unreliable (volatile): the simulation's snapshot stream. */
  SNAPSHOT: 'tf2:snapshot',
  /** Binary, reliable: a batch of the simulation's reliable events. */
  EVENTS: 'tf2:events',
  CHAT: 'tf2:chat',
  /** You are out of the room (room closed, map failed to load, worker crashed). */
  KICKED: 'tf2:kicked',
  ERROR: 'tf2:error',
  PONG: 'tf2:pong',
} as const;

export type Tf2C2SEvent = (typeof TF2_C2S)[keyof typeof TF2_C2S];
export type Tf2S2CEvent = (typeof TF2_S2C)[keyof typeof TF2_S2C];

// ─── Limits ────────────────────────────────────────────────────────────────

export const TF2_LIMITS = {
  /** TF2's player cap (maxplayers 24 on official servers). Bots count. */
  MAX_PLAYERS: 24,
  MIN_PLAYERS: 2,
  MAX_BOTS: 23,
  /**
   * One input packet: a few redundant user commands (a dropped packet's
   * commands ride in the next one). A packed command is tens of bytes.
   */
  INPUT_MAX_BYTES: 512,
  /** TF2's `say` buffer is 127 characters. */
  CHAT_MAX_LENGTH: 127,
  ROOM_NAME_MAX_LENGTH: 40,
  /** Room codes come from server/socket-server/utils.ts generateRoomCode(). */
  ROOM_CODE_LENGTH: 6,
  /** Rooms shown in the server browser. */
  BROWSE_CAP: 50,
} as const;

/** `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` × 6 — the hub's room-code alphabet. */
export const TF2_ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

// ─── Control-plane payloads ────────────────────────────────────────────────

export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'expert';
export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard', 'expert'];

/** `jointeam` arguments. */
export type TeamChoice = 'red' | 'blue' | 'spectator' | 'auto';
export const TEAM_CHOICES: readonly TeamChoice[] = ['red', 'blue', 'spectator', 'auto'];

/** `joinclass` arguments: the lower-case class names of `CLASS_NAMES`, or random. */
export type ClassChoice =
  | 'scout'
  | 'sniper'
  | 'soldier'
  | 'demoman'
  | 'medic'
  | 'heavy'
  | 'pyro'
  | 'spy'
  | 'engineer'
  | 'random';
export const CLASS_CHOICES: readonly ClassChoice[] = [
  'scout',
  'sniper',
  'soldier',
  'demoman',
  'medic',
  'heavy',
  'pyro',
  'spy',
  'engineer',
  'random',
];

export interface CreateRoomPayload {
  map: string;
  /** Defaults to the map's own mode; anything else is refused for now. */
  mode?: Tf2Mode;
  maxPlayers: number;
  botCount: number;
  botDifficulty: BotDifficulty;
  /** Room (server) name shown in the browser. */
  name: string;
  /** Hidden from the browser; join by code only. */
  private?: boolean;
  /** Display name for a signed-out player; signed-in players use their account name. */
  playerName?: string;
}

export interface JoinRoomPayload {
  code: string;
  playerName?: string;
}

export interface ChatPayload {
  text: string;
  /** `say_team`. */
  teamOnly?: boolean;
}

export interface TeamPayload {
  team: TeamChoice;
}

export interface ClassPayload {
  cls: ClassChoice;
}

/** `voicemenu <menu> <item>` — three menus of eight lines each. */
export interface VoicePayload {
  menu: 0 | 1 | 2;
  item: number;
}

export interface PingPayload {
  /** Client clock (performance.now() ms), echoed back. */
  t: number;
}

// ─── Server → client payloads ──────────────────────────────────────────────

export type RoomState = 'loading' | 'running';

export interface RoomListEntry {
  code: string;
  name: string;
  map: string;
  mode: Tf2Mode;
  /** Connected humans. */
  players: number;
  bots: number;
  maxPlayers: number;
  state: RoomState;
}

export interface JoinedPayload {
  code: string;
  /** This client's player id inside the match (the entity index the sim gave it). */
  playerId: number;
  map: string;
  mode: Tf2Mode;
  name: string;
  maxPlayers: number;
  /** The match's tick when this was sent; pair with `PONG` to sync the clock. */
  serverTick: number;
  /** Seconds per tick (TICK_INTERVAL, 0.015). */
  tickInterval: number;
}

export interface ChatMessage {
  from: number;
  name: string;
  text: string;
  teamOnly: boolean;
  /** Sender's team number (TEAM_* in core/constants.ts) as the hub last knew it. */
  team: number;
  /** Server epoch ms. */
  at: number;
}

export type KickReason = 'room-closed' | 'map-failed' | 'server-error' | 'server-restart';

export interface KickedPayload {
  code: string;
  reason: KickReason;
}

export type Tf2ErrorCode =
  | 'rate-limited'
  | 'bad-payload'
  | 'too-large'
  | 'unknown-map'
  | 'bad-mode'
  | 'no-such-room'
  | 'room-full'
  | 'not-in-room'
  | 'capacity'
  | 'unavailable';

export interface ErrorPayload {
  code: Tf2ErrorCode;
  /** The event that was refused. */
  event?: string;
}

export interface PongPayload {
  /** The client's `t`, echoed. */
  t: number;
  /** Server epoch ms when the pong left. */
  serverTime: number;
  /** The match's current tick, estimated from its last frame; null outside a match. */
  tick: number | null;
}
