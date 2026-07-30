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
 */

import type { Difficulty, MatchDuration } from '../constants';

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
