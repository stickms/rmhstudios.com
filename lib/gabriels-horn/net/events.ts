/**
 * Gabriel's Horn — multiplayer protocol.
 *
 * Imported by **both** the browser client and
 * `server/socket-server/handlers/gabriels-horn.ts`, so the two can never drift
 * on an event name or a payload shape. No browser and no Node imports: the
 * server bundle takes this file verbatim.
 *
 * ── The one rule that shapes the whole protocol ─────────────────────────────
 * The player whose turn it is **must not learn the dice**. That is the game, so
 * it cannot be a client-side courtesy — a hidden-but-transmitted die is a
 * DevTools console away from being visible, and one player reading it silently
 * ruins every round for everybody else without leaving a trace.
 *
 * So the dice never leave the server for the roller. {@link S2C.STATE} is
 * **personalised**: the handler builds one {@link GameView} per seat and emits
 * it to that socket alone. The roller's view carries `dice.faces = null` until
 * the reveal (or until they spend an Azure card to buy a look), and every other
 * seat's carries the real faces. Nothing is filtered in the client, because
 * nothing that matters is ever sent to it.
 *
 * The same logic governs hands: you get your own cards in full and everyone
 * else's as a count, plus whatever one Amber card bought you.
 */

import type { Card, CardColor, CardEffect, Phase } from '../constants';
import type { HouseRules, RuleChange } from '../house-rules';

export const ROOM_PREFIX = 'gh:';

/** Client → server. Every one of these has a rule in `socket-server/config.ts`. */
export const C2S = {
  CREATE: 'gh:create',
  JOIN: 'gh:join',
  QUICKPLAY: 'gh:quickplay',
  BROWSE: 'gh:browse',
  LEAVE: 'gh:leave',
  READY: 'gh:ready',
  SETTINGS: 'gh:settings',
  START: 'gh:start',
  KICK: 'gh:kick',
  /** Spend a card from your hand. */
  PLAY: 'gh:play',
  /** Commit to the roll you cannot see. */
  ROLL: 'gh:roll',
  /** Tell the roller a total — true or otherwise. */
  CLAIM: 'gh:claim',
  /** Pick a claim and call it. */
  CALL: 'gh:call',
  /** Sound the horn: everyone gets one last turn, then hands are counted. */
  SOUND_END: 'gh:end',
  /** Decline to act on your final turn. */
  PASS: 'gh:pass',
  CHAT: 'gh:chat',
  REMATCH: 'gh:rematch',
  /** Host only: replace the table's tunable rules. Clamped server-side. */
  HOUSE_RULES: 'gh:houseRules',
  /** Redeem a party ticket to be seated in the party's room. */
  TICKET: 'gh:ticket',
} as const;

/** Server → client. */
export const S2C = {
  LOBBY: 'gh:lobby',
  BROWSE_RESULT: 'gh:browseResult',
  JOINED: 'gh:joined',
  ERROR: 'gh:error',
  COUNTDOWN: 'gh:countdown',
  /** **Per-socket**, never broadcast — see the note at the top of this file. */
  STATE: 'gh:state',
  RESULTS: 'gh:results',
  CHAT: 'gh:chat',
  KICKED: 'gh:kicked',
  HOST_CHANGED: 'gh:hostChanged',
  /** The table's rules changed. Carries the whole set, plus what moved. */
  HOUSE_RULES: 'gh:houseRules',
} as const;

// ─── Lobby ──────────────────────────────────────────────────────────────────

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
}

export interface LobbySnapshot extends LobbySettings {
  /** The table's tunable rules — visible to everyone, changed by the host. */
  rules: HouseRules;
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
}

// ─── The table ──────────────────────────────────────────────────────────────

export interface TablePlayer {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Hand SIZE is public — it is the score, and hiding it would hide the race. */
  handCount: number;
  /** Verdant is up: nothing can make this player draw. */
  warded: boolean;
  /** Already took their one turn after the horn. */
  finalDone: boolean;
  /**
   * False while their socket is gone. The seat and its cards are held for a
   * grace window, but their turns are skipped rather than waited out — see
   * `RECONNECT_GRACE_MS`.
   */
  connected: boolean;
}

