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

export interface PlayerStateSnapshot {
  playerId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facingX: number;
  facingY: number;
  isDowned: boolean;
  downTimer: number;
  revivalProgress: number;
  isDead: boolean;
  isSpectating: boolean;
  invulnTimer: number;
  classId: string;
  slot: number;
  level: number;
  kills: number;
  coins: number;
}

export interface EnemyStateSnapshot {
  id: number;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  isBoss: boolean;
}

export interface ProjectileSnapshot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isEnemy: boolean;
  color: string;
}

export interface PickupSnapshot {
  id: number;
  type: string;
  x: number;
  y: number;
  value: number;
}

export interface GameStateSnapshot {
  tick: number;
  time: number;
  timestamp: number;
  players: PlayerStateSnapshot[];
  enemies: EnemyStateSnapshot[];
  projectiles: ProjectileSnapshot[];
  pickups: PickupSnapshot[];
  bossActive: boolean;
  bossWarning: { bossId: string; timer: number } | null;
  sharedKills: number;
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
  | 'tpk';

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
  | 'DROP_IN_CLOSED';

export interface AltairError {
  code: AltairErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
