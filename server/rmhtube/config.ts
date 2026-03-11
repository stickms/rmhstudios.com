/**
 * RmhTube Server Configuration
 *
 * All tunable values for the standalone RmhTube WebSocket server.
 * Environment variables override defaults for production flexibility.
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
  PORT: envInt('RMHTUBE_PORT', 7003),
  SOCKET_PATH: envString('RMHTUBE_SOCKET_PATH', '/rmhtube-ws/'),
  CORS_ORIGIN: envString('RMHTUBE_CORS_ORIGIN', process.env.SOCKET_CORS_ORIGIN || ''),

  // ─── Socket.io Tuning ───
  MAX_HTTP_BUFFER_SIZE: envInt('RMHTUBE_MAX_BUFFER', 1_048_576), // 1 MB
  PING_INTERVAL_MS: envInt('RMHTUBE_PING_INTERVAL', 25_000),
  PING_TIMEOUT_MS: envInt('RMHTUBE_PING_TIMEOUT', 20_000),

  // ─── Room ───
  ROOM_CODE_LENGTH: 6,
  ROOM_CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  DEFAULT_MAX_MEMBERS: 20,
  ABSOLUTE_MAX_MEMBERS: 50,
  MAX_QUEUE_SIZE: 100,
  CHAT_MAX_LENGTH: 300,
  CHAT_HISTORY_LENGTH: 200,

  // ─── Timers ───
  SYNC_HEARTBEAT_INTERVAL_MS: envInt('RMHTUBE_SYNC_HEARTBEAT_MS', 2_000),
  SYNC_TOLERANCE_MS: 2_000,
  ROOM_IDLE_TIMEOUT_MS: envInt('RMHTUBE_IDLE_TIMEOUT', 30 * 60 * 1000),
  ROOM_EMPTY_TIMEOUT_MS: envInt('RMHTUBE_EMPTY_TIMEOUT', 5 * 60 * 1000),
  DISCONNECT_GRACE_PERIOD_MS: envInt('RMHTUBE_GRACE_MS', 120_000),
  ROOM_GC_INTERVAL_MS: envInt('RMHTUBE_GC_INTERVAL', 60_000),

  // ─── Rate Limits ───
  SOCKET_RATE_LIMITS: {
    'rmhtube:room:create':     { max: 3,   windowMs: 60_000 },
    'rmhtube:room:join':       { max: 10,  windowMs: 60_000 },
    'rmhtube:room:chat':       { max: 30,  windowMs: 60_000 },
    'rmhtube:sync:host_state': { max: 60,  windowMs: 60_000 },
    'rmhtube:queue:add':       { max: 20,  windowMs: 60_000 },
    'rmhtube:queue:vote_skip': { max: 10,  windowMs: 60_000 },
    'rmhtube:reaction:send':   { max: 30,  windowMs: 60_000 },
    'rmhtube:chat:typing':     { max: 30,  windowMs: 60_000 },
    'rmhtube:chat:react':      { max: 30,  windowMs: 60_000 },
    'rmhtube:chat:pin':        { max: 10,  windowMs: 60_000 },
    'rmhtube:sync:set_speed':  { max: 10,  windowMs: 60_000 },
    'rmhtube:queue:vote':      { max: 20,  windowMs: 60_000 },
    'rmhtube:queue:shuffle':   { max: 5,   windowMs: 60_000 },
    'rmhtube:room:set_leader': { max: 10,  windowMs: 60_000 },
    'rmhtube:room:ban':        { max: 10,  windowMs: 60_000 },
    'rmhtube:room:unban':      { max: 10,  windowMs: 60_000 },
    'rmhtube:room:create_invite': { max: 5, windowMs: 3_600_000 },
    'rmhtube:room:set_status': { max: 10,  windowMs: 60_000 },
    'rmhtube:room:check_history': { max: 10, windowMs: 60_000 },
  } as Record<string, { max: number; windowMs: number }>,

  // ─── Shutdown ───
  SHUTDOWN_TIMEOUT_MS: envInt('RMHTUBE_SHUTDOWN_TIMEOUT', 10_000),

  // ─── Database ───
  DATABASE_URL: envString('DATABASE_URL', ''),
} as const;
