// =============================================================================
// ALTAIR MULTIPLAYER -- Shared Types
// =============================================================================
// Types shared between client and server.
// =============================================================================

// ---- Lobby Types ------------------------------------------------------------

export type AltairLobbyState =
  | 'WAITING'
  | 'CLASS_SELECT'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'RESULTS'
  | 'DISBANDED';

export interface AltairLobbySettings {
  maxPlayers: 2 | 3 | 4;
  visibility: 'public' | 'friends_only' | 'private';
  doubleTime: boolean;
  dropInAllowed: boolean;
  dropInWindow: 'first_5min' | 'first_10min' | 'anytime';
}

export const DEFAULT_LOBBY_SETTINGS: AltairLobbySettings = {
  maxPlayers: 4,
  visibility: 'private',
  doubleTime: false,
  dropInAllowed: true,
  dropInWindow: 'first_10min',
};

// ---- Client State (received from server) ------------------------------------

export interface AltairClientPlayer {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
  isHost: boolean;
  slot: number;
  classId: string | null; // null = not selected yet
  isReady: boolean;
  color: string;
}

export interface AltairClientLobbyState {
  lobbyId: string;
  hostUserId: string;
  state: AltairLobbyState;
  settings: AltairLobbySettings;
  players: AltairClientPlayer[];
  chat: ChatMessage[];
  myUserId: string;
  seq: number;
  /** The run's random seed, chosen by the hub; sent to the host only, while PLAYING. */
  runSeed?: number | null;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  isSystem: boolean;
  timestamp: number;
}

export interface PublicLobbyInfo {
  lobbyId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  doubleTime: boolean;
  dropInAllowed: boolean;
  state: AltairLobbyState;
}

// ---- Game State Types -------------------------------------------------------

export interface PlayerInputPacket {
  seq: number;
  tick: number;
  dx: number; // -1 to 1
  dy: number; // -1 to 1
  timestamp: number;
}

/**
 * Wire format of a host snapshot (sent at 20 Hz through the hub, which only
 * reads `sharedKills`). Cheap by construction: positions are integers in
 * tenths of a pixel (`POS_Q`), and the entity lists are FLAT number arrays with
 * a fixed stride instead of arrays of objects (no per-entity object, key or
 * string on the wire). `features/altair/engine/multiplayer/snapshot.ts` encodes, decodes and
 * interpolates them.
 */
export const POS_Q = 10;
export const ENEMY_STRIDE = 6; // id, defIndex, x, y, hpPermille, flags
export const PROJECTILE_STRIDE = 6; // id, x, y, vx, vy, meta
export const PICKUP_STRIDE = 5; // id, typeIndex, x, y, value

/** Enemy flag bits. */
export const ENEMY_FLAG_BOSS = 1;
export const ENEMY_FLAG_DEAD = 2;

/** Player lifecycle in a snapshot. */
export const PLAYER_ALIVE = 0;
export const PLAYER_DOWNED = 1;
export const PLAYER_DEAD = 2;

export interface PlayerStateSnapshot {
  playerId: string;
  x: number; // tenths of a pixel
  y: number;
  hp: number; // whole HP
  maxHp: number;
  fx: number; // facing, -100..100
  fy: number;
  state: 0 | 1 | 2; // PLAYER_ALIVE | PLAYER_DOWNED | PLAYER_DEAD
  downTimer: number; // whole seconds left while downed
  revive: number; // 0..100 revive progress
  invuln: boolean;
  classId: string;
  slot: number;
  level: number;
  kills: number;
  coins: number;
  /** True while this player's level-up overlay is open (they are invulnerable). */
  levelUpPending: boolean;
}

export interface GameStateSnapshot {
  tick: number;
  /** Game clock in seconds (world.time). */
  time: number;
  sharedKills: number;
  bossActive: boolean;
  bossWarning: { bossId: string; timer: number } | null;
  players: PlayerStateSnapshot[];
  /** Flat, stride ENEMY_STRIDE. */
  enemies: number[];
  /** Flat, stride PROJECTILE_STRIDE; meta = isEnemy + 2*radius + 512*rgb. */
  projectiles: number[];
  /** Flat, stride PICKUP_STRIDE. */
  pickups: number[];
}

// ---- Game Events (from server) ----------------------------------------------

export type GameEventType =
  | 'player_downed'
  | 'player_revived'
  | 'player_dead'
  | 'player_level_up'
  | 'boss_spawn'
  | 'boss_kill'
  | 'kill_milestone'
  | 'victory'
  | 'tpk'
  | 'host_disconnected'
  | 'host_reconnected';

export interface GameEvent {
  type: GameEventType;
  playerId?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

// ---- Ping System ------------------------------------------------------------

export type PingType = 'general' | 'target' | 'boss' | 'help' | 'item' | 'danger';

export interface PingData {
  playerId: string;
  type: PingType;
  x: number;
  y: number;
  targetId?: number; // enemy or pickup id
  timestamp: number;
}

// ---- Quick Chat -------------------------------------------------------------

export const QUICK_CHAT_MESSAGES = [
  'Nice!',
  'Help!',
  'Spread out!',
  'Group up!',
  'Focus boss!',
  "I'll revive you!",
  'Watch out!',
  'GG!',
] as const;

export type QuickChatMessage = (typeof QUICK_CHAT_MESSAGES)[number];

export interface QuickChatData {
  playerId: string;
  message: QuickChatMessage;
  timestamp: number;
}

// ---- Results ----------------------------------------------------------------

export interface PlayerResultData {
  userId: string;
  userName: string;
  classId: string;
  slot: number;
  level: number;
  kills: number;
  coinsEarned: number;
  timeSurvived: number;
  revivesGiven: number;
  revivesReceived: number;
  wasDowned: boolean;
  wasAliveAtEnd: boolean;
  coinBreakdown: {
    enemyDrops: number;
    bossKills: number;
    chestDrops: number;
    survivalBonus: number;
    killMilestones: number;
    completionBonus: number;
    firstClearBonus: number;
  };
}

export interface GameResultsData {
  lobbyId: string;
  victory: boolean;
  sharedKills: number;
  timeSurvived: number;
  bossesDefeated: string[];
  doubleTime: boolean;
  /** Set when the run ended for a reason other than winning or losing. */
  endedReason?: 'host_left';
  players: PlayerResultData[];
}

// ---- Error Codes ------------------------------------------------------------

export type AltairErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'SESSION_EXPIRED'
  | 'DUPLICATE_SESSION'
  | 'LOBBY_NOT_FOUND'
  | 'LOBBY_FULL'
  | 'LOBBY_IN_GAME'
  | 'NOT_HOST'
  | 'NOT_IN_LOBBY'
  | 'ALREADY_IN_LOBBY'
  | 'INVALID_PAYLOAD'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED'
  | 'DROP_IN_CLOSED'
  | 'NOT_READY'
  | 'NEED_MORE_PLAYERS'
  | 'WRONG_STATE';

export interface AltairError {
  code: AltairErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