/**
 * The dice, as one seat sees them. `faces` is `null` when they are hidden from
 * you — which for the roller is most of the round, and is the point.
 */
export interface DiceView {
  faces: number[] | null;
  total: number | null;
  /** True when you are seeing them because you paid an Azure card for it. */
  glimpsed: boolean;
}

export interface ClaimView {
  socketId: string;
  /** `null` until that player has spoken. */
  total: number | null;
  /**
   * Whether the claim was a lie. Withheld (`null`) until the reveal — knowing
   * it earlier would be knowing the dice.
   */
  lie: boolean | null;
}

/** What happened when the roller called it. Present during `reveal` only. */
export interface CallOutcome {
  callerSocketId: string;
  targetSocketId: string;
  verdict: 'truth' | 'lie';
  /** Whether the caller read the table right. */
  correct: boolean;
  /** Who paid for it. `null` when a Verdant ward absorbed the draw. */
  drewSocketId: string | null;
  drawn: number;
  trueTotal: number;
}

export type LogKind =
  | 'deal'
  | 'roll'
  | 'claim'
  | 'call'
  | 'draw'
  | 'play'
  | 'swap'
  | 'ward'
  | 'scry'
  | 'glimpse'
  | 'end-called'
  | 'pass'
  | 'away'
  | 'returned'
  | 'skipped'
  | 'left'
  | 'house-rules'
  | 'over';

/**
 * One line of the table's record. Rendered through i18n on the client, so this
 * carries the pieces and not a sentence: `kind` picks the phrasing, the rest
 * are interpolated.
 */
export interface LogEntry {
  id: number;
  kind: LogKind;
  at: number;
  /** For `house-rules`: what actually moved. */
  changes?: RuleChange[];
  actorName?: string;
  targetName?: string;
  amount?: number;
  total?: number;
  color?: CardColor;
  effect?: CardEffect;
  verdict?: 'truth' | 'lie';
  correct?: boolean;
}

/** The whole table from one seat. Emitted to that seat and nobody else. */
export interface GameView {
  code: string;
  phase: Phase;
  /** Laps completed plus one; purely for display. */
  round: number;
  /** Whose turn it is. During `final`, whose last turn it is. */
  activeSocketId: string;
  /** Your seat — so the client never has to guess which player it is. */
  selfSocketId: string;
  players: TablePlayer[];
  /** Your own cards, in full. Everyone else's are counts on {@link TablePlayer}. */
  hand: Card[];
  dice: DiceView;
  claims: ClaimView[];
  deckCount: number;
  /** Epoch ms the current phase runs out, or `null` when it is untimed. */
  phaseEndsAt: number | null;
  /** Who sounded the horn, once somebody has. */
  endCalledBy: string | null;
  outcome: CallOutcome | null;
  /** A hand an Amber card bought you a look at. Cleared when the turn moves on. */
  scry: { socketId: string; name: string; cards: Card[] } | null;
  /** The rules in force. The table plays by these, not by the shipped defaults. */
  rules: HouseRules;
  log: LogEntry[];
}

// ─── End of game ────────────────────────────────────────────────────────────

export interface FinalStanding {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  handCount: number;
  /** 1-based. Ties share a place. */
  place: number;
  /** This player sounded the horn. */
  calledEnd: boolean;
  /**
   * They sounded it without being strictly lowest, so the horn cost them the
   * game — they are placed last regardless of their count.
   */
  endBackfired: boolean;
}

export interface GameResults {
  standings: FinalStanding[];
  endCalledBy: string | null;
  rounds: number;
  /** The table emptied out mid-game rather than reaching a called End. */
  abandoned: boolean;
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  socketId: string;
  name: string;
  avatarUrl: string | null;
  text: string;
  at: number;
}

// ─── Client → server payloads ───────────────────────────────────────────────

export interface PlayPayload {
  cardId: string;
  /** Required for Accuse, Scry and the seven's Swap; ignored otherwise. */
  targetSocketId?: string;
}

export interface ClaimPayload {
  total: number;
}

export interface CallPayload {
  targetSocketId: string;
  verdict: 'truth' | 'lie';
}
