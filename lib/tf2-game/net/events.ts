/**
 * RMH TF2 — the hub's event names, payload shapes and wire limits.
 *
 * Imported by BOTH sides: the browser client (`./client.ts`) and the games hub
 * (`server/socket-server/handlers/tf2-game.ts` and `tf2-p2p.ts`). Never
 * inline one of these strings — server/CLAUDE.md §Client connection
 * conventions. Every client-to-server name needs a rule in
 * `SOCKET_RATE_LIMITS` (server/socket-server/config.ts), which
 * lib/__tests__/socket-rate-limit-coverage.test.ts enforces.
 *
 * The hub carries no game traffic of its own — every match runs in a browser
 * (offline, or a peer-to-peer host's listen server). It lists the P2P rooms,
 * keeps their hosts' doors, answers the browser's pings, and signals (plus
 * the relay fallback) for P2P play. JSON payloads are validated by
 * `./lobby-schema.ts` and `./p2p/signal.ts`.
 *
 * Environment-agnostic and free of `@/` specifiers (the hub bundle imports it
 * relatively; server/CLAUDE.md gotcha 7).
 */

import { TF2_MODES, type Tf2Mode } from '../data/maps';

/** The games a room can play on the shared engine (CS:GO: de_dust2, peer-to-peer like TF2). */
export type RoomGame = 'tf2' | 'csgo';
export const ROOM_GAMES: readonly RoomGame[] = ['tf2', 'csgo'];
/** CS:GO's modes: bomb defusal ('de') and deathmatch ('dm'). */
export type CsRoomMode = 'de' | 'dm';
export const CS_ROOM_MODES: readonly CsRoomMode[] = ['de', 'dm'];
/** A room's mode: a TF2 game mode, or a CS:GO one. */
export type RoomMode = Tf2Mode | CsRoomMode;
export const ROOM_MODES: readonly RoomMode[] = [...TF2_MODES, ...CS_ROOM_MODES];

// ─── Event names ───────────────────────────────────────────────────────────

/** Client → server. */
export const TF2_C2S = {
  LIST_ROOMS: 'tf2:rooms:list',
  /** The hub's round trip (the browser's ping column) — answered by `TF2_S2C.PONG`. */
  PING: 'tf2:ping',
  /** One room's details for the server browser (players, round) — answered by `TF2_S2C.ROOM_DETAILS`. */
  ROOM_DETAILS: 'tf2:room:details',
  /** A peer-to-peer host's door (`RoomAdminPayload`: lock, password), checked on the hub and logged. */
  ROOM_ADMIN: 'tf2:room:admin',

  // ── Peer-to-peer play (docs/tf2-game.md "Peer-to-peer play") ──────────────
  // The hub only SIGNALS for these rooms (and relays opaque packets for peers
  // that cannot connect directly); the match runs in the host's browser.
  /** Announce a hosted room (or resume one after a blip) — answered by `P2P_HOSTED`. */
  P2P_HOST: 'tf2:p2p:host',
  /** The host's digest of its match for the server browser. */
  P2P_UPDATE: 'tf2:p2p:update',
  /** The host closes its room: every member is told the match ended. */
  P2P_CLOSE: 'tf2:p2p:close',
  /** Ask to join a hosted room by code; the hub vouches for the account to the host. */
  P2P_JOIN: 'tf2:p2p:join',
  /** Leave the hosted room you joined. */
  P2P_LEAVE: 'tf2:p2p:leave',
  /** The host answers a join request (accept, or refuse with a reason). */
  P2P_ADMIT: 'tf2:p2p:admit',
  /** The host removes a member (and refuses them for the rest of the room's life). */
  P2P_KICK: 'tf2:p2p:kick',
  /** WebRTC offer / answer / ICE candidate, relayed only between the host and one member. */
  P2P_SIGNAL: 'tf2:p2p:signal',
  /** Ask the hub to relay a member's packets (the direct connection could not be made). */
  P2P_RELAY_START: 'tf2:p2p:relay:start',
  /** Binary: one relayed game packet (see `p2p/relay.ts` for the two-byte header). */
  P2P_RELAY: 'tf2:p2p:relay',
  /** The host names the member that takes the match over if it leaves (host migration). */
  P2P_SUCCESSOR: 'tf2:p2p:successor',
} as const;

