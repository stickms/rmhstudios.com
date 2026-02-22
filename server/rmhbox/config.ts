/**
 * RMHbox Server Configuration
 *
 * All tunable values for the standalone RMHbox WebSocket server.
 * Environment variables override defaults for production flexibility.
 * NEVER hardcode secrets or environment-specific values.
 */

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envString(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // ─── Network ───
  PORT: envInt('RMHBOX_PORT', 7676),
  SOCKET_PATH: envString('RMHBOX_SOCKET_PATH', '/rmhbox/'),
  CORS_ORIGIN: envString('RMHBOX_CORS_ORIGIN', process.env.SOCKET_CORS_ORIGIN || '*'),

  // ─── Socket.io Tuning ───
  MAX_HTTP_BUFFER_SIZE: envInt('RMHBOX_MAX_BUFFER', 1_048_576), // 1 MB
  PING_INTERVAL_MS: envInt('RMHBOX_PING_INTERVAL', 25_000),
  PING_TIMEOUT_MS: envInt('RMHBOX_PING_TIMEOUT', 20_000),

  // ─── Lobby ───
  ROOM_CODE_LENGTH: 6,
  ROOM_CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  DEFAULT_MAX_PLAYERS: 8,
  MIN_PLAYERS: 2,
  ABSOLUTE_MAX_PLAYERS: 16,
  DEFAULT_MAX_SPECTATORS: 20,
  MAX_SPECTATORS: 50,
  CHAT_MAX_LENGTH: 200,
  CHAT_HISTORY_LENGTH: 100,

  // ─── Timers ───
  HEARTBEAT_INTERVAL_MS: envInt('RMHBOX_HEARTBEAT_MS', 10_000),
  LOBBY_IDLE_TIMEOUT_MS: envInt('RMHBOX_IDLE_TIMEOUT', 15 * 60 * 1000),
  LOBBY_ABSOLUTE_TIMEOUT_MS: envInt('RMHBOX_ABS_TIMEOUT', 30 * 60 * 1000),
  LOBBY_EMPTY_TIMEOUT_MS: envInt('RMHBOX_EMPTY_TIMEOUT', 2 * 60 * 1000),
  DISCONNECT_GRACE_PERIOD_MS: envInt('RMHBOX_GRACE_MS', 120_000),
  VOTE_DURATION_SECONDS: 30,
  DEFAULT_INSTRUCTION_DURATION_SECONDS: 15,
  PRELOAD_TIMEOUT_MS: 30_000,
  COUNTDOWN_SECONDS: 3,
  RESULTS_DISPLAY_SECONDS: 10,
  LOBBY_GC_INTERVAL_MS: envInt('RMHBOX_GC_INTERVAL', 60_000),

  // ─── Voting ───
  VOTE_CANDIDATE_COUNT: 5,

  // ─── Rate Limits ───
  SOCKET_RATE_LIMITS: {
    'rmhbox:lobby:create':   { max: 5,   windowMs: 60_000 },
    'rmhbox:lobby:join':     { max: 10,  windowMs: 60_000 },
    'rmhbox:lobby:chat':     { max: 20,  windowMs: 60_000 },
    'rmhbox:game:input':     { max: 100, windowMs: 10_000 },
    'rmhbox:game:cast_vote': { max: 10,  windowMs: 60_000 },
    'rmhbox:leaderboard:fetch': { max: 5, windowMs: 60_000 },
  } as Record<string, { max: number; windowMs: number }>,

  // ─── Shutdown ───
  SHUTDOWN_TIMEOUT_MS: envInt('RMHBOX_SHUTDOWN_TIMEOUT', 10_000),

  // ─── Database ───
  DATABASE_URL: envString('DATABASE_URL', ''),
} as const;
