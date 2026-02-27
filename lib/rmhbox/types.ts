/**
 * RMHbox — Shared Type Definitions
 *
 * Types shared between the client and server.
 * Server-only types are in server/rmhbox/types.ts.
 *
 * Reference: docs/rmhbox/design-spec/core.md §20
 */

// ─── Lobby State Machine ─────────────────────────────────────────

export type LobbyState =
  | 'WAITING'
  | 'VOTING'
  | 'GAME_SETTINGS'
  | 'INSTRUCTIONS'
  | 'PRELOADING'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'ROUND_RESULTS'
  | 'SESSION_RESULTS'
  | 'DISBANDED';

// ─── Spectator Mode ──────────────────────────────────────────────

/**
 * Determines how spectators view game state:
 * - 'shared-privileged': Spectators receive the highest-level/omniscient view
 *   (e.g. spymaster view in Undercover Agent, producer view in Emoji Cinema).
 * - 'competitive-individual': All players compete on equal footing; spectators
 *   pick a player to follow and see that player's state.
 */
export type SpectatorMode = 'shared-privileged' | 'competitive-individual';

// ─── Lobby Settings ──────────────────────────────────────────────

export interface LobbySettings {
  isPublic: boolean;
  maxPlayers: number;
  maxSpectators: number;
  allowMidGameJoin: boolean;
  allowSpectatorPromotion: boolean;
  autoStartThreshold: number | null;
  gameDurationOverride: number | null;
}

// ─── Client-Side State ───────────────────────────────────────────

export interface ClientLobbyState {
  lobbyId: string;
  hostUserId: string;
  state: LobbyState;
  settings: LobbySettings;
  players: ClientPlayerInfo[];
  spectators: ClientSpectatorInfo[];
  currentGame: ClientGameInfo | null;
  /** Game the host has picked but not yet started. '__vote__' = vote mode. */
  selectedGame: { minigameId: string; displayName: string } | null;
  roundNumber: number;
  chat: ChatMessage[];
  myRole: 'player' | 'spectator';
  myUserId: string;
  seq: number;
  matchHistory: MatchSummary[];
}

export interface ClientPlayerInfo {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
  isReady: boolean;
  score: number;
  roundScore: number;
  isHost: boolean;
}

export interface ClientSpectatorInfo {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isConnected: boolean;
}

export interface ClientGameInfo {
  minigameId: string;
  displayName: string;
  phase: 'instructions' | 'preloading' | 'countdown' | 'playing' | 'results';
  timeRemaining: number | null;
  publicState: Record<string, unknown>;
  privateState: Record<string, unknown>;
  /** How spectators view this game's state. Null when no handler is active. */
  spectatorMode: SpectatorMode | null;
}

/** Info about the player a spectator is currently following (competitive games). */
export interface SpectatorTargetInfo {
  /** The userId of the player the spectator is viewing */
  targetPlayerId: string;
  /** Display name of the target player */
  targetPlayerName: string;
  /** All players available for spectating */
  availablePlayers: Array<{ userId: string; userName: string }>;
}

// ─── Public Lobby Info (for lobby browser) ───────────────────────

export interface PublicLobbyInfo {
  lobbyId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  spectatorCount: number;
  state: LobbyState;
  currentGame: string | null;
  /** Display name of the game the host has picked (null if none). '__vote__' = vote mode. */
  selectedGame: string | null;
  roundNumber: number;
}

// ─── Chat ────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: number;
  type: 'user' | 'system';
}

// ─── Game Actions ────────────────────────────────────────────────

export interface GameAction {
  type: string;
  payload: unknown;
  seq: number;
  timestamp: number;
}

// ─── Results ─────────────────────────────────────────────────────

export interface PlayerRanking {
  userId: string;
  userName: string;
  score: number;
  rank: number;
  deltas: Record<string, number>;
}

export interface Award {
  userId: string;
  title: string;
  description: string;
  icon: string;
}

export interface SessionStanding {
  userId: string;
  userName: string;
  totalScore: number;
  wins: number;
  rank: number;
}

export interface RoundResultsPayload {
  minigameId: string;
  rankings: PlayerRanking[];
  awards: Award[];
  roundNumber: number;
  sessionStandings: SessionStanding[];
}

export interface MatchSummary {
  matchId: string;
  minigameId: string;
  minigameDisplayName: string;
  playerCount: number;
  winnerUserName: string | null;
  rankings: Array<{ userId: string; userName: string; rank: number; score: number }>;
  durationMs: number;
  playedAt: number;
}

// ─── Game Settings (§12A) ────────────────────────────────────────

export type GameSettingType = 'boolean' | 'integer' | 'float' | 'select';

export interface GameSettingDef {
  key: string;
  type: GameSettingType;
  label: string;
  description: string;
  default: boolean | number | string;
  /** For integer/float: { min, max, step } */
  min?: number;
  max?: number;
  step?: number;
  /** For select: array of allowed string values */
  options?: string[];
}

export type GameSettingsSchema = GameSettingDef[];
export type GameSettingValues = Record<string, boolean | number | string>;

// ─── Minigame Registry ───────────────────────────────────────────

export type MinigameCategory = 'word' | 'trivia' | 'action' | 'creative';

export type JoinInProgressPolicy =
  | 'spectate_only'
  | 'join_next_subround'
  | 'join_immediately';

export interface PreloadManifest {
  images: string[];
  sounds: string[];
  data: string[];
  estimatedSizeBytes: number;
}

export interface ControlHint {
  platform: 'mobile' | 'desktop' | 'all';
  action: string;
  description: string;
}

export interface MinigameDefinition {
  id: string;
  displayName: string;
  description: string;
  category: MinigameCategory;
  icon: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedDurationSeconds: number;
  supportsTeams: boolean;
  instructionDurationSeconds: number;
  preloadAssets: PreloadManifest;
  joinInProgressPolicy: JoinInProgressPolicy;
  tags: string[];
  /** Host-configurable game settings schema (§12A). Empty = no settings. */
  settingsSchema?: GameSettingsSchema;
}

// ─── Voting ──────────────────────────────────────────────────────

export interface VoteCandidate {
  minigameId: string;
  displayName: string;
  description: string;
  category: MinigameCategory;
  icon: string;
  playerRange: string;
}

export interface VoteStartedPayload {
  candidates: VoteCandidate[];
  durationSeconds: number;
  endsAt: number;
}

export interface VoteCastPayload {
  userId: string;
  tallies: Record<string, number>;
  totalVoters: number;
  totalPlayers: number;
  /** Updated deadline when all players have voted (grace period) */
  endsAt?: number;
}

export interface VoteResultPayload {
  winnerId: string;
  winnerName: string;
  tallies: Record<string, number>;
  wasUnanimous: boolean;
}

// ─── Leaderboard ─────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  value: number;
  gamesPlayed: number;
  wins: number;
}

// ─── Errors ──────────────────────────────────────────────────────

export type RMHboxErrorCode =
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
  | 'INVALID_GAME'
  | 'INSUFFICIENT_PLAYERS'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED';

export interface RMHboxError {
  code: RMHboxErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
