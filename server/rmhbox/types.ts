/**
 * RMHbox — Server-Side Type Definitions
 *
 * These types are used exclusively on the server side.
 * Shared types (used by both client and server) live in lib/rmhbox/types.ts.
 */

// ─── Lobby State Machine ───

export type LobbyState =
  | 'LOBBY'
  | 'VOTING'
  | 'INSTRUCTIONS'
  | 'PRELOADING'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'RESULTS';

// ─── Player ───

export interface RMHboxPlayer {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string | null;
  isConnected: boolean;
  isReady: boolean;
  score: number;
  joinedAt: number;
  lastPingAt: number;
}

// ─── Spectator ───

export interface RMHboxSpectator {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string | null;
  isConnected: boolean;
  joinedAt: number;
}

// ─── Lobby Settings ───

export interface LobbySettings {
  isPublic: boolean;
  maxPlayers: number;
  maxSpectators: number;
  allowMidGameJoin: boolean;
  allowSpectatorPromotion: boolean;
  autoStartThreshold: number | null;
  gameDurationOverride: number | null;
}

// ─── Active Game ───

export interface ActiveGame {
  minigameId: string;
  instance: unknown; // BaseMinigame subclass instance
  startedAt: number;
  phase: LobbyState;
}

// ─── Match Summary ───

export interface MatchSummary {
  minigameId: string;
  roundNumber: number;
  startedAt: number;
  endedAt: number;
  standings: Array<{
    userId: string;
    userName: string;
    score: number;
    rank: number;
  }>;
}

// ─── Chat ───

export interface ChatMessage {
  userId: string;
  userName: string;
  content: string;
  timestamp: number;
}

// ─── Lobby ───

export interface RMHboxLobby {
  id: string;
  hostUserId: string;
  settings: LobbySettings;
  players: Map<string, RMHboxPlayer>;
  spectators: Map<string, RMHboxSpectator>;
  state: LobbyState;
  chat: ChatMessage[];
  createdAt: number;
  lastActivityAt: number;
  currentGame: ActiveGame | null;
  matchHistory: MatchSummary[];
  roundNumber: number;
}
