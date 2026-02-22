/**
 * RMHbox — Server-Side Type Definitions
 *
 * These types are used exclusively on the server side.
 * Shared types (used by both client and server) live in lib/rmhbox/types.ts.
 *
 * Reference: docs/rmhbox/design-spec/core.md §6.1, §7.4
 */

import type { BaseMinigame } from './minigames/base-minigame';
import type {
  LobbyState,
  LobbySettings,
  ChatMessage,
} from '../../lib/rmhbox/types';

// Re-export shared types for server convenience
export type { LobbyState, LobbySettings, ChatMessage };

// ─── Player ──────────────────────────────────────────────────────

export interface RMHboxPlayer {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string | null;     // null when disconnected
  isConnected: boolean;
  isReady: boolean;
  score: number;               // cumulative session score across rounds
  roundScore: number;          // score for current round only
  joinedAt: number;
  lastSeenAt: number;
  role: 'player';
}

// ─── Spectator ───────────────────────────────────────────────────

export interface RMHboxSpectator {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  socketId: string | null;
  isConnected: boolean;
  joinedAt: number;
  role: 'spectator';
}

// ─── Active Game ─────────────────────────────────────────────────

export interface ActiveGame {
  minigameId: string;
  handler: BaseMinigame;       // active minigame instance
  startedAt: number;
}

// ─── Match Summary (server internal) ─────────────────────────────

export interface ServerMatchSummary {
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

// ─── Lobby ───────────────────────────────────────────────────────

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
  /** Game the host has picked but not yet started. '__vote__' = vote mode. */
  selectedGame: { minigameId: string; displayName: string } | null;
  matchHistory: ServerMatchSummary[];
  roundNumber: number;
}

// ─── Minigame Context ────────────────────────────────────────────
// (Re-exported from base-minigame.ts for convenience)

export type { MinigameContext, MinigameResults } from './minigames/base-minigame';