/** Server → client. */
export const TF2_S2C = {
  ROOMS: 'tf2:rooms',
  ERROR: 'tf2:error',
  PONG: 'tf2:pong',
  ROOM_DETAILS: 'tf2:room:details',

  // ── Peer-to-peer play ─────────────────────────────────────────────────────
  /** Your room is announced: its code, the resume token and the relay caps. */
  P2P_HOSTED: 'tf2:p2p:hosted',
  /** To the host: an account (verified by the hub) asks to join. */
  P2P_JOIN_REQUEST: 'tf2:p2p:join-request',
  /** To a joiner: the host accepted; its offer follows on `P2P_SIGNAL`. */
  P2P_ADMITTED: 'tf2:p2p:admitted',
  P2P_SIGNAL: 'tf2:p2p:signal',
  /** To the host: a member's hub connection went away (it may still be connected directly). */
  P2P_PEER_LEFT: 'tf2:p2p:peer-left',
  /** To the host and the member: the hub relays this member's packets from now on. */
  P2P_RELAY_READY: 'tf2:p2p:relay:ready',
  P2P_RELAY: 'tf2:p2p:relay',
  /** To a member: the room is gone (host left or closed it, you were kicked or refused). */
  P2P_CLOSED: 'tf2:p2p:closed',
  /** To the successor: the host left, the match is yours now (start it from your checkpoint). */
  P2P_PROMOTED: 'tf2:p2p:promoted',
  /** To every other member: the match moves to a new host; you are being re-admitted. */
  P2P_MIGRATING: 'tf2:p2p:migrating',
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
  /** Rooms in one page of the server browser (`offset` pages beyond it). */
  BROWSE_CAP: 100,
  /** Players in a peer-to-peer room, bots included: the host uploads a snapshot stream per human. */
  P2P_MAX_PLAYERS: 12,
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

/**
 * The administration a room's host runs (the HUD's admin view). Kicks, the map and messages are
 * the host's own match; `lock` and `password` are also sent to the hub (`tf2:room:admin`), which
 * keeps the door.
 */
export type RoomAdminPayload =
  | { action: 'kick'; playerId: number }
  | { action: 'transfer'; playerId: number }
  | { action: 'changelevel'; map: string }
  | { action: 'lock'; locked: boolean }
  /** '' clears it. */
  | { action: 'password'; password: string }
  /** A line in everyone's chat from the server (rcon's `say`). */
  | { action: 'say'; text: string };

/** `tf2:rooms:list` — a page of the server browser. */
export interface ListRoomsPayload {
  offset?: number;
  /** The game whose rooms to list (default TF2). */
  game?: RoomGame;
}

export interface RoomDetailsRequest {
  code: string;
}

export interface PingPayload {
  /** Client clock (performance.now() ms), echoed back. */
  t: number;
}

// ─── Server → client payloads ──────────────────────────────────────────────

export type RoomState = 'loading' | 'running';

/** Where a match runs: always a player's browser (a listen server), reached peer to peer. */
export type RoomKind = 'p2p';

/** The round as the server browser shows it. */
export interface RoundInfo {
  /** The rules' state name (`preround`, `running`, `team_win`, …). */
  state: string;
  /** Seconds left on the round timer the HUD shows; null when there is none. */
  timeLeft: number | null;
}

export interface RoomListEntry {
  code: string;
  name: string;
  /** Absent: TF2. */
  game?: RoomGame;
  map: string;
  mode: RoomMode;
  /** Connected humans. */
  players: number;
  bots: number;
  maxPlayers: number;
  state: RoomState;
  kind: RoomKind;
  /** P2P: the hosting account's name ("Hosted by <name> (P2P)"). Never an address. */
  host?: string;
  /** No new players (the owner locked it). */
  locked?: boolean;
  /** Joining needs the room's password. */
  passworded?: boolean;
  /** [RED, BLU] from the match's latest digest. */
  teamScores?: [number, number];
  round?: RoundInfo | null;
}

/** `tf2:rooms` — one page of the browser. */
export interface RoomsPayload {
  rooms: RoomListEntry[];
  /** Public rooms in all. */
  total: number;
  offset: number;
}

export interface RoomPlayerInfo {
  name: string;
  /** TEAM_* (core/constants.ts). */
  team: number;
  /** TF_CLASS_* (core/constants.ts). */
  cls: number;
  score: number;
  bot: boolean;
}

/** `tf2:room:details` — the browser's details pane. `room` is null when the code is unknown. */
export interface RoomDetailsPayload {
  code: string;
  room: (RoomListEntry & { roster: RoomPlayerInfo[] }) | null;
}

export interface JoinedPayload {
  code: string;
  /** This client's player id inside the match (the entity index the sim gave it). */
  playerId: number;
  map: string;
  mode: RoomMode;
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
  | 'unavailable'
  /** Multiplayer needs a signed-in account (offline play does not). */
  | 'auth-required'
  /** The host removed this account from its room. */
  | 'kicked'
  /** Only the room's host may do that. */
  | 'not-host'
  /** The room already relays as many members as the hub allows. */
  | 'relay-full'
  /** Only the room's owner may do that. */
  | 'not-owner'
  /** The room takes no new players. */
  | 'locked'
  /** The room needs a password (or that was the wrong one). */
  | 'password';

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
}
