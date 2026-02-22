/**
 * RMHbox — Shared Constants
 *
 * All tuning constants used by both client and server.
 * Server-specific configuration lives in server/rmhbox/config.ts.
 *
 * Reference: docs/rmhbox/design-spec/core.md §23
 */

// ─── Lobby ───────────────────────────────────────────────────────

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEFAULT_MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const ABSOLUTE_MAX_PLAYERS = 16;
export const DEFAULT_MAX_SPECTATORS = 20;
export const MAX_SPECTATORS = 50;
export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY_LENGTH = 100;

// ─── Timers ──────────────────────────────────────────────────────

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const LOBBY_IDLE_TIMEOUT_MS = 15 * 60 * 1000;       // 15 min
export const LOBBY_ABSOLUTE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 min
export const LOBBY_EMPTY_TIMEOUT_MS = 2 * 60 * 1000;       // 2 min
export const DISCONNECT_GRACE_PERIOD_MS = 120_000;          // 2 min
export const VOTE_DURATION_SECONDS = 30;
export const DEFAULT_INSTRUCTION_DURATION_SECONDS = 15;
export const PRELOAD_TIMEOUT_MS = 30_000;                   // 30 sec
export const COUNTDOWN_SECONDS = 3;
export const RESULTS_DISPLAY_SECONDS = 10;
export const LOBBY_GC_INTERVAL_MS = 60_000;                 // 1 min

// ─── Voting ──────────────────────────────────────────────────────

export const VOTE_CANDIDATE_COUNT = 5;

// ─── Rate Limits ─────────────────────────────────────────────────

export const SOCKET_RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  'rmhbox:lobby:create':       { max: 5,   windowMs: 60_000 },
  'rmhbox:lobby:join':         { max: 10,  windowMs: 60_000 },
  'rmhbox:lobby:chat':         { max: 20,  windowMs: 60_000 },
  'rmhbox:game:input':         { max: 100, windowMs: 10_000 },
  'rmhbox:game:cast_vote':     { max: 10,  windowMs: 60_000 },
  'rmhbox:leaderboard:fetch':  { max: 5,   windowMs: 60_000 },
};
